import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

interface Leg {
  upper: T.Object3D;
  lower: T.Object3D;
  tip: T.Object3D;
  hoof: T.Object3D;
  upperLength: number;
  lowerLength: number;
  pole: number;
}

// Three installs setValue dynamically when a binding is created; its current
// declaration omits that runtime method.
type WritableBinding = T.PropertyBinding & {
  setValue(values: ArrayLike<number>, offset: number): void;
};

function required(root: T.Object3D, name: string) {
  const bone = root.getObjectByName(name);
  if (!bone) throw new Error('Horse skeleton is missing ' + name);
  return bone;
}

function position(bone: T.Object3D) {
  return bone.getWorldPosition(new T.Vector3());
}

function interpolant(track: T.KeyframeTrack) {
  switch (track.getInterpolation()) {
    case T.InterpolateDiscrete: return track.InterpolantFactoryMethodDiscrete();
    case T.InterpolateSmooth: return track.InterpolantFactoryMethodSmooth();
    default: return track.InterpolantFactoryMethodLinear();
  }
}

function closeLoop(source: T.AnimationClip) {
  const closed = source.clone();
  const blendStart = Math.max(0, source.duration - 1 / 60);
  for (const track of closed.tracks) {
    const sample = interpolant(track);
    const first = Array.from(sample.evaluate(0) as Float32Array);
    const beforeEnd = Array.from(sample.evaluate(blendStart) as Float32Array);
    const size = track.getValueSize(), times: number[] = [], values: number[] = [];
    for (let i = 0; i < track.times.length && track.times[i] < blendStart; i++) {
      times.push(track.times[i]);
      for (let j = 0; j < size; j++) values.push(track.values[i * size + j]);
    }
    // Preserve sparse source curves until the final sample. Closing their last
    // key in place could otherwise alter the interpolation of an entire cycle.
    times.push(blendStart, source.duration);
    values.push(...beforeEnd, ...first);
    track.times = new Float32Array(times);
    track.values = new Float32Array(values);
  }
  return closed;
}

function pointBone(bone: T.Object3D, child: T.Object3D, target: T.Vector3) {
  const origin = position(bone);
  const from = position(child).sub(origin).normalize();
  const to = target.clone().sub(origin).normalize();
  const worldRotation = new T.Quaternion().setFromUnitVectors(from, to)
    .multiply(bone.getWorldQuaternion(new T.Quaternion()));
  const parentRotation = bone.parent!.getWorldQuaternion(new T.Quaternion()).invert();
  bone.quaternion.copy(parentRotation.multiply(worldRotation));
  bone.updateWorldMatrix(false, true);
}

type Chain = Pick<Leg, 'upper' | 'lower' | 'tip' | 'upperLength' | 'lowerLength'>;

function aimChain(leg: Chain, hip: T.Vector3, target: T.Vector3, bendToward: T.Vector3, reach: number) {
  const direction = target.clone().sub(hip);
  const distance = T.MathUtils.clamp(direction.length(), Math.abs(leg.upperLength - leg.lowerLength) + 1e-6, reach);
  direction.normalize();
  const pole = bendToward.clone().addScaledVector(direction, -bendToward.dot(direction)).normalize();
  const along = (leg.upperLength ** 2 - leg.lowerLength ** 2 + distance ** 2) / (2 * distance);
  const bend = Math.sqrt(Math.max(0, leg.upperLength ** 2 - along ** 2));
  const joint = hip.clone().addScaledVector(direction, along).addScaledVector(pole, bend);
  pointBone(leg.upper, leg.lower, joint);
  pointBone(leg.lower, leg.tip, target);
}

/** Keep the separately skinned hoof controls attached during action blending. */
export function createHorseHoofConstraint(model: T.Group): () => void {
  const pairs = ['Front', 'Back'].flatMap(part => ['L', 'R'].map(side => ({
    tip: required(model, part + 'LowLeg' + side + '_end'),
    hoof: required(model, part + 'Foot' + side)
  })));
  const target = new T.Vector3();
  return () => {
    // Quaternion interpolation and position interpolation follow different
    // curves. Use the deforming chain's endpoint after the mixer has blended
    // its rotations, otherwise the separately weighted hoof visibly detaches.
    model.updateWorldMatrix(true, true);
    for (const { tip, hoof } of pairs) {
      tip.getWorldPosition(target);
      hoof.position.copy(hoof.parent!.worldToLocal(target));
      hoof.updateWorldMatrix(false, true);
    }
  };
}

/**
 * Bake the omitted IK constraints of the source rig into deforming bone tracks.
 * The FBX contains independent animated hoof controls, but the proximal leg
 * rotations were exported nearly static. Moving the controls alone stretches
 * their weighted vertices away from the rest of each leg.
 */
