import * as T from 'three';
import {Jobs,readImage,toDataURL} from './jobs';
import {Actors} from './actors';
import type {WorldDocument,GlyphAsset,ReferenceShot} from './types';
import {terrainHeight,positionForShot,grassChunks} from './world';
import {atlasGlyphs,createStream} from './stream';
import {grassVertex,grassFragment,glyphVertex,glyphFragment,groundFragment} from './shaders';
import { ChaseCamera, meadow } from './chase-camera';
import { MiniatureFocus } from './miniature-focus';

type View = 'play' | 'editor' | 'reference';
export type PlayCamera = 'chase' | 'overhead';
const dusk = new T.Color().setRGB(0.022, 0.030, 0.045);

export class ValleyRenderer {
 readonly chase = new ChaseCamera();
 private readonly overhead = new T.OrthographicCamera();
 private editorSpan = 38;
 private overheadPlaySpan = 38;
 private readonly followTarget = new T.Vector2();
 private readonly miniature: MiniatureFocus;
 focusEnabled = true;
 view: View = 'play';
 playCamera: PlayCamera = 'chase';
 get chasing() { return this.view === 'play' && this.playCamera === 'chase'; }
 get camera() { return this.chasing ? this.chase.camera : this.overhead; }
 renderer:T.WebGLRenderer;scene=new T.Scene();jobs=new Jobs();assets=new Map<string,GlyphAsset>();actors:Actors;world:WorldDocument;
 time=0;frozen=false;span=38;target=new T.Vector2(0,-2);follow=true;visibleBlades=0;generatedBlades=0;frameTimes:number[]=[];private chunks=new Map<string,T.Mesh>();private pending=new Map<string,Promise<void>>();private wantedChunks=new Set<string>();private props?:T.Mesh;private shadows:T.InstancedMesh[]=[];private actorShadow:T.Mesh;private horseShadow:T.Mesh;private water?:T.Mesh;private grassMaterial:T.ShaderMaterial;private glyphMaterial:T.ShaderMaterial;private ground:T.Mesh;private atlas:T.CanvasTexture;private last=performance.now();private chunkClock=0;
 uniforms:Record<string,T.IUniform>;selection:T.LineLoop;brush:T.LineLoop;onStats?:()=>void;
 constructor(canvas:HTMLCanvasElement,w:WorldDocument){this.world=w;this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(new URLSearchParams(location.search).has('benchmark')?1:Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(dusk);this.chase.reset(w.player);this.renderer.outputColorSpace=T.LinearSRGBColorSpace;this.atlas=this.makeAtlas();
 this.uniforms={
   uGrassTrail: {value: new T.Vector2(w.player.x, w.player.z)},
   uChase: {value: 1}, uDusk: {value: dusk}, uGrassRange: {value: new T.Vector2(meadow.fadeStart, meadow.fadeEnd)},
   uCardBasis: {value: new T.Matrix3()}, uSubjectView: {value: new T.Vector3()}, uSubjectRadius: {value: new T.Vector2()},
   uTime:{value:0},uMoon:{value:w.lighting.moon},uWind:{value:.5},uHaze:{value:.06},uPlayer:{value:new T.Vector3()},uTorchColor:{value:new T.Color(w.lighting.torchColor)},uTorch:{value:1}};
 this.grassMaterial=new T.ShaderMaterial({uniforms:this.uniforms,vertexShader:grassVertex,fragmentShader:grassFragment,side:T.DoubleSide});this.glyphMaterial=new T.ShaderMaterial({uniforms:{...this.uniforms,uAtlas:{value:this.atlas}},vertexShader:glyphVertex,fragmentShader:glyphFragment,side:T.DoubleSide});
 const groundGeo=new T.PlaneGeometry(256,256,128,128);groundGeo.rotateX(-Math.PI/2);const pa=groundGeo.attributes.position;for(let i=0;i<pa.count;i++)pa.setY(i,terrainHeight(pa.getX(i),pa.getZ(i))-.04);groundGeo.computeVertexNormals();
 this.ground=new T.Mesh(groundGeo,new T.ShaderMaterial({uniforms:{...this.uniforms,uAtlas:{value:this.atlas}},vertexShader:`varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:groundFragment}));this.scene.add(this.ground);
 this.createWater();this.actors=new Actors(this.atlas);this.scene.add(this.actors.quad,this.actors.parkedQuad);this.selection=this.ring('#bac6ae');this.brush=this.ring('#9da99d');this.scene.add(this.selection,this.brush);const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;const sc=shadowCanvas.getContext('2d')!,gradient=sc.createRadialGradient(32,32,4,32,32,32);gradient.addColorStop(0,'rgba(0,0,0,.8)');gradient.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=gradient;sc.fillRect(0,0,64,64);const sm=new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});this.actorShadow=new T.Mesh(new T.PlaneGeometry(2,2),sm);this.actorShadow.rotation.x=-Math.PI/2;this.horseShadow=this.actorShadow.clone();this.scene.add(this.actorShadow,this.horseShadow);this.selection.visible=this.brush.visible=false;
 this.miniature = new MiniatureFocus(this.renderer);
 this.resize();new ResizeObserver(()=>this.resize()).observe(canvas.parentElement!);
 }
 private makeAtlas(){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d')!;ctx.clearRect(0,0,512,512);ctx.fillStyle='#fff';ctx.font='bold 72px "Courier New", monospace';ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<atlasGlyphs.length;i++)ctx.fillText(atlasGlyphs[i],(i%8)*64+32,512-Math.floor(i/8)*64-32);const t=new T.CanvasTexture(c);t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;return t;}
 private ring(color:string){const p=[];for(let i=0;i<80;i++){let a=i/80*Math.PI*2;p.push(new T.Vector3(Math.cos(a),.04,Math.sin(a)));}return new T.LineLoop(new T.BufferGeometry().setFromPoints(p),new T.LineBasicMaterial({color,transparent:true,opacity:.7,depthTest:false}));}
 private createWater() {
   if (this.water) {
     this.scene.remove(this.water);
     this.water.geometry.dispose();
     (this.water.material as T.Material).dispose();
   }
   this.water = createStream(this.world.river, this.atlas, this.uniforms);
   this.scene.add(this.water);
 }
 async loadAssets(onProgress:(s:string)=>void){for(const [id,height,width] of [['tree',7,42],['rock',1.6,18],['ruin',3.3,32],['flowers',.5,18]] as const){onProgress(`Converting ${id} artwork into glyphs…`);const source=await toDataURL(`/art/${id}.png`);const data=await readImage(source,width);const asset=await this.jobs.convert({id,name:id,source,...data,density:1.5,normalStrength:2,palette:id==='tree'?'original':'moonlit',worldHeight:height});if(id==='tree')asset.pivot=[.83,.98];this.assets.set(id,asset);console.info('Glyph asset',id,asset.width,asset.height,asset.alpha.filter(a=>a>.15).length);}for(const a of this.world.assets)this.assets.set(a.id,a);this.rebuildProps();onProgress('Preparing the novice and loading the horse…');await this.actors.load();await this.updateChunks(true);}
 resize(){const c=this.renderer.domElement;const {width,height}=c.parentElement!.getBoundingClientRect();this.renderer.setSize(width,height,false);this.miniature.resize(this.renderer);this.updateCamera();}
 updateCamera() {
   const c = this.renderer.domElement;
   const aspect = c.clientWidth / Math.max(1, c.clientHeight);
   const cam = this.overhead;
   cam.left = -this.span / 2; cam.right = this.span / 2;
   cam.top = this.span / aspect / 2; cam.bottom = -cam.top;
   cam.near = 0.1; cam.far = 400;
   cam.position.set(this.target.x, 120 * .819152, this.target.y + 120 * .573576);
   cam.lookAt(this.target.x, 0, this.target.y);
   cam.updateProjectionMatrix();
   cam.updateMatrixWorld();
   this.chase.camera.aspect = aspect;
   this.chase.camera.updateProjectionMatrix();
 }
 setView(view: View, playCamera = this.playCamera) {
   if (view === this.view && playCamera === this.playCamera) return;
   if (this.view === 'editor') this.editorSpan = this.span;
   if (this.view === 'play' && !this.chasing) this.overheadPlaySpan = this.span;
   this.view = view;
   this.playCamera = playCamera;
   this.follow = view === 'play';
   this.chase.releaseInput();
   if (this.chasing) {
     this.chase.reset(this.world.player);
   } else if (view !== 'reference') {
     this.target.set(this.world.player.x, this.world.player.z - 1);
     this.span = view === 'editor' ? this.editorSpan : this.overheadPlaySpan;
   }
   this.uniforms.uChase.value = Number(this.chasing);
   this.renderer.setClearColor(this.chasing ? dusk : '#050710');
   this.updateCamera();
   // shot() supplies a calibrated target and schedules its own chunk update.
   if (view !== 'reference' && this.actors.loaded) void this.updateChunks();
 }
 zoomBy(delta: number) {
   if (this.chasing) this.chase.zoomBy(delta, this.frozen);
   else {
     this.span = T.MathUtils.clamp(this.span * Math.exp(delta * .001), 6, 90);
     this.updateCamera();
   }
 }
 shot(s: ReferenceShot) {
   this.setView(s.ui === 'editor' ? 'editor' : 'reference');
   this.target.set(...s.target); this.span = s.span;
   positionForShot(this.world, s);
   this.uniforms.uGrassTrail.value.set(this.world.player.x, this.world.player.z);
   this.time = s.time; this.actors.resetPose(s.time, s.mounted);
   this.follow = false; this.updateCamera(); void this.updateChunks();
 }
 screenToWorld(clientX:number,clientY:number){const r=this.renderer.domElement.getBoundingClientRect();const v=new T.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),ray=new T.Raycaster();ray.setFromCamera(v,this.camera);const out=new T.Vector3();return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),out);}
 setWorld(w: WorldDocument) {
   this.world = w;
   this.actors.resetPose(this.time, w.player.mounted);
   this.chase.reset(w.player);
   this.uniforms.uGrassTrail.value.set(w.player.x, w.player.z);
   if (this.view === 'play' && !this.chasing) {
     this.target.set(w.player.x, w.player.z - 1);
     this.updateCamera();
   }
   this.pending.clear();
   for (const a of w.assets) this.assets.set(a.id, a);
   this.updateRiver();
   this.rebuildProps();
 }
 updateRiver() {
   this.createWater();
   this.invalidateChunks();
 }
 invalidateChunks(keys?: string[]) {
   for (const key of keys ?? new Set([...this.chunks.keys(), ...this.pending.keys()])) {
     this.pending.delete(key);
     const mesh = this.chunks.get(key);
     if (mesh) { this.scene.remove(mesh); mesh.geometry.dispose(); this.chunks.delete(key); }
   }
   void this.updateChunks();
 }
 async updateChunks(wait = false) {
   const list = this.chasing
     ? grassChunks(this.world.player.x, this.world.player.z, meadow.fadeEnd + meadow.preload, true)
     : grassChunks(this.target.x, this.target.y, this.span * .65 + 12, false);
   this.wantedChunks = new Set(list.map(c => c.x + ',' + c.z));
   const work: Promise<void>[] = [];
   for (const {x, z} of list) {
     const key = x + ',' + z;
     if (this.chunks.has(key)) continue;
     let request = this.pending.get(key);
     if (!request) {
       request = this.jobs.chunk(x, z, this.world).then(data => {
         if (this.pending.get(key) !== request || !this.wantedChunks.has(key)) return;
         const mesh = this.makeGrass(data, x, z);
         this.generatedBlades += data.length / 9;
         this.chunks.set(key, mesh); this.scene.add(mesh);
       }).finally(() => {
         if (this.pending.get(key) === request) this.pending.delete(key);
       });
       this.pending.set(key, request);
     }
     if (wait) work.push(request);
   }
   for (const [key, mesh] of this.chunks) {
     if (this.wantedChunks.has(key)) continue;
     this.scene.remove(mesh); mesh.geometry.dispose(); this.chunks.delete(key);
   }
   if (wait) await Promise.all(work);
 }
 private makeGrass(data: Float32Array, cx: number, cz: number) {
   const g = new T.InstancedBufferGeometry();
   const vertices: number[] = [], uvs: number[] = [];
   for (const y of [0, .53, 1]) {
     vertices.push(-.5,y,0, .5,y,0);
     uvs.push(0,y, 1,y);
   }
   g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
   g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
   g.setIndex([0,1,2, 2,1,3, 2,3,4, 4,3,5]);
   const buffer = new T.InstancedInterleavedBuffer(data, 9);
   for (const [name, size, offset] of [
     ['aBase',2,0], ['aHeight',1,2], ['aAngle',1,3], ['aPhase',1,4], ['aColor',3,5], ['aForm',1,8]
   ] as const) g.setAttribute(name, new T.InterleavedBufferAttribute(buffer, size, offset));
   g.instanceCount = data.length / 9;
   g.boundingSphere = new T.Sphere(new T.Vector3(cx*16+8,.20,cz*16+8),12.4);
   return new T.Mesh(g,this.grassMaterial);
 }
 rebuildProps(){for(const mesh of this.shadows){this.scene.remove(mesh);mesh.geometry.dispose();const mat=mesh.material as T.MeshBasicMaterial;mat.map?.dispose();mat.dispose();}this.shadows=[];for(const [id,a] of this.assets){const objects=this.world.props.filter(p=>p.asset===id);if(!objects.length)continue;const tex=new T.TextureLoader().load(a.source);const m=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:tex,color:0x000000,opacity:.4,transparent:true,depthWrite:false}),objects.length),dummy=new T.Object3D();objects.forEach((p,i)=>{dummy.position.set(p.x+.5*p.scale,terrainHeight(p.x,p.z)+.015,p.z+.9*p.scale);dummy.rotation.set(-Math.PI/2,0,-.35);dummy.scale.set(a.worldHeight*p.scale*.6,a.worldHeight*p.scale*.8,1);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.frustumCulled=false;this.shadows.push(m);this.scene.add(m);}if(this.props){this.scene.remove(this.props);this.props.geometry.dispose();}
   const anchors: number[] = [], offsets: number[] = [], colors: number[] = [], normals: number[] = [];
   const glyphs: number[] = [], sizes: number[] = [], alphas: number[] = [], sway: number[] = [];
   for (const p of this.world.props) {
     const a = this.assets.get(p.asset);
     if (!a) continue;
     const sy = a.worldHeight * p.scale / a.height, sx = sy * .68;
     const ca = Math.cos(p.rotation), sa = Math.sin(p.rotation);
     const baseY = terrainHeight(p.x, p.z);
     for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
       const i = y * a.width + x;
       if (a.alpha[i] < .15) continue;
       const lx = (x - a.width * a.pivot[0]) * sx, ly = (a.height - y) * sy;
       // Store the old authored offset in the calibrated camera's right/up/back basis.
       // Only the basis changes when the chase camera turns. Each grid stays rooted at its prop.
       anchors.push(p.x, baseY, p.z);
       offsets.push(lx * ca - ly * sa, ly - lx * sa * .819152, lx * sa * .573576);
       colors.push(a.colors[i*3], a.colors[i*3+1], a.colors[i*3+2]);
       normals.push(a.normals[i*3], a.normals[i*3+1], a.normals[i*3+2]);
       glyphs.push(a.glyphs[i]); sizes.push(sx * 1.13); alphas.push(a.alpha[i]); sway.push(p.asset === 'tree' ? ly * .3 : 0);
     }
   }
 const g=new T.InstancedBufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,-.5,.5,0,.5,.5,0],3));g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));g.setIndex([0,1,2,2,1,3]);for(const [name,data,size] of [['aAnchor',anchors,3],['aOffset',offsets,3],['aColor',colors,3],['aNormal',normals,3],['aGlyph',glyphs,1],['aSize',sizes,1],['aAlpha',alphas,1],['aSway',sway,1]] as const)g.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(data),size));g.instanceCount=glyphs.length;this.props=new T.Mesh(g,this.glyphMaterial);this.props.frustumCulled=false;this.scene.add(this.props);}
 render(dt: number, moving: boolean, fast: boolean, turnBank = 0) {
   const world = this.world, player = world.player;
   const step = this.frozen ? 0 : dt;
   this.time += step;
   if (this.chasing) {
     this.chase.update(player, step);
   } else if (this.follow) {
     this.target.lerp(this.followTarget.set(player.x, player.z - 1), -Math.expm1(-dt * 7));
     this.updateCamera();
   }

   const u = this.uniforms, mounted = player.mounted;
   const ground = terrainHeight(player.x, player.z);
   u.uCardBasis.value.setFromMatrix4(this.camera.matrixWorld);
   u.uSubjectView.value.set(player.x, ground + (mounted ? 1.4 : .94), player.z)
     .applyMatrix4(this.camera.matrixWorldInverse);
   u.uSubjectRadius.value.set(mounted ? 1.35 : .55, mounted ? 1.65 : 1.05);
   u.uTime.value = this.time;
   u.uMoon.value = world.lighting.moon;
   u.uWind.value = world.lighting.wind;
   u.uHaze.value = world.lighting.haze;
   u.uPlayer.value.set(player.x, ground, player.z);
   const trail = u.uGrassTrail.value as T.Vector2;
   this.followTarget.set(player.x, player.z);
   if (trail.distanceToSquared(this.followTarget) > 9) trail.copy(this.followTarget);
   else trail.lerp(this.followTarget, -Math.expm1(-4.5 * step));
   u.uTorch.value = Number(player.torch);
   u.uTorchColor.value.set(world.lighting.torchColor);
   const water = this.water!.material as T.ShaderMaterial;
   water.uniforms.uReflection.value = world.lighting.reflection === 'none' ? 0 : world.lighting.reflection === 'moon' ? 1.8 : 1;

   this.actorShadow.position.set(player.x + .25, ground + .015, player.z + .3);
   this.actorShadow.rotation.z = player.angle;
   this.actorShadow.scale.set(mounted ? .9 : .45, mounted ? 1.6 : .7, 1);
   this.horseShadow.visible = !mounted;
   this.horseShadow.position.set(player.horse[0] + .25, terrainHeight(...player.horse) + .015, player.horse[1] + .3);
   this.horseShadow.rotation.z = player.horseAngle ?? player.angle;
   this.horseShadow.scale.set(.9, 1.6, 1);
   this.actors.render(this.renderer, this.camera, world, step, moving, fast, turnBank);
   this.renderer.info.autoReset = false;
   this.renderer.info.reset();
   this.drawScene();
   this.visibleBlades = 0;
   for (const mesh of this.chunks.values()) this.visibleBlades += (mesh.geometry as T.InstancedBufferGeometry).instanceCount;
   this.chunkClock += dt;
   if (this.chunkClock > .25) {
     this.chunkClock = 0;
     void this.updateChunks();
     this.onStats?.();
   }
   const now = performance.now();
   this.frameTimes.push(now - this.last);
   this.last = now;
   if (this.frameTimes.length > 1800) this.frameTimes.shift();
 }
 drawScene() {
   if (this.view === 'play' && this.focusEnabled) {
     this.miniature.render(this.renderer, this.scene, this.camera, this.uniforms.uPlayer.value, this.world.player.mounted);
   } else {
     this.renderer.render(this.scene, this.camera);
   }
 }
 stats(){const times=this.frameTimes.slice(-900).sort((a,b)=>a-b);return {visibleBlades:this.visibleBlades,residentChunks:this.chunks.size,generatedBlades:this.generatedBlades,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,median:times[Math.floor(times.length*.5)]??0,p95:times[Math.floor(times.length*.95)]??0,actorAnimations:this.actors.info,viewport:this.renderer.getDrawingBufferSize(new T.Vector2()).toArray()};}
}
