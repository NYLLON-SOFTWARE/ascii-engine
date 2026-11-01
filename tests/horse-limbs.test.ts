import { readFileSync } from 'node:fs';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { describe, expect, it } from 'vitest';
import { prepareHorseClips } from '../src/horse-animation';
import { bakeHorseLimbMotion, createHorseHoofConstraint } from '../src/horse-limbs';

function horse() {
  const bytes = readFileSync(new URL('../public/models/horse.fbx', import.meta.url));
  const model = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const box = new T.Box3().setFromObject(model);
  const scale = 1.9 / box.getSize(new T.Vector3()).y;
  model.scale.multiplyScalar(scale);
  model.position.y -= box.min.y * scale;
  new T.Group().add(model);
  model.updateWorldMatrix(true, true);
  return model;
}

function point(model: T.Group, name: string) {
  return model.getObjectByName(name)!.getWorldPosition(new T.Vector3());
}

function pose(model: T.Group, clip: T.AnimationClip, time: number) {
  for (const track of clip.tracks) {
    const binding = new T.PropertyBinding(model, track.name) as T.PropertyBinding & {
      setValue(values: ArrayLike<number>, offset: number): void;
    };
    binding.setValue(track.InterpolantFactoryMethodLinear().evaluate(time), 0);
    binding.unbind();
  }
  model.updateWorldMatrix(true, true);
}

const keys = ['FrontL', 'FrontR', 'BackL', 'BackR'];
const names = (key: string) => {
  const part = key.slice(0, -1), side = key.slice(-1);
  return { upper: part + 'UpLeg' + side, lower: part + 'LowLeg' + side,
    tip: part + 'LowLeg' + side + '_end', foot: part + 'Foot' + side };
};

