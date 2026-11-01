import { readFileSync } from 'node:fs';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { describe, expect, it } from 'vitest';
import { prepareHorseClips } from '../src/horse-animation';

const bytes = readFileSync(new URL('../public/models/horse.fbx', import.meta.url));
const source = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const feet = ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR'];

function hoof(clip: T.AnimationClip, name: string, time: number) {
  const track = clip.tracks.find(track => track.name === name + '.position')!;
  const position = track.InterpolantFactoryMethodLinear().evaluate(time) as Float32Array;
  return [position[0], position[1], position[2]] as const;
}

describe('bundled horse animation', () => {
  it('removes the stationary second half of the walk without losing the active cycle', () => {
    const original = source.animations.find(clip => clip.name.endsWith('|Walk'))!;
    const { walk } = prepareHorseClips(source.animations);
    expect(original.duration).toBeCloseTo(8 / 3);
    expect(walk.duration).toBeCloseTo(4 / 3);
    for (const foot of feet) {
      expect(hoof(original, foot, 1.5)).toEqual(hoof(original, foot, 2.5));
      const positions = [0.1, 0.35, 0.6, 0.85].map(t => hoof(walk, foot, walk.duration * t));
      const travel = Math.max(...positions.map(p => p[2])) - Math.min(...positions.map(p => p[2]));
      expect(travel).toBeGreaterThan(1.5);
    }
  });

  it('keeps all four hooves moving throughout the run cycle', () => {
    const { run } = prepareHorseClips(source.animations);
    for (const foot of feet) {
      const positions = Array.from({ length: 12 }, (_, i) => hoof(run, foot, run.duration * i / 12));
      const forwardTravel = Math.max(...positions.map(p => p[2])) - Math.min(...positions.map(p => p[2]));
      const lift = Math.max(...positions.map(p => p[1])) - Math.min(...positions.map(p => p[1]));
      expect(forwardTravel).toBeGreaterThan(3.8);
      expect(lift).toBeGreaterThan(1);
      for (let i = 1; i < positions.length; i++) {
        expect(new T.Vector3(...positions[i]).distanceTo(new T.Vector3(...positions[i - 1]))).toBeGreaterThan(0.01);
      }
    }
  });

  it('keeps the hoof trajectories continuous across the walk and run loop boundaries', () => {
    const { walk, run } = prepareHorseClips(source.animations);
    for (const clip of [walk, run]) {
      for (const foot of feet) {
        const beginning = new T.Vector3(...hoof(clip, foot, 0));
        const ending = new T.Vector3(...hoof(clip, foot, clip.duration));
        expect(beginning.distanceTo(ending)).toBeLessThan(0.0001);
      }
    }
  });

  it('preserves every original track and leaves imported clips immutable', () => {
    const before = source.animations.map(clip => T.AnimationClip.toJSON(clip));
    const prepared = prepareHorseClips(source.animations);
    for (const [motion, clip] of Object.entries(prepared)) {
      const original = source.animations.find(source => source.name.endsWith('|' + (motion === 'idle' ? 'Idle' : motion === 'walk' ? 'Walk' : 'Run')))!;
      expect(clip).not.toBe(original);
      expect(clip.tracks.map(track => track.name)).toEqual(original.tracks.map(track => track.name));
      for (const track of clip.tracks) {
        expect(track.validate()).toBe(true);
        expect(track.times.at(-1)).toBeLessThanOrEqual(clip.duration);
        expect([...track.values].every(Number.isFinite)).toBe(true);
      }
    }
    expect(source.animations.map(clip => T.AnimationClip.toJSON(clip))).toEqual(before);
    prepared.walk.tracks[0].values[0] = 123;
    expect(source.animations.map(clip => T.AnimationClip.toJSON(clip))).toEqual(before);
  });
});
