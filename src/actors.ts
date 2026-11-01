import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import fragmentShader from './actor-surface.frag.glsl?raw';
import type { WorldDocument } from './types';
import { terrainHeight } from './world';

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
  for (const [motion, suffix] of [['idle', 'Idle'], ['walk', 'Walking'], ['walk', 'Walk'], ['run', 'Run']] as const) {
    const clip = model.animations.find(clip => clip.name.endsWith('|' + suffix));
    if (clip) actions[motion] = mixer.clipAction(clip);
  }
  return { root, mixer, actions };
}

function setMotion(rig: Rig, motion: Motion, immediate = false) {
  const action = rig.actions[motion] ?? rig.actions.idle;
  if (!action || (rig.active === action && !immediate)) return;
  const previous = rig.active;
  if (immediate) rig.mixer.stopAllAction();
  action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
  if (previous && previous !== action && !immediate) action.crossFadeFrom(previous, 0.14, false);
  rig.active = action;
}

function aimJoint(joint: T.Object3D, child: T.Object3D, direction: T.Vector3) {
  const from = child.getWorldPosition(new T.Vector3())
    .sub(joint.getWorldPosition(new T.Vector3())).normalize();
  const change = new T.Quaternion().setFromUnitVectors(from, direction.normalize());
  const desired = change.multiply(joint.getWorldQuaternion(new T.Quaternion()));
  joint.quaternion.copy(joint.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(desired));
  joint.updateWorldMatrix(false, true);
}

// The source knight has separate foot controls and no mounted clip. Build a
// proper animation action from its idle pose so walking restores every joint.
function makeRidingAction(model: T.Group, knight: Rig) {
  setMotion(knight, 'idle', true);
  knight.mixer.setTime(0);
  knight.root.updateMatrixWorld(true);
  const idle = knight.actions.idle!.getClip();
  const overrides = new Map<string, T.KeyframeTrack>();
  function recordRotation(joint: T.Object3D) {
    const name = joint.name + '.quaternion';
    overrides.set(name, new T.QuaternionKeyframeTrack(name, [0], joint.quaternion.toArray()));
  }
  for (const [side, sign] of [['R', -1], ['L', 1]] as const) {
    const joint = (name: string) => model.getObjectByName(name + side)!;
    const thigh = joint('UpperLeg'), shin = joint('LowerLeg');
    const ankle = model.getObjectByName('LowerLeg' + side + '_end')!;
    aimJoint(thigh, shin, new T.Vector3(sign * 0.53, -0.48, 0.68));
    aimJoint(shin, ankle, new T.Vector3(sign * 0.04, -0.93, -0.32));
    recordRotation(thigh); recordRotation(shin);
    const foot = joint('Foot');
    const footPosition = foot.parent!.worldToLocal(ankle.getWorldPosition(new T.Vector3()));
    const footTrack = foot.name + '.position';
    overrides.set(footTrack, new T.VectorKeyframeTrack(footTrack, [0], footPosition.toArray()));
    const arm = joint('UpperArm'), forearm = joint('LowerArm');
    aimJoint(arm, forearm, new T.Vector3(sign * 0.2, -0.87, 0.4));
    aimJoint(forearm, joint('Palm'), new T.Vector3(-sign * 0.4, -0.14, 0.88));
    recordRotation(arm); recordRotation(forearm);
  }
  const tracks = idle.tracks.filter(track => !overrides.has(track.name)).map(track => track.clone());
  knight.actions.ride = knight.mixer.clipAction(new T.AnimationClip('Seated', idle.duration, [...tracks, ...overrides.values()]));
  knight.mixer.stopAllAction();
  knight.active = undefined;
}