export function bakeHorseLimbMotion(model: T.Group, source: T.AnimationClip): T.AnimationClip {
  // Clone the skeleton as well as the object hierarchy. Never pose the live
  // character or alter its shared bind matrices while preparing a clip.
  const rig = clone(model);
  rig.updateMatrixWorld(true);
  const body = required(rig, 'Body');
  const rootForward = new T.Vector3(0, 0, 1).transformDirection(rig.matrixWorld);
  const rootUp = new T.Vector3(0, 1, 0).transformDirection(rig.matrixWorld);
  const bindBodyRotation = body.getWorldQuaternion(new T.Quaternion()).invert();
  const legs: Leg[] = [];
  for (const part of ['Front', 'Back']) {
    for (const side of ['L', 'R']) {
      const upper = required(rig, part + 'UpLeg' + side);
      const lower = required(rig, part + 'LowLeg' + side);
      const tip = required(rig, part + 'LowLeg' + side + '_end');
      legs.push({
        upper, lower, tip, hoof: required(rig, part + 'Foot' + side),
        upperLength: position(upper).distanceTo(position(lower)),
        lowerLength: position(lower).distanceTo(position(tip)),
        // Preserve the model's anatomical fold: the fore carpus stays in front
        // of its retracting hoof, while the hind hock points backward.
        pole: part === 'Front' ? 1 : -1
      });
    }
  }
  // Body and parent rotations in the FBX also need to meet at the loop seam.
  // Close those before solving, so the leg and its parent always agree.
  const cyclic = closeLoop(source);
  const samplers = cyclic.tracks.map(track => ({
    values: interpolant(track), binding: new T.PropertyBinding(rig, track.name) as WritableBinding
  }));
  const steps = Math.max(2, Math.ceil(source.duration * 60));
  const hoofTracks = new Set(legs.map(leg => leg.hoof.name + '.position'));
  const times = [...new Set([
    ...Array.from({ length: steps + 1 }, (_, frame) => source.duration * frame / steps),
    ...cyclic.tracks.filter(track => hoofTracks.has(track.name)).flatMap(track => Array.from(track.times))
  ])].sort((a, b) => a - b);
  const output = new Map<string, number[]>();
  for (const leg of legs) {
    output.set(leg.upper.name + '.quaternion', []);
    output.set(leg.lower.name + '.quaternion', []);
    output.set(leg.hoof.name + '.position', []);
  }
  output.set(body.name + '.position', []);

  function samplePose(time: number) {
    for (const sample of samplers) sample.binding.setValue(sample.values.evaluate(time), 0);
    rig.updateMatrixWorld(true);
  }
  function requiredCompression(targets: T.Vector3[], includeHorizontal: boolean) {
    let compression = 0;
    legs.forEach((leg, index) => {
      const offset = position(leg.upper).sub(targets[index]);
      const vertical = offset.dot(rootUp);
      const horizontalSquared = includeHorizontal ? Math.max(0, offset.lengthSq() - vertical * vertical) : 0;
      const reach = (leg.upperLength + leg.lowerLength) * 0.999;
      const height = Math.sqrt(Math.max(0, reach * reach - horizontalSquared));
      compression = Math.max(compression, vertical - height);
    });
    return compression;
  }
  // The source's forelegs are almost locked straight at rest. A small, stable
  // lowering during the walk gives them room to swing through the full stance
  // path. Clamping each planted hoof instead would make it slide/reverse.
  let walkCompression = 0;
  const walking = source.name.endsWith('|Walk');
  if (walking) {
    for (const time of times) {
      samplePose(time);
      walkCompression = Math.max(walkCompression, requiredCompression(legs.map(leg => position(leg.hoof)), true));
    }
  }

  for (const time of times) {
    // Unconditional sampling matters here. AnimationMixer skips unchanged
    // constant tracks, which would otherwise retain the previous IK solution.
    samplePose(time);
    const targets = legs.map(leg => position(leg.hoof));

    // Preserve the walk's complete stance path. The stylized source gallop has
    // exaggerated horizontal targets: retain its authored body path and clamp
    // those targets instead of forcing the torso into an extreme crouch.
    const compression = Math.max(walkCompression, requiredCompression(targets, walking));
    if (compression > 0) {
      const lowered = position(body).addScaledVector(rootUp, -compression);
      body.position.copy(body.parent!.worldToLocal(lowered));
      rig.updateMatrixWorld(true);
    }
    output.get(body.name + '.position')!.push(...body.position.toArray());
    const bodyRotation = body.getWorldQuaternion(new T.Quaternion()).multiply(bindBodyRotation);
    const anatomicalForward = rootForward.clone().applyQuaternion(bodyRotation).normalize();

    legs.forEach((leg, index) => {
      const hip = position(leg.upper);
      const target = targets[index];
      const reach = (leg.upperLength + leg.lowerLength) * 0.999;
      const offset = target.clone().sub(hip);
      const vertical = offset.dot(rootUp);
      const horizontal = offset.clone().addScaledVector(rootUp, -vertical);
      const horizontalReach = Math.sqrt(Math.max(0, reach * reach - vertical * vertical));
      // Keep the hoof at ground level when an exported target is beyond reach.
      // Moving its independent control with the solved chain prevents skin
      // stretching; the leg segment translations and scales stay unchanged.
      if (horizontal.length() > horizontalReach) {
        horizontal.setLength(horizontalReach);
        target.copy(hip).addScaledVector(rootUp, vertical).add(horizontal);
      }
      aimChain(leg, hip, target, anatomicalForward.clone().multiplyScalar(leg.pole), reach);
      leg.hoof.position.copy(leg.hoof.parent!.worldToLocal(target.clone()));
      leg.hoof.updateWorldMatrix(false, true);
      for (const bone of [leg.upper, leg.lower]) {
        const values = output.get(bone.name + '.quaternion')!;
        const quaternion = bone.quaternion.clone();
        if (values.length >= 4) {
          const previous = new T.Quaternion().fromArray(values, values.length - 4);
          if (quaternion.dot(previous) < 0) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
        }
        values.push(...quaternion.toArray());
      }
      output.get(leg.hoof.name + '.position')!.push(...leg.hoof.position.toArray());
    });
  }

  const result = cyclic.clone();
  result.tracks = cyclic.tracks.filter(track => !output.has(track.name)).map(track => track.clone());
  for (const [name, values] of output) {
    result.tracks.push(name.endsWith('.quaternion')
      ? new T.QuaternionKeyframeTrack(name, times, values)
      : new T.VectorKeyframeTrack(name, times, values));
  }
  for (const sample of samplers) sample.binding.unbind();
  return result;
}