describe('connected horse limbs', () => {
  it('rotates each proximal leg and follows each hoof with a connected chain', () => {
    const model = horse();
    const { walk } = prepareHorseClips(model.animations);
    const corrected = bakeHorseLimbMotion(model, walk);
    const angles = new Map<string, T.Quaternion[]>();
    let worstGap = 0;
    for (let frame = 0; frame < 80; frame++) {
      pose(model, corrected, frame / 80 * corrected.duration);
      for (const key of keys) {
        const n = names(key);
        worstGap = Math.max(worstGap, point(model, n.tip).distanceTo(point(model, n.foot)));
        const samples = angles.get(key) ?? [];
        samples.push(model.getObjectByName(n.upper)!.quaternion.clone());
        angles.set(key, samples);
      }
    }
    expect(worstGap).toBeLessThan(0.006);
    for (const rotations of angles.values()) {
      const range = Math.max(...rotations.map(rotation => rotation.angleTo(rotations[0])));
      expect(range).toBeGreaterThan(0.35);
    }
  });

  it('preserves leg segment lengths through walking and galloping', () => {
    const model = horse();
    const originals = new Map(keys.map(key => {
      const n = names(key);
      return [key, [point(model, n.upper).distanceTo(point(model, n.lower)), point(model, n.lower).distanceTo(point(model, n.tip))]];
    }));
    for (const clip of Object.values(prepareHorseClips(model.animations)).filter(clip => !clip.name.endsWith('|Idle'))) {
      const corrected = bakeHorseLimbMotion(model, clip);
      for (let frame = 0; frame < 40; frame++) {
        pose(model, corrected, frame / 40 * corrected.duration);
        for (const key of keys) {
          const n = names(key), lengths = originals.get(key)!;
          expect(point(model, n.upper).distanceTo(point(model, n.lower))).toBeCloseTo(lengths[0], 5);
          expect(point(model, n.lower).distanceTo(point(model, n.tip))).toBeCloseTo(lengths[1], 5);
          expect(point(model, n.tip).distanceTo(point(model, n.foot))).toBeLessThan(0.01);
        }
      }
    }
  });

  it('retains the different front and hind joint bend directions', () => {
    const model = horse();
    const corrected = bakeHorseLimbMotion(model, prepareHorseClips(model.animations).walk);
    for (let frame = 0; frame < 40; frame++) {
      pose(model, corrected, frame / 40 * corrected.duration);
      for (const key of keys) {
        const n = names(key), a = point(model, n.upper), b = point(model, n.lower), c = point(model, n.tip);
        const line = c.clone().sub(a).normalize();
        const jointOffset = b.clone().sub(a);
        jointOffset.addScaledVector(line, -jointOffset.dot(line));
        expect(jointOffset.z * (key.startsWith('Front') ? 1 : -1)).toBeGreaterThan(0);
      }
    }
  });

  it('preserves the walking hoof paths without adding body bounce', () => {
    const model = horse();
    const source = prepareHorseClips(model.animations).walk;
    const corrected = bakeHorseLimbMotion(model, source);
    let worstTargetError = 0;
    const bodyDrops: number[] = [];
    for (let frame = 0; frame < 160; frame++) {
      const time = frame / 160 * source.duration;
      pose(model, source, time);
      const targetFeet = keys.map(key => point(model, names(key).foot));
      const bodyHeight = point(model, 'Body').y;
      pose(model, corrected, time);
      bodyDrops.push(bodyHeight - point(model, 'Body').y);
      keys.forEach((key, index) => {
        worstTargetError = Math.max(worstTargetError,
          point(model, names(key).foot).distanceTo(targetFeet[index]));
      });
    }
    expect(worstTargetError).toBeLessThan(0.006);
    expect(Math.max(...bodyDrops) - Math.min(...bodyDrops)).toBeLessThan(0.003);
    expect(Math.max(...bodyDrops)).toBeLessThan(0.1);
  });

  it('keeps at least two actual world-space hooves grounded throughout the walk', () => {
    const model = horse();
    const source = prepareHorseClips(model.animations).walk;
    const corrected = bakeHorseLimbMotion(model, source);
    const attachHooves = createHorseHoofConstraint(model);
    const ground = keys.map(() => Infinity);
    for (let frame = 0; frame < 80; frame++) {
      pose(model, source, frame / 80 * source.duration);
      keys.forEach((key, index) => ground[index] = Math.min(ground[index], point(model, names(key).foot).y));
    }
    for (let frame = 0; frame < 2000; frame++) {
      pose(model, corrected, (frame + 0.419) / 2000 * corrected.duration);
      attachHooves();
      const supports = keys.filter((key, index) =>
        Math.abs(point(model, names(key).foot).y - ground[index]) < 0.003);
      expect(supports.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('retains the gallop body height rather than forcing exaggerated targets into a crouch', () => {
    const model = horse();
    const source = prepareHorseClips(model.animations).run;
    const corrected = bakeHorseLimbMotion(model, source);
    let greatestDrop = 0;
    for (let frame = 0; frame < 160; frame++) {
      const time = frame / 160 * source.duration;
      pose(model, source, time);
      const height = point(model, 'Body').y;
      pose(model, corrected, time);
      greatestDrop = Math.max(greatestDrop, height - point(model, 'Body').y);
    }
    expect(greatestDrop).toBeLessThan(0.03);
  });

  it('keeps hoof controls attached between baked samples', () => {
    const model = horse();
    const { walk, run } = prepareHorseClips(model.animations);
    const corrected = [bakeHorseLimbMotion(model, walk), bakeHorseLimbMotion(model, run)];
    let worstGap = 0;
    for (const clip of corrected) {
      for (let frame = 0; frame < 173; frame++) {
        pose(model, clip, (frame + 0.347) / 173 * clip.duration);
        for (const key of keys) {
          const n = names(key);
          worstGap = Math.max(worstGap, point(model, n.tip).distanceTo(point(model, n.foot)));
        }
      }
    }
    expect(worstGap).toBeLessThan(0.01);
  });

  it('keeps transition poses finite and connected while actions crossfade', () => {
    const model = horse();
    const source = prepareHorseClips(model.animations);
    const walk = bakeHorseLimbMotion(model, source.walk);
    const run = bakeHorseLimbMotion(model, source.run);
    const mixer = new T.AnimationMixer(model);
    const attachHooves = createHorseHoofConstraint(model);
    let worstGap = 0;
    for (const [from, to] of [[source.idle, walk], [walk, run]]) {
      for (let phase = 0; phase < 24; phase++) {
        const first = mixer.clipAction(from).reset().play();
        const second = mixer.clipAction(to).reset().play();
        first.time = phase / 24 * from.duration;
        second.time = phase / 24 * to.duration;
        for (let step = 0; step <= 10; step++) {
          first.setEffectiveWeight(1 - step / 10);
          second.setEffectiveWeight(step / 10);
          mixer.update(0);
          attachHooves();
          for (const key of keys) {
            const n = names(key);
            const gap = point(model, n.tip).distanceTo(point(model, n.foot));
            expect(Number.isFinite(gap)).toBe(true);
            worstGap = Math.max(worstGap, gap);
          }
        }
        mixer.stopAllAction();
      }
    }
    expect(worstGap).toBeLessThan(1e-6);
  });

  it('keeps looping poses continuous and does not mutate the source model or clips', () => {
    const model = horse();
    const source = prepareHorseClips(model.animations).walk;
    const beforeClip = T.AnimationClip.toJSON(source);
    const beforePose: number[][] = [];
    model.traverse(part => beforePose.push([...part.position.toArray(), ...part.quaternion.toArray(), ...part.scale.toArray()]));
    const corrected = bakeHorseLimbMotion(model, source);
    const afterPose: number[][] = [];
    model.traverse(part => afterPose.push([...part.position.toArray(), ...part.quaternion.toArray(), ...part.scale.toArray()]));
    expect(afterPose).toEqual(beforePose);
    expect(T.AnimationClip.toJSON(source)).toEqual(beforeClip);
    pose(model, corrected, 0);
    const start = keys.map(key => point(model, names(key).lower));
    pose(model, corrected, corrected.duration);
    keys.forEach((key, index) => expect(point(model, names(key).lower).distanceTo(start[index])).toBeLessThan(1e-6));
  });
});