export class Actors {
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera(-2.5, 2.5, 3.2, -3.2, 0.1, 30);
  readonly target = makeTarget(512, 640);
  readonly parkedTarget = makeTarget(384, 512);
  readonly group = new T.Group();
  readonly quad: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  readonly parkedQuad: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  knight?: Rig;
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
      const [rider, horse, helmet] = await Promise.all(['knight','horse','helmet'].map(name =>
        loader.loadAsync('/models/' + name + '.fbx')));
      this.knight = prepareRig(rider, 1.82, [new T.Color(0.24, 0.32, 0.46), new T.Color(0.35, 0.27, 0.22), new T.Color(0.08, 0.10, 0.14)]);
      this.horse = prepareRig(horse, 1.9, [new T.Color(0.43, 0.40, 0.36), new T.Color(0.075, 0.078, 0.084)]);
      makeRidingAction(rider, this.knight);
      this.fitHelmet(helmet);
      this.saddleBone = horse.getObjectByName('Torso');
      this.riderHip = rider.getObjectByName('Hips');
      const saddle = new T.Mesh(new T.SphereGeometry(1, 14, 8), new T.MeshPhongMaterial({ color: 0x695044 }));
      saddle.scale.set(0.36, 0.085, 0.31);
      this.tack.add(saddle);
      this.horse.root.add(this.tack);
      this.group.add(this.knight.root, this.horse.root);
      this.clipsInfo.knight = rider.animations.map(c => c.name);
      this.clipsInfo.horse = horse.animations.map(c => c.name);
      this.loaded = true;
    } catch (error) {
      this.error = String(error);
      throw error;
    }
  }

  private fitHelmet(helmet: T.Group) {
    const rig = this.knight!;
    const head = rig.root.getObjectByName('Head')!;
    const box = new T.Box3().setFromObject(helmet);
    const scale = 0.56 / (box.max.y - box.min.y);
    helmet.scale.multiplyScalar(scale);
    const center = box.getCenter(new T.Vector3()).multiplyScalar(scale);
    helmet.position.copy(head.getWorldPosition(new T.Vector3())).sub(center);
    helmet.position.y += 0.26;
    helmet.traverse(part => {
      if (part instanceof T.Mesh) part.material = new T.MeshPhongMaterial({ color: 0x92a0b1, shininess: 55 });
    });
    rig.root.add(helmet);
    head.attach(helmet);
  }

  private placeRider(mounted: boolean) {
    const knight = this.knight!, horse = this.horse!;
    horse.root.updateWorldMatrix(true, true);
    horse.root.worldToLocal(this.saddleBone!.getWorldPosition(this.saddlePosition));
    this.saddlePosition.y += 0.29;
    this.saddlePosition.z -= 0.1;
    this.tack.position.copy(this.saddlePosition);
    knight.root.position.set(0, 0, 0);
    if (!mounted) return;
    knight.root.updateWorldMatrix(true, true);
    knight.root.worldToLocal(this.riderHip!.getWorldPosition(this.hipPosition));
    knight.root.position.copy(this.saddlePosition).sub(this.hipPosition);
    knight.root.position.y += 0.085;
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
    if (!this.knight || !this.horse) return;
    const player = world.player;
    const locomotion = moving ? (fast ? 'run' : 'walk') : 'idle';
    setMotion(this.knight, player.mounted ? 'ride' : locomotion, this.lastMounted !== player.mounted);
    setMotion(this.horse, player.mounted ? locomotion : 'idle');
    this.lastMounted = player.mounted;
    this.knight.mixer.update(dt);
    this.horse.mixer.update(dt);
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
      this.knight.root.visible = true;
      this.horse.root.visible = player.mounted;
      this.capture(renderer, camera, this.quad, this.target, player.x, player.z, player.angle);
      this.parkedQuad.visible = !player.mounted;
      if (!player.mounted) {
        this.knight.root.visible = false;
        this.horse.root.visible = true;
        this.torch.position.set(player.x - player.horse[0] - 0.8, 2, player.z - player.horse[1] + 1.2);
        this.capture(renderer, camera, this.parkedQuad, this.parkedTarget, ...player.horse, player.horseAngle ?? player.angle);
      }
    } finally {
      this.knight.root.visible = true;
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
    }
  }

  resetPose(time: number) {
    for (const rig of [this.knight, this.horse]) {
      if (!rig) continue;
      setMotion(rig, 'idle', true);
      rig.mixer.setTime(time);
    }
    this.lastMounted = undefined;
  }
  get info() { return this.clipsInfo; }
}
