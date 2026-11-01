import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fragmentShader from './actor-surface.frag.glsl?raw';
import type { WorldDocument } from './types';
import { terrainHeight } from './world';
import { NoviceMonk } from './monk';
import { prepareHorseClips, HORSE_WALK_RATE, HORSE_GALLOP_RATE } from './horse-animation';

type Motion = 'idle' | 'walk' | 'run' | 'ride';
interface Rig {
  root: T.Group;
  mixer: T.AnimationMixer;
  actions: Partial<Record<Motion, T.AnimationAction>>;
  active?: T.AnimationAction;
}
const vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const captureCenter = new T.Vector3(0, 1.6, 0);

function makeTarget(width: number, height: number) {
  return new T.WebGLRenderTarget(width, height, {
    minFilter: T.NearestFilter,
    magFilter: T.NearestFilter,
    depthTexture: new T.DepthTexture(width, height)
  });
}

function prepareRig(model: T.Group, height: number, palette: T.Color[]): Rig {
  const bounds = new T.Box3().setFromObject(model);
  const scale = height / (bounds.max.y - bounds.min.y);
  model.scale.multiplyScalar(scale);
  model.position.y -= bounds.min.y * scale;
  const root = new T.Group();
  root.add(model);
  model.traverse(part => {
    if (!(part instanceof T.Mesh)) return;
    part.frustumCulled = false;
    const material = (index: number) => new T.MeshPhongMaterial({
      color: palette[Math.min(index, palette.length - 1)], shininess: 20
    });
    part.material = Array.isArray(part.material)
      ? part.material.map((_, index) => material(index))
      : material(0);
  });
  const mixer = new T.AnimationMixer(model);
  const actions: Rig['actions'] = {};
  for (const [motion, clip] of Object.entries(prepareHorseClips(model.animations))) {
    actions[motion as Motion] = mixer.clipAction(clip);
  }
  return { root, mixer, actions };
}

function setMotion(rig: Rig, motion: Motion, immediate = false) {
  const action = rig.actions[motion] ?? rig.actions.idle;
  if (!action || (rig.active === action && !immediate)) return;
  const previous = rig.active;
  if (immediate) rig.mixer.stopAllAction();
  const rate = motion === 'run' ? HORSE_GALLOP_RATE : motion === 'walk' ? HORSE_WALK_RATE : 1;
  const continuingStride = previous && previous !== rig.actions.idle && action !== rig.actions.idle;
  const phase = continuingStride ? previous.time / previous.getClip().duration : 0;
  action.reset().setEffectiveWeight(1).setEffectiveTimeScale(rate).play();
  if (!immediate && continuingStride) action.time = phase * action.getClip().duration;
  if (previous && previous !== action && !immediate) action.crossFadeFrom(previous, 0.14, false);
  rig.active = action;
}

export class Actors {
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera(-2.5, 2.5, 3.2, -3.2, 0.1, 30);
  readonly target = makeTarget(512, 640);
  readonly parkedTarget = makeTarget(384, 512);
  readonly group = new T.Group();
  readonly quad: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  readonly parkedQuad: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  monk?: NoviceMonk;
  horse?: Rig;
  loaded = false;
  error = '';
  private readonly moon = new T.DirectionalLight(0xcad8ff, 2);
  private readonly torch = new T.PointLight(0xffcc88, 8, 9);
  private readonly tack = new T.Group();
  private saddleBone?: T.Object3D;
  private riderHip?: T.Object3D;
  private lastMounted?: boolean;
  private readonly clipsInfo: Record<string, string[]> = {};
  private readonly saddlePosition = new T.Vector3();
  private readonly hipPosition = new T.Vector3();

