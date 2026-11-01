import * as T from 'three';
import { sampleMonkGait, type MonkMotion } from './monk-gait';

const hipHeight = 0.88;
const legLength = 0.46;
const up = new T.Vector3(0, 1, 0);
const forward = new T.Vector3(0, 0, 1);
const tau = Math.PI * 2;

function cloth(color: number) {
  return new T.MeshLambertMaterial({ color, side: T.DoubleSide });
}

function mesh(geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D) {
  const part = new T.Mesh(geometry, material);
  part.frustumCulled = false;
  parent.add(part);
  return part;
}

function oval(parent: T.Object3D, material: T.Material, scale: number[], position: number[]) {
  const part = mesh(new T.SphereGeometry(1, 16, 12), material, parent);
  part.scale.set(scale[0], scale[1], scale[2]);
  part.position.set(position[0], position[1], position[2]);
  return part;
}

function strip(parent: T.Object3D, material: T.Material, points: number[][], width: number) {
  for (let i = 1; i < points.length; i++) {
    const a = new T.Vector3(...points[i - 1] as [number, number, number]);
    const b = new T.Vector3(...points[i] as [number, number, number]);
    const part = mesh(new T.BoxGeometry(width, 1, 0.014), material, parent);
    link(part, a, b);
  }
}

function link(part: T.Mesh, a: T.Vector3, b: T.Vector3) {
  const direction = b.clone().sub(a);
  part.position.copy(a).add(b).multiplyScalar(0.5);
  part.scale.y = direction.length();
  part.quaternion.setFromUnitVectors(up, direction.normalize());
}

