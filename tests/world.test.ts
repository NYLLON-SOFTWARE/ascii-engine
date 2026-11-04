import {describe,it,expect} from 'vitest';
import {createWorld,generateChunk,affectedChunks,History,validateWorld,canStand,findDismount,strokeWeight} from '../src/world';
import {convertPixels} from '../src/converter';
import {GrassForm, type Stroke} from '../src/types';
function brush(overrides:Partial<Stroke>={}):Stroke{return {id:'test-stroke',kind:'grass',mode:'paint',points:[[0,0]],radius:3,density:60,color:'#667755',softness:.7,seed:42,...overrides};}
describe('vegetation',()=>{
 it('grows several stem forms at seeded roots inside their own chunks', () => {
   const world = createWorld(), other = {...world, seed: world.seed + 77};
   const forms = new Set<number>();
   let tallestHead = 0, shortestGrass = Infinity;
   for (const [cx, cz] of [[-1,-1], [0,0], [3,3]]) {
     const blades = generateChunk(cx, cz, world);
     const changed = generateChunk(cx, cz, other);
     expect(Array.from(blades.slice(0, 2))).not.toEqual(Array.from(changed.slice(0, 2)));
     for (let i = 0; i < blades.length; i += 9) {
       if (Math.floor(blades[i] / 16) !== cx || Math.floor(blades[i+1] / 16) !== cz) throw Error('Root crossed its chunk boundary');
       const form = blades[i+8], height = blades[i+2];
       forms.add(form);
       if (form === GrassForm.seedHead) tallestHead = Math.max(tallestHead, height);
       if (form === GrassForm.blade) shortestGrass = Math.min(shortestGrass, height);
     }
   }
   expect(forms).toEqual(new Set(Object.values(GrassForm)));
   expect(tallestHead).toBeGreaterThan(shortestGrass * 3);
 });
 it('paints and erases blossoms without moving roots or mistaking seed heads for flowers', () => {
   const world = createWorld(), before = generateChunk(3,3,world);
   const stroke = brush({kind:'flowers', points:[[56,56]], radius:14, softness:0, density:100});
   world.strokes.push(stroke);
   const painted = generateChunk(3,3,world);
   world.strokes.push({...stroke, id:'erase-flowers', mode:'erase'});
   const erased = generateChunk(3,3,world);
   expect(erased.length).toBe(before.length);
   let added = 0, seedHeads = 0, blossomsLeft = 0, moved = false;
   for (let i=0; i<before.length; i+=9) {
     if (painted[i] !== before[i] || painted[i+1] !== before[i+1] ||
         erased[i] !== before[i] || erased[i+1] !== before[i+1]) moved = true;
     if (painted[i+8] === GrassForm.flower && before[i+8] !== GrassForm.flower) added++;
     if (erased[i+8] === GrassForm.flower) blossomsLeft++;
     if (erased[i+8] === GrassForm.seedHead) seedHeads++;
   }
   expect(moved).toBe(false);
   expect(added).toBeGreaterThan(0);
   expect(blossomsLeft).toBe(0);
   expect(seedHeads).toBeGreaterThan(0);
 });
 it('reproduces every blade from the same authoring data',()=>{const w=createWorld();expect(generateChunk(1,0,w)).toEqual(generateChunk(1,0,structuredClone(w)));});
 it('does not duplicate blades across neighboring chunk boundaries',()=>{const w=createWorld(),a=generateChunk(1,0,w),b=generateChunk(2,0,w),seen=new Set<string>();for(let i=0;i<a.length;i+=9)seen.add(`${a[i]},${a[i+1]}`);for(let i=0;i<b.length;i+=9)expect(seen.has(`${b[i]},${b[i+1]}`)).toBe(false);});
 it('erases inside a brush and leaves an unrelated chunk unchanged',()=>{const w=createWorld(),before=generateChunk(3,3,w);w.strokes.push(brush({mode:'erase',points:[[8,8]],radius:15,softness:0}));const erased=generateChunk(0,0,w);expect(erased.length).toBe(0);expect(generateChunk(3,3,w)).toEqual(before);});
 it('restyles color without reseeding blade positions',()=>{const w=createWorld(),before=generateChunk(0,0,w);w.strokes.push(brush({mode:'restyle',points:[[8,8]],radius:15,softness:0,color:'#ff0000'}));const after=generateChunk(0,0,w);expect(after.length).toBe(before.length);for(let i=0;i<after.length;i+=9){expect(after[i]).toBe(before[i]);expect(after[i+1]).toBe(before[i+1]);expect(after[i+6]).toBe(0);}});
 it('covers a stroke segment through chunks between its endpoints',()=>{const stroke=brush({points:[[-32,0],[32,0]],radius:1});expect(affectedChunks(stroke)).toContain('0,0');expect(strokeWeight(0,0,stroke)).toBe(1);});
});
describe('history and persistence',()=>{
 it('undo and redo restore immutable snapshots',()=>{const history=new History<{count:number}>(),a={count:1};history.push(a);a.count=3;expect(history.undo(a)).toEqual({count:1});expect(history.redo({count:1})).toEqual({count:3});});
 it('clears redo after a new edit',()=>{const h=new History<number>();h.push(1);h.undo(2);h.push(3);expect(h.redo(4)).toBeNull();});
 it('round-trips the authoring document without changing generated vegetation',()=>{const w=createWorld();w.strokes.push(brush());const loaded=validateWorld(JSON.parse(JSON.stringify(w)));expect(loaded).toEqual(w);expect(generateChunk(0,0,loaded)).toEqual(generateChunk(0,0,w));});
 it('rejects malformed, nonfinite and future-version documents',()=>{const w=createWorld();expect(()=>validateWorld({...w,version:2})).toThrow();expect(()=>validateWorld({...w,player:{...w.player,x:NaN}})).toThrow();expect(()=>validateWorld({...w,river:{points:[],width:7}})).toThrow();});
 it('rejects missing asset references',()=>{const w=createWorld();w.props[0].asset='absent';expect(()=>validateWorld(w)).toThrow();});
});
describe('character collisions',()=>{
 it('blocks river and map boundaries',()=>{const w=createWorld();expect(canStand(-15,0,w)).toBe(false);expect(canStand(129,0,w)).toBe(false);});
 it('finds a clear dismount position and preserves the source world',()=>{const w=createWorld(),copy=structuredClone(w),p=findDismount(w);expect(p).not.toBeNull();expect(canStand(...p!,w)).toBe(true);expect(w).toEqual(copy);});
 it('reports a blocked dismount when all surrounding space is water',()=>{const w=createWorld();w.player.x=-15;w.player.z=0;w.river.width=20;expect(findDismount(w)).toBeNull();});
});
describe('artwork conversion',()=>{
 const base={id:'asset-test',name:'Test',source:'data:image/png;base64,AA==',width:2,height:2,density:1,normalStrength:2,palette:'original' as const,worldHeight:2};
 it('preserves transparent pixels and returns unit normals',()=>{const a=convertPixels({...base,pixels:new Uint8ClampedArray([255,255,255,0,128,128,128,255,40,100,50,255,255,255,255,255])});expect(a.alpha).toEqual([0,1,1,1]);for(let i=0;i<4;i++)expect(Math.hypot(...a.normals.slice(i*3,i*3+3))).toBeCloseTo(1);});
 it('uses supplied normal maps and keeps conversions deterministic',()=>{const input={...base,pixels:new Uint8ClampedArray(16).fill(255),normalPixels:new Uint8ClampedArray([128,128,255,255,128,128,255,255,128,128,255,255,128,128,255,255])};const a=convertPixels(input);expect(a.normals[2]).toBeGreaterThan(.99);expect(a).toEqual(convertPixels(input));});
});