/** Layer a bank onto the current mixer pose. The frame carries both the saddle
 * and the monk. Stance hooves retain their pre-bank position and orientation;
 * swinging hooves progressively follow the tilt as they leave the ground. */
export function createHorseTurnPose(model: T.Group, frame: T.Group) {
  const legs = ['Front', 'Back'].flatMap(part => ['L', 'R'].map(side => {
    const upper = required(model, part + 'UpLeg' + side), lower = required(model, part + 'LowLeg' + side);
    const tip = required(model, part + 'LowLeg' + side + '_end'), hoof = required(model, part + 'Foot' + side);
    return {
      upper, lower, tip, hoof, upperLength: position(upper).distanceTo(position(lower)),
      lowerLength: position(lower).distanceTo(position(tip)), bindFoot: frame.worldToLocal(position(hoof)),
      upperQ: new T.Quaternion(), lowerQ: new T.Quaternion(), hoofQ: new T.Quaternion(),
      hoofP: new T.Vector3(), target: new T.Vector3(), targetQ: new T.Quaternion(), support: 0
    };
  }));
  const halfWidth = Math.max(...legs.map(leg => Math.abs(leg.bindFoot.x)));
  const ground = Math.min(...legs.map(leg => leg.bindFoot.y));
  let applied = false;
  function clear() {
    if (!applied) return;
    frame.rotation.z = 0;
    frame.position.set(0, 0, 0);
    for (const leg of legs) {
      leg.upper.quaternion.copy(leg.upperQ);
      leg.lower.quaternion.copy(leg.lowerQ);
      leg.hoof.position.copy(leg.hoofP);
      leg.hoof.quaternion.copy(leg.hoofQ);
    }
    applied = false;
  }
  function apply(roll: number) {
    clear();
    if (!roll) return;
    const side = Math.sign(roll);
    let outside = halfWidth;
    for (const leg of legs) {
      // Restore these before the next mixer update, including paused frames:
      // the mixer need not rewrite an unchanged bone on every sample.
      leg.upperQ.copy(leg.upper.quaternion);
      leg.lowerQ.copy(leg.lower.quaternion);
      leg.hoofP.copy(leg.hoof.position);
      leg.hoofQ.copy(leg.hoof.quaternion);
      leg.tip.getWorldPosition(leg.target);
      leg.hoof.getWorldQuaternion(leg.targetQ);
      const localFoot = frame.worldToLocal(leg.target.clone());
      outside = Math.max(outside, side * localFoot.x);
      const lift = localFoot.y - leg.bindFoot.y;
      leg.support = 1 - T.MathUtils.smoothstep(lift, 0.01, 0.18);
    }
    // Pivot near the outside hoof line. The inside legs can flex into the
    // turn without forcing the outside legs to stretch below ground.
    const pivot = side * outside, c = Math.cos(roll), s = Math.sin(roll);
    frame.rotation.z = roll;
    frame.position.set(pivot * (1 - c) + ground * s, ground * (1 - c) - pivot * s, 0);
    applied = true;
    model.updateWorldMatrix(true, true);
    for (const leg of legs) {
      if (!leg.support) continue;
      const hip = position(leg.upper), tip = position(leg.tip);
      const axis = tip.clone().sub(hip).normalize(), pole = position(leg.lower).sub(hip);
      pole.addScaledVector(axis, -pole.dot(axis));
      const target = tip.lerp(leg.target, leg.support);
      aimChain(leg, hip, target, pole, leg.upperLength + leg.lowerLength);
      const foot = leg.hoof;
      const rotation = foot.getWorldQuaternion(new T.Quaternion()).slerp(leg.targetQ, leg.support);
      foot.position.copy(foot.parent!.worldToLocal(position(leg.tip)));
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation));
    }
  }
  return { apply, clear };
}
