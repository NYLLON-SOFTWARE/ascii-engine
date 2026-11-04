import {GrassForm, type WorldDocument, type Stroke, type V2, type ReferenceShot} from './types';
export const WORLD_SIZE=256, CHUNK_SIZE=16;
export const GLYPHS=' .,:;!|/\\-_=+*oO08QbdpqwmMWN#%@&';
export function hash(x:number,z:number,seed:number){let h=Math.imul(x^seed,374761393)+Math.imul(z,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
export function rng(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export const distance=(a:V2,b:V2)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function segmentDistance(x:number,z:number,a:V2,b:V2){const dx=b[0]-a[0],dz=b[1]-a[1];const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
export function riverDistance(x:number,z:number,w:WorldDocument){let d=Infinity;for(let i=1;i<w.river.points.length;i++)d=Math.min(d,segmentDistance(x,z,w.river.points[i-1],w.river.points[i]));return d;}
export function pathX(z:number){return 10+Math.sin(z*.055)*5+Math.sin(z*.13)*1.5;}
export function terrainHeight(x:number,z:number){return Math.sin(x*.06)*Math.cos(z*.045)*.28;}
export const shots:ReferenceShot[]=[
 {id:'opening',name:'00:00 · Ruins at dusk',timestamp:0,target:[0,-2],span:38,player:[0,3],angle:.2,mounted:true,time:0,ui:'play'},
 {id:'closeup',name:'00:05 · Rider & glyphs',timestamp:5,target:[0,1],span:9,player:[0,2],angle:1.15,mounted:true,time:5,ui:'play'},
 {id:'map',name:'00:14 · World map',timestamp:14,target:[0,-4],span:38,player:[0,-4],angle:0,mounted:false,time:14,ui:'map'},
 {id:'riverbank',name:'00:23 · Riverbank',timestamp:23,target:[-1,-26],span:38,player:[-1,-24],angle:Math.PI,mounted:false,time:23,ui:'play'},
 {id:'editor',name:'00:37 · Nature editor',timestamp:37,target:[8,-42],span:38,player:[8,-40],angle:0,mounted:false,time:37,ui:'editor'}
];
export function createWorld():WorldDocument {
 const rand=rng(82173), props:WorldDocument['props']=[];
 const add=(asset:string,x:number,z:number,scale=1)=>props.push({id:`prop-${props.length}`,asset,x,z,rotation:(rand()-.5)*.16,scale});
 for(let i=0;i<125;i++){let x=rand()*150-65,z=rand()*190-95;if(Math.abs(x-pathX(z))<4||Math.abs(x)<5&&z>-15&&z<12)continue;add('tree',x,z,.7+rand()*.6);}
 for(let i=0;i<150;i++){let x=rand()*120-48,z=rand()*160-80;add('rock',x,z,.4+rand()*.9);}
 [[-3,-4],[0,-6],[3,-5],[4,-2]].forEach(([x,z],i)=>add('ruin',x,z,i===1?1.3:.9));
 add('tree',8,-8,1.1);add('tree',12,3,.9);add('rock',2.4,1,.9);add('rock',-3,4,.8);add('tree',4,-3,1);add('tree',-5,-12,1.1);add('rock',-2,-1,.7);
 return {version:1,name:'Glyph Valley',seed:82173,size:256,props,strokes:[],river:{points:[[-55,-128],[-36,-80],[-24,-50],[-18,-25],[-15,0],[-28,35],[-22,65],[-39,100],[-46,128]],width:8.5},lighting:{moon:.38,wind:.5,haze:.06,torchColor:'#e5bd72',reflection:'night sky'},player:{x:0,z:3,angle:Math.PI,mounted:false,torch:true,horse:[2.7,2.4],horseAngle:-1.78},assets:[]};
}
export function strokeWeight(x:number,z:number,s:Stroke){let d=Infinity;if(s.points.length===1)d=Math.hypot(x-s.points[0][0],z-s.points[0][1]);else for(let i=1;i<s.points.length;i++)d=Math.min(d,segmentDistance(x,z,s.points[i-1],s.points[i]));if(d>=s.radius)return 0;return Math.min(1,(s.radius-d)/Math.max(.01,s.radius*s.softness));}
export function colorRGB(hex:string):[number,number,number]{return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255];}
/** Load the nearest chunks first. An all-direction preload ring lets the
 * trailing camera turn around without exposing an empty wedge of meadow. */
export function grassChunks(x: number, z: number, radius: number, circular: boolean) {
  const result: { x: number; z: number; distance: number }[] = [];
  for (let cz = Math.max(-8, Math.floor((z - radius) / 16)); cz <= Math.min(7, Math.floor((z + radius) / 16)); cz++) {
    for (let cx = Math.max(-8, Math.floor((x - radius) / 16)); cx <= Math.min(7, Math.floor((x + radius) / 16)); cx++) {
      const dx = Math.abs(cx * 16 + 8 - x), dz = Math.abs(cz * 16 + 8 - z);
      if (circular && Math.hypot(Math.max(0, dx - 8), Math.max(0, dz - 8)) > radius) continue;
      result.push({ x: cx, z: cz, distance: dx * dx + dz * dz });
    }
  }
  return result.sort((a, b) => a.distance - b.distance);
}

function smooth(lo: number, hi: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

// Sample in world coordinates so a broad patch can continue through any chunk boundary.
function field(x: number, z: number, seed: number) {
  const i = Math.floor(x), j = Math.floor(z);
  const u = smooth(0, 1, x - i), v = smooth(0, 1, z - j);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed);
  const c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function generateChunk(cx: number, cz: number, w: WorldDocument): Float32Array {
  if (cx < -8 || cx > 7 || cz < -8 || cz > 7) return new Float32Array();
  const data: number[] = [], seed = w.seed, key = cx + ',' + cz;
  const strokes = w.strokes.filter(s => affectedChunks(s).includes(key))
    .map(stroke => ({stroke, ink: colorRGB(stroke.color)}));
  const wetMargin = Math.min(1.4, w.river.width * .21);
  // Each half-metre cell owns 25 jittered candidates. Some gather around a
  // shared crown, others grow in the gaps. Both remain inside their owning cell.
  for (let tz = cz * 32; tz < (cz + 1) * 32; tz++) for (let tx = cx * 32; tx < (cx + 1) * 32; tx++) {
    const crownX = (tx + .06 + .88 * hash(tx, tz, seed + 41)) * .5;
    const crownZ = (tz + .06 + .88 * hash(tx, tz, seed + 42)) * .5;
    const meadow = field(crownX * .24 + crownZ * .07, crownZ * .22 - crownX * .08, seed + 43);
    const dryness = field(crownX * .15 - crownZ * .08, crownZ * .18 + crownX * .04, seed + 44);
    const lush = smooth(.22, .78, meadow), vigour = hash(tx, tz, seed + 45);
    const densityAtCrown = .18 + .48 * lush + .22 * vigour;
    const lay = 6.283 * field(crownX * .20, crownZ * .20, seed + 46) + (vigour - .5) * 1.4;
    const leanX = .24 * Math.cos(lay), leanZ = .24 * Math.sin(lay);
    const gather = .19 + .56 * vigour * vigour;
    const flowers = .0006 + .019 * smooth(.58, .85, meadow) * hash(tx, tz, seed + 47);
    const seedPatch = dryness > .40 && hash(tx, tz, seed + 48) > .66;
    for (let iz = tz * 5; iz < tz * 5 + 5; iz++) for (let ix = tx * 5; ix < tx * 5 + 5; ix++) {
      const looseX = (ix + .03 + .94 * hash(ix, iz, seed)) * .10;
      const looseZ = (iz + .03 + .94 * hash(ix, iz, seed + 1)) * .10;
      const clustered = hash(ix, iz, seed + 2) < .46 + .29 * vigour;
      const x = clustered ? looseX + (crownX - looseX) * gather : looseX;
      const z = clustered ? looseZ + (crownZ - looseZ) * gather : looseZ;
      const bank = riverDistance(x, z, w) - w.river.width * .5;
      if (bank < -wetMargin * .42) continue;
      const track = smooth(1.05, 2.45, Math.abs(x - pathX(z)));
      let density = .008 + (densityAtCrown - .008) * track;
      const damp = 1 - smooth(.2, 4, bank);
      const straw = Math.max(0, Math.min(1, dryness + (vigour - .5) * .16 - damp * .37));
      let red = .155 + .16 * straw, green = .29 + .070 * straw, blue = .28 - .050 * straw;
      let bloom = hash(ix, iz, seed + 3) < flowers;
      for (const {stroke, ink} of strokes) {
        const weight = strokeWeight(x, z, stroke);
        if (!weight) continue;
        if (stroke.kind === 'flowers') {
          const chance = hash(ix, iz, stroke.seed);
          if (stroke.mode === 'erase') { if (chance < weight) bloom = false; }
          else if (chance < weight * stroke.density / 180) bloom = true;
        } else if (stroke.mode === 'erase') {
          density *= 1 - weight;
        } else {
          if (stroke.mode === 'paint') density += (Math.min(1, stroke.density / 100) - density) * weight;
          red += (ink[0] - red) * weight; green += (ink[1] - green) * weight; blue += (ink[2] - blue) * weight;
        }
      }
      density *= smooth(-wetMargin * .42, wetMargin * 1.13, bank);
      if (hash(ix, iz, seed + 4) >= density) continue;
      const trait = hash(ix, iz, seed + 5), size = hash(ix, iz, seed + 6);
      const seedHead = seedPatch && trait < .095;
      const broad = trait > .98 - .28 * lush - .35 * damp;
      const form = bloom ? GrassForm.flower : seedHead ? GrassForm.seedHead : broad ? GrassForm.ribbon : GrassForm.blade;
      let height = (.080 + .12 * size + .065 * lush) * (.74 + .61 * vigour);
      if (!clustered) height *= .76 + .20 * size;
      if (form === GrassForm.seedHead) height = .28 + .19 * size + .055 * vigour;
      if (form === GrassForm.ribbon) height += .055 + .09 * damp;
      if (bloom) height = .18 + .18 * size;
      const fan = clustered ? Math.atan2(4 * (looseZ - crownZ) + leanZ, 4 * (looseX - crownX) + leanX) : lay;
      const angle = fan + (hash(ix, iz, seed + 7) - .5) * (clustered ? 1.1 : 3.8);
      const shade = .60 + .21 * meadow + .23 * vigour + .24 * hash(ix, iz, seed + 8);
      data.push(x, z, height, angle, hash(ix, iz, seed + 9) * 6.283, red * shade, green * shade, blue * shade, form);
    }
  }
  return new Float32Array(data);
}
export function affectedChunks(s:Stroke){const keys=new Set<string>();for(let i=0;i<s.points.length;i++){const a=s.points[i],b=s.points[Math.max(0,i-1)];for(let z=Math.floor((Math.min(a[1],b[1])-s.radius)/16);z<=Math.floor((Math.max(a[1],b[1])+s.radius)/16);z++)for(let x=Math.floor((Math.min(a[0],b[0])-s.radius)/16);x<=Math.floor((Math.max(a[0],b[0])+s.radius)/16);x++)keys.add(`${x},${z}`);}return [...keys];}
export function canStand(x:number,z:number,w:WorldDocument,radius=.35){if(Math.abs(x)>126||Math.abs(z)>126||riverDistance(x,z,w)<w.river.width*.5+radius)return false;for(const p of w.props){const asset=w.assets.find(a=>a.id===p.asset);const r=(asset?.footprint??(p.asset==='tree'?.3:p.asset==='rock'?.55:.9))*p.scale;if(Math.hypot(x-p.x,z-p.z)<r+radius)return false;}return true;}
export function findDismount(w:WorldDocument):V2|null{for(let i=0;i<12;i++){const a=w.player.angle+Math.PI/2+i*Math.PI/6;const x=w.player.x+Math.sin(a)*1.8,z=w.player.z+Math.cos(a)*1.8;if(canStand(x,z,w))return [x,z];}return null;}
export function changeMount(world: WorldDocument) {
  const player = world.player;
  if (player.mounted) {
    const landing = findDismount(world);
    if (!landing) return 'blocked' as const;
    player.horse = [player.x, player.z];
    player.horseAngle = player.angle;
    [player.x, player.z] = landing;
    player.mounted = false;
    return 'dismounted' as const;
  }
  if (distance([player.x, player.z], player.horse) > 3) return 'far' as const;
  if (!canStand(...player.horse, world, 0.55)) return 'obstructed' as const;
  [player.x, player.z] = player.horse;
  player.angle = player.horseAngle ?? player.angle;
  player.mounted = true;
  return 'mounted' as const;
}

export function positionForShot(world: WorldDocument, shot: ReferenceShot) {
  const player = world.player;
  [player.x, player.z] = shot.player;
  player.angle = shot.angle;
  player.mounted = shot.mounted;
  player.horseAngle = shot.angle;
  player.horse = shot.mounted ? [...shot.player] : findDismount(world) ?? player.horse;
}
export function validateWorld(input:unknown):WorldDocument {
 if(!input||typeof input!=='object')throw Error('This is not a world document.');const w=input as WorldDocument;
 if(w.version!==1)throw Error('Unsupported world version. Expected version 1.');
 const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v),v2=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(finite);
 if(w.size!==256||!finite(w.seed)||typeof w.name!=='string'||!Array.isArray(w.props)||!Array.isArray(w.strokes)||!Array.isArray(w.assets)||!w.player||!w.lighting||!w.river)throw Error('World document is incomplete.');
 if(![w.player.x,w.player.z,w.player.angle,w.lighting.moon,w.lighting.wind,w.lighting.haze,w.river.width].every(finite)||!v2(w.player.horse)||typeof w.player.mounted!=='boolean'||typeof w.player.torch!=='boolean'||!['night sky','moon','none'].includes(w.lighting.reflection)||!/^#[\da-f]{6}$/i.test(w.lighting.torchColor))throw Error('Invalid player, river or lighting settings.');
 if(!Array.isArray(w.river.points)||w.river.points.length<2||!w.river.points.every(v2)||w.river.width<.5||w.river.width>40)throw Error('Invalid river.');
 if(w.props.length>20000||w.strokes.length>20000||w.assets.length>100)throw Error('World exceeds editor limits.');
 const ids=new Set<string>(['tree','rock','ruin','flowers']);
 for(const a of w.assets){if(typeof a.id!=='string'||!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<1||a.height<1||a.width>256||a.height>256||typeof a.source!=='string'||!a.source.startsWith('data:image/png;base64,')||!v2(a.pivot)||![a.footprint,a.worldHeight].every(finite))throw Error('Invalid glyph asset.');const n=a.width*a.height;for(const [k,len] of [['glyphs',n],['colors',n*3],['alpha',n],['normals',n*3]] as const)if(!Array.isArray(a[k])||a[k].length!==len||!a[k].every(finite))throw Error('Invalid glyph grid.');ids.add(a.id);}
 for(const p of w.props)if(typeof p.id!=='string'||!ids.has(p.asset)||![p.x,p.z,p.rotation,p.scale].every(finite)||p.scale<=0||p.scale>20)throw Error('Invalid placed object.');
 for(const s of w.strokes)if(!['grass','flowers'].includes(s.kind)||!['paint','erase','restyle'].includes(s.mode)||!Array.isArray(s.points)||!s.points.length||!s.points.every(v2)||![s.radius,s.density,s.softness,s.seed].every(finite)||s.radius<=0||s.radius>40||s.softness<0||s.softness>1||!/^#[\da-f]{6}$/i.test(s.color))throw Error('Invalid paint stroke.');
 if (w.player.horseAngle !== undefined && !finite(w.player.horseAngle)) throw Error('Invalid horse heading.');
 const copy = structuredClone(w);
 copy.player.horseAngle ??= copy.player.angle;
 return copy;
}
export class History<T>{private undoStack:T[]=[];private redoStack:T[]=[];push(before:T){this.undoStack.push(structuredClone(before));if(this.undoStack.length>60)this.undoStack.shift();this.redoStack=[];}undo(current:T):T|null{const v=this.undoStack.pop();if(!v)return null;this.redoStack.push(structuredClone(current));return v;}redo(current:T):T|null{const v=this.redoStack.pop();if(!v)return null;this.undoStack.push(structuredClone(current));return v;}get size(){return this.undoStack.length;}}