function tunicGeometry() {
  const rings = [[0, 0.21, 0.145], [0.15, 0.23, 0.15], [0.36, 0.245, 0.14], [0.46, 0.18, 0.11]];
  const positions: number[] = [], indices: number[] = [];
  const sides = 32;
  rings.forEach(([y, rx, rz], row) => {
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * tau;
      const fold = 1 + 0.035 * Math.cos(angle * 8);
      positions.push(Math.sin(angle) * rx * fold, y, Math.cos(angle) * rz * fold);
      if (row && i < sides) {
        const a = row * (sides + 1) + i, b = a - sides - 1;
        indices.push(b, b + 1, a, a, b + 1, a + 1);
      }
    }
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface Limb {
  upper: T.Mesh;
  lower: T.Mesh;
  end: T.Group;
}

interface RobePanel {
  geometry: T.BufferGeometry;
  side: number;
}

interface Sleeve {
  geometry: T.BufferGeometry;
  end: T.Group;
}

/** An original articulated novice, captured by the same glyph/depth pass as the horse. */
export class NoviceMonk {
  readonly root = new T.Group();
  readonly hips = new T.Group();
  readonly chest = new T.Group();
  private readonly skin = cloth(0xd4b18a);
  private readonly robe = cloth(0xa08f74);
  private readonly robeShade = cloth(0x91816a);
  private readonly linen = cloth(0xe0d2ae);
  private readonly sash = cloth(0x4c5547);
  private readonly trousers = cloth(0x514d42);
  private readonly leather = cloth(0x554331);
  private readonly arms: Sleeve[] = [];
  private readonly legs: Limb[] = [];
  private readonly panels: RobePanel[] = [];
  private readonly sashEnds: T.Mesh[] = [];
  private readonly patch: T.Mesh;
  private time = 0;
  private stride = 0;
  private riding = 0;
  private armSwing = 0;
  private bob = 0;
  private lean = 0;
  private sway = 0;
  private feet = [{ forward: 0, lift: 0 }, { forward: 0, lift: 0 }];

  constructor() {
    this.root.name = 'Novice monk';
    this.hips.name = 'Monk hips';
    this.root.add(this.hips);
    this.hips.add(this.chest);
    mesh(tunicGeometry(), this.robe, this.chest);
    // The light crossed collar and offset sash read clearly at small glyph sizes.
    strip(this.chest, this.linen, [[-0.105, 0.45, 0.1], [0.035, 0.24, 0.17], [0.18, 0.075, 0.13]], 0.027);
    strip(this.chest, this.robeShade, [[0.105, 0.45, 0.1], [-0.02, 0.27, 0.167]], 0.025);
    const neck = mesh(new T.CylinderGeometry(0.065, 0.075, 0.12, 12), this.skin, this.chest);
    neck.position.y = 0.485;
    const head = new T.Group();
    head.position.set(0, 0.70, 0);
    this.chest.add(head);
    oval(head, this.skin, [0.137, 0.163, 0.128], [0, 0, 0]);
    oval(head, this.skin, [0.026, 0.041, 0.021], [-0.125, -0.007, 0]);
    oval(head, this.skin, [0.026, 0.041, 0.021], [0.125, -0.007, 0]);
    oval(head, this.skin, [0.023, 0.030, 0.030], [0, -0.011, 0.116]);
    const features = cloth(0x514638);
    for (const side of [-1, 1]) oval(head, features, [0.011, 0.007, 0.005], [side * 0.046, 0.021, 0.111]);
    const belt = mesh(new T.CylinderGeometry(0.219, 0.224, 0.075, 32), this.sash, this.hips);
    belt.scale.z = 0.72;
    belt.position.y = 0.045;
    oval(this.hips, this.sash, [0.055, 0.035, 0.027], [-0.18, 0.04, 0.12]);
    for (const [x, length, tilt] of [[-0.19, 0.24, -0.13], [-0.155, 0.19, 0.15]]) {
      const end = mesh(new T.BoxGeometry(0.035, length, 0.012), this.sash, this.hips);
      end.position.set(x, -length / 2, 0.173);
      end.rotation.z = tilt;
      this.sashEnds.push(end);
    }

    for (const side of [-1, 1]) {
      const sleeve = this.makeSleeve();
      mesh(sleeve, this.robe, this.chest);
      const hand = new T.Group();
      this.chest.add(hand);
      oval(hand, this.skin, [0.042, 0.067, 0.038], [0, -0.035, 0]);
      this.arms.push({ geometry: sleeve, end: hand });
      const thigh = mesh(new T.CylinderGeometry(0.09, 0.075, 1, 12), this.trousers, this.hips);
      const shin = mesh(new T.CylinderGeometry(0.074, 0.05, 1, 12), this.trousers, this.hips);
      const foot = new T.Group();
      this.hips.add(foot);
      const sole = mesh(new T.BoxGeometry(0.13, 0.03, 0.255), this.leather, foot);
      sole.position.set(0, -0.043, 0.055);
      oval(foot, this.skin, [0.052, 0.038, 0.103], [0, -0.005, 0.053]);
      const ankle = mesh(new T.CylinderGeometry(0.049, 0.05, 0.09, 12), this.linen, foot);
      ankle.position.y = 0.062;
      for (const z of [0.015, 0.10]) {
        const strap = mesh(new T.BoxGeometry(0.112, 0.018, 0.026), this.leather, foot);
        strap.position.set(0, 0.025, z);
      }
      this.legs.push({ upper: thigh, lower: shin, end: foot });
      const panel = this.makePanel(side);
      mesh(panel.geometry, side < 0 ? this.robe : this.robeShade, this.hips);
      this.panels.push(panel);
    }
    this.patch = mesh(new T.PlaneGeometry(0.075, 0.09), cloth(0x9b8e74), this.hips);
    this.patch.rotation.z = -0.12;
    this.update(0, 'idle', true);
  }

  private makeSleeve() {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(5 * 17 * 3), 3).setUsage(T.DynamicDrawUsage));
    const indices: number[] = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 16; col++) {
        const a = row * 17 + col;
        indices.push(a, a + 17, a + 1, a + 1, a + 17, a + 18);
      }
    }
    geometry.setIndex(indices);
    return geometry;
  }

  private makePanel(side: number): RobePanel {
    const positions = new Float32Array(7 * 21 * 3);
    const indices: number[] = [];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 20; col++) {
        const a = row * 21 + col;
        indices.push(a, a + 1, a + 21, a + 1, a + 22, a + 21);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
    geometry.setIndex(indices);
    return { geometry, side };
  }

  private updateRobe() {
    this.panels.forEach((panel, index) => {
      const attribute = panel.geometry.getAttribute('position') as T.BufferAttribute;
      for (let row = 0; row < 7; row++) {
        const drop = row / 6;
        for (let col = 0; col < 21; col++) {
          const angle = 0.045 + col / 20 * (Math.PI - 0.09);
          const pleat = Math.cos(angle * 8) * 0.012 * drop;
          const width = 0.215 + drop * (0.085 + this.riding * 0.17);
          const x = panel.side * Math.sin(angle) * (width + pleat);
          const hem = Math.pow(drop, 2);
          const y = -0.47 * drop + hem * 0.035 * Math.cos(angle) ** 2 + this.riding * hem * 0.06;
          const z = Math.cos(angle) * (0.15 + drop * 0.055 + pleat) +
            this.feet[index].forward * hem * 0.58 + this.riding * hem * 0.24 +
            this.sway * hem * panel.side;
          attribute.setXYZ(row * 21 + col, x, y, z);
        }
      }
      attribute.needsUpdate = true;
      panel.geometry.computeVertexNormals();
    });
    this.patch.position.set(-0.17, -0.31, 0.175 + this.feet[0].forward * 0.25 + this.riding * 0.1);
    this.sashEnds.forEach((end, i) => { end.rotation.x = this.sway * 5 + Math.sin(this.time * 2 + i) * 0.035; });
  }

  private updateLeg(index: number, side: number) {
    const leg = this.legs[index];
    const hip = new T.Vector3(side * 0.12, 0, 0);
    const foot = new T.Vector3(
      side * (0.12 + this.riding * 0.25),
      -hipHeight - this.bob + 0.06 + this.feet[index].lift + this.riding * 0.09,
      this.feet[index].forward * (1 - this.riding) + this.riding * 0.16
    );
    const direction = foot.clone().sub(hip);
    const distance = Math.min(direction.length(), legLength * 2 - 0.001);
    direction.normalize();
    const bend = forward.clone().addScaledVector(direction, -forward.dot(direction)).normalize();
    const knee = hip.clone().addScaledVector(direction, distance * 0.5)
      .addScaledVector(bend, Math.sqrt(legLength ** 2 - (distance * 0.5) ** 2));
    link(leg.upper, hip, knee);
    link(leg.lower, knee, foot);
    leg.end.position.copy(foot);
    leg.end.rotation.x = this.feet[index].lift > 0.01 ? -this.feet[index].forward * 0.35 : 0;
    leg.end.rotation.y = side * (0.05 + this.riding * 0.15);
  }

  private updateArm(index: number, side: number) {
    const arm = this.arms[index];
    const angle = -side * this.armSwing * (1 - this.riding) + 0.08 + this.riding * 0.4;
    const elbowAngle = angle + 0.22 + this.stride * 0.24 + this.riding * 0.5;
    const shoulder = new T.Vector3(side * 0.225, 0.41, 0);
    const elbow = shoulder.clone().add(new T.Vector3(side * 0.045, -Math.cos(angle) * 0.265, Math.sin(angle) * 0.265));
    const wrist = elbow.clone().add(new T.Vector3(-side * this.riding * 0.09, -Math.cos(elbowAngle) * 0.22, Math.sin(elbowAngle) * 0.22));
    // One continuous cloth surface avoids the segmented, armored silhouette
    // that separate capped cylinders give the shoulder and elbow.
    const centers = [shoulder, shoulder.clone().lerp(elbow, 0.5), elbow, elbow.clone().lerp(wrist, 0.55), wrist];
    const radii = [0.085, 0.115, 0.12, 0.12, 0.105];
    const positions = arm.geometry.getAttribute('position') as T.BufferAttribute;
    centers.forEach((center, row) => {
      const tangent = centers[Math.min(4, row + 1)].clone().sub(centers[Math.max(0, row - 1)]).normalize();
      const orientation = new T.Quaternion().setFromUnitVectors(up, tangent);
      for (let col = 0; col <= 16; col++) {
        const angle = col / 16 * tau;
        const point = new T.Vector3(Math.cos(angle) * radii[row], 0, Math.sin(angle) * radii[row])
          .applyQuaternion(orientation).add(center);
        positions.setXYZ(row * 17 + col, point.x, point.y, point.z);
      }
    });
    positions.needsUpdate = true;
    arm.geometry.computeVertexNormals();
    arm.end.position.copy(wrist);
    arm.end.rotation.x = -elbowAngle;
  }

  update(dt: number, motion: MonkMotion, immediate = false) {
    if (dt === 0 && !immediate) return;
    this.time += dt;
    const gait = sampleMonkGait(this.time, motion);
    const blend = immediate ? 1 : 1 - Math.exp(-dt * 18);
    const mix = (current: number, target: number) => T.MathUtils.lerp(current, target, blend);
    this.riding = mix(this.riding, motion === 'ride' ? 1 : 0);
    this.stride = mix(this.stride, motion === 'run' ? 1 : 0);
    this.armSwing = mix(this.armSwing, gait.armSwing);
    this.bob = mix(this.bob, gait.bob);
    this.lean = mix(this.lean, gait.lean);
    this.sway = mix(this.sway, gait.clothSway);
    [gait.left, gait.right].forEach((foot, index) => {
      this.feet[index].forward = mix(this.feet[index].forward, foot.forward);
      this.feet[index].lift = mix(this.feet[index].lift, foot.lift);
    });
    this.hips.position.y = hipHeight + this.bob;
    this.chest.rotation.x = this.lean;
    this.chest.rotation.z = this.sway * 0.6;
    this.updateLeg(0, -1);
    this.updateLeg(1, 1);
    this.updateArm(0, -1);
    this.updateArm(1, 1);
    this.updateRobe();
  }

  reset(time: number, motion: MonkMotion = 'idle') {
    this.time = time;
    this.update(0, motion, true);
  }
}