  constructor(atlas: T.Texture) {
    this.scene.add(this.group, new T.HemisphereLight(0xe2e9ff, 0x848c84, 1.05), this.moon, this.torch);
    this.moon.position.set(-4, 8, 3);
    const rim = new T.DirectionalLight(0xc6d6f4, 0.9);
    rim.position.set(2, 3, -4);
    this.scene.add(rim);
    this.camera.position.set(0, 10 * 0.819152 + captureCenter.y, 10 * 0.573576);
    this.camera.lookAt(captureCenter);
    this.camera.updateMatrixWorld();
    const geometry = new T.PlaneGeometry(5, 6.4);
    const makeQuad = (target: T.WebGLRenderTarget) => {
      const material = new T.ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: {
          uMainVP: { value: new T.Matrix4() }, uGrid: { value: new T.Vector2(128, 176) },
          uColor: { value: target.texture }, uDepth: { value: target.depthTexture },
          uAtlas: { value: atlas }, uSourceInv: { value: this.camera.projectionMatrixInverse },
          uSourceWorld: { value: this.camera.matrixWorld }, uActorPosition: { value: new T.Vector3() }
        }
      });
      const quad = new T.Mesh(geometry, material);
      quad.frustumCulled = false;
      return quad;
    };
    this.quad = makeQuad(this.target);
    this.parkedQuad = makeQuad(this.parkedTarget);
    this.parkedQuad.visible = false;
  }

  async load() {
    try {
      const loader = new FBXLoader();
      const horse = await loader.loadAsync('/models/horse.fbx');
      this.monk = new NoviceMonk();
      this.horse = prepareRig(horse, 1.9, [new T.Color(0.43, 0.40, 0.36), new T.Color(0.075, 0.078, 0.084)]);
      this.saddleBone = horse.getObjectByName('Torso');
      this.riderHip = this.monk.hips;
      const saddle = new T.Mesh(new T.SphereGeometry(1, 14, 8), new T.MeshPhongMaterial({ color: 0x695044 }));
      saddle.scale.set(0.36, 0.085, 0.31);
      this.tack.add(saddle);
      this.horse.root.add(this.tack);
      this.group.add(this.monk.root, this.horse.root);
      this.clipsInfo.monk = ['Idle', 'Walk', 'Run', 'Seated'];
      this.clipsInfo.horse = horse.animations.map(c => c.name);
      this.loaded = true;
    } catch (error) {
      this.error = String(error);
      throw error;
    }
  }

  private placeRider(mounted: boolean) {
    const monk = this.monk!, horse = this.horse!;
    horse.root.updateWorldMatrix(true, true);
    horse.root.worldToLocal(this.saddleBone!.getWorldPosition(this.saddlePosition));
    this.saddlePosition.y += 0.29;
    this.saddlePosition.z -= 0.1;
    this.tack.position.copy(this.saddlePosition);
    monk.root.position.set(0, 0, 0);
    if (!mounted) return;
    monk.root.updateWorldMatrix(true, true);
    monk.root.worldToLocal(this.riderHip!.getWorldPosition(this.hipPosition));
    monk.root.position.copy(this.saddlePosition).sub(this.hipPosition);
    monk.root.position.y += 0.085;
  }

  private capture(renderer: T.WebGLRenderer, worldCamera: T.Camera, quad: typeof this.quad,
                  target: T.WebGLRenderTarget, x: number, z: number, angle: number) {
    this.group.rotation.y = angle;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    const uniforms = quad.material.uniforms;
    uniforms.uActorPosition.value.set(x, terrainHeight(x, z), z);
    uniforms.uMainVP.value.multiplyMatrices(worldCamera.projectionMatrix, worldCamera.matrixWorldInverse);
    quad.position.copy(uniforms.uActorPosition.value).add(captureCenter);
    quad.quaternion.copy(worldCamera.quaternion);
  }

  render(renderer: T.WebGLRenderer, camera: T.Camera, world: WorldDocument, dt: number, moving: boolean, fast: boolean) {
    if (!this.monk || !this.horse) return;
    const player = world.player;
    const locomotion = moving ? (fast ? 'run' : 'walk') : 'idle';
    const immediateTransition = dt === 0 && this.lastMounted !== player.mounted;
    this.monk.update(dt, player.mounted ? 'ride' : locomotion, immediateTransition);
    this.lastMounted = player.mounted;
    // A frozen frame must retain the active stride. Only an explicit mounting
    // change should replace its pose without advancing simulation time.
    if (dt > 0 || immediateTransition) {
      setMotion(this.horse, player.mounted ? locomotion : 'idle', immediateTransition);
      this.horse.mixer.update(dt);
    }
    this.placeRider(player.mounted);
    this.moon.intensity = 1.1 + world.lighting.moon * 2.7;
    this.torch.intensity = player.torch ? 8 : 0;
    this.torch.color.set(world.lighting.torchColor);
    this.torch.position.set(-0.8, 2, 1.2);
    const previousTarget = renderer.getRenderTarget();
    const previousColor = renderer.getClearColor(new T.Color());
    const previousAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0, 0);
    try {
      this.monk.root.visible = true;
      this.horse.root.visible = player.mounted;
      this.capture(renderer, camera, this.quad, this.target, player.x, player.z, player.angle);
      this.parkedQuad.visible = !player.mounted;
      if (!player.mounted) {
        this.monk.root.visible = false;
        this.horse.root.visible = true;
        this.torch.position.set(player.x - player.horse[0] - 0.8, 2, player.z - player.horse[1] + 1.2);
        this.capture(renderer, camera, this.parkedQuad, this.parkedTarget, ...player.horse, player.horseAngle ?? player.angle);
      }
    } finally {
      this.monk.root.visible = true;
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
    }
  }

  resetPose(time: number, mounted: boolean) {
    this.monk?.reset(time, mounted ? 'ride' : 'idle');
    this.lastMounted = mounted;
    for (const rig of [this.horse]) {
      if (!rig) continue;
      setMotion(rig, 'idle', true);
      rig.mixer.setTime(time);
    }
  }
  get info() { return this.clipsInfo; }
}
