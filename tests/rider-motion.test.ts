import { readFileSync } from 'node:fs';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { describe, expect, it } from 'vitest';
import { prepareHorseClips } from '../src/horse-animation';
import { bakeHorseLimbMotion } from '../src/horse-limbs';
import { sampleRiderMotion, type RiderPose } from '../src/rider-motion';

const keys = ['seatLift', 'seatForward', 'pelvisPitch', 'pelvisRoll', 'lean', 'torsoRoll', 'headPitch', 'clothSway', 'headRoll'] as const;
const sample = (phase: number, runWeight = 1, walkWeight = 0) =>
  sampleRiderMotion({ walkPhase: phase, runPhase: phase, walkWeight, runWeight });
const range = (values: number[]) => Math.max(...values) - Math.min(...values);

describe('horse-driven rider motion', () => {
  it('has a neutral idle seat and deterministic periodic poses', () => {
    for (const phase of [-0.31, 0, 0.27, 0.99, 15.75]) {
      expect(Object.values(sample(phase, 0, 0))).toEqual(keys.map(() => 0));
      const pose = sample(phase);
      expect(sample(phase)).toEqual(pose);
      for (const key of keys) expect(sample(phase + 3)[key]).toBeCloseTo(pose[key], 12);
    }
  });

  it('uses a restrained walk and a distinct forward light seat for galloping', () => {
    const walk = Array.from({ length: 120 }, (_, i) => sample(i / 120, 0, 1));
    const run = Array.from({ length: 120 }, (_, i) => sample(i / 120));
    expect(Math.min(...run.map(pose => pose.lean))).toBeGreaterThan(0.22);
    expect(Math.max(...walk.map(pose => pose.lean))).toBeLessThan(0.08);
    expect(range(run.map(pose => pose.seatLift))).toBeGreaterThan(range(walk.map(pose => pose.seatLift)) * 3);
    for (const pose of [...walk, ...run]) {
      // Keep the seat close enough for the monk's knees to absorb its motion.
      expect(pose.seatLift).toBeGreaterThanOrEqual(0);
      expect(pose.seatLift).toBeLessThan(0.08);
      expect(Math.abs(pose.seatForward)).toBeLessThan(0.04);
      expect(Math.abs(pose.pelvisPitch)).toBeLessThan(0.06);
      expect(Math.abs(pose.lean + pose.headPitch)).toBeLessThan(Math.abs(pose.lean));
    }
  });

  it('adds an inward shoulder lean while keeping the head steadier and preserving the seat', () => {
    const stride = { walkPhase: 0, runPhase: 0.4, runWeight: 1, walkWeight: 0 };
    const straight = sampleRiderMotion(stride);
    for (const bank of [-0.3, 0.3]) {
      const turn = sampleRiderMotion({ ...stride, bank });
      const shoulders = bank + turn.torsoRoll - straight.torsoRoll;
      const head = shoulders + turn.headRoll - straight.headRoll;
      expect(shoulders * Math.sign(bank)).toBeGreaterThan(Math.abs(bank));
      expect(head * Math.sign(bank)).toBeGreaterThan(0);
      expect(Math.abs(head)).toBeLessThan(Math.abs(shoulders));
      expect(turn.seatLift).toBe(straight.seatLift);
      expect(turn.lean).toBe(straight.lean);
    }
  });

  it('stays continuous at loop boundaries and while horse actions crossfade', () => {
    for (const runWeight of [0, 0.25, 0.8, 1]) {
      const before = sample(1 - 1e-7, runWeight, 1 - runWeight);
      const after = sample(1e-7, runWeight, 1 - runWeight);
      for (const key of keys) expect(Math.abs(before[key] - after[key])).toBeLessThan(1e-6);
    }
    let previous: RiderPose | undefined;
    for (let frame = 0; frame <= 100; frame++) {
      const pose = sampleRiderMotion({ walkPhase: 0.81, runPhase: 0.19, walkWeight: 1 - frame / 100, runWeight: frame / 100 });
      if (previous) for (const key of keys) expect(Math.abs(pose[key] - previous[key])).toBeLessThan(0.004);
      previous = pose;
    }
  });

  it('contains malformed phases and weights without producing a broken pose', () => {
    for (const value of [NaN, Infinity, -Infinity, -10, 10]) {
      const pose = sampleRiderMotion({ walkPhase: value, runPhase: value, walkWeight: value, runWeight: value });
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(pose.seatLift).toBeGreaterThanOrEqual(0);
      expect(pose.seatLift).toBeLessThan(0.08);
      expect(pose.lean).toBeLessThan(0.4);
    }
  });

  it('absorbs vertical motion of the actual horse saddle instead of amplifying it', () => {
    const bytes = readFileSync(new URL('../public/models/horse.fbx', import.meta.url));
    const model = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const box = new T.Box3().setFromObject(model);
    const scale = 1.9 / box.getSize(new T.Vector3()).y;
    model.scale.multiplyScalar(scale);
    model.position.y -= box.min.y * scale;
    model.updateWorldMatrix(true, true);
    const source = prepareHorseClips(model.animations);
    const clips = [bakeHorseLimbMotion(model, source.walk), bakeHorseLimbMotion(model, source.run)];
    for (const [index, clip] of clips.entries()) {
      const mixer = new T.AnimationMixer(model);
      mixer.clipAction(clip).play();
      const saddle: number[] = [], rider: number[] = [];
      for (let frame = 0; frame < 128; frame++) {
        const phase = frame / 128;
        mixer.setTime(phase * clip.duration);
        model.updateWorldMatrix(true, true);
        const height = model.getObjectByName('Torso')!.getWorldPosition(new T.Vector3()).y;
        saddle.push(height);
        rider.push(height + sample(phase, index, 1 - index).seatLift);
      }
      expect(range(rider)).toBeLessThan(range(saddle) * 0.8);
      mixer.stopAllAction();
    }
  });
});
