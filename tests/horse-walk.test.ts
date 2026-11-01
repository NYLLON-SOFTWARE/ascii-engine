import { readFileSync } from 'node:fs';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { describe, expect, it } from 'vitest';
import { retimeHorseWalk } from '../src/horse-walk';

const bytes = readFileSync(new URL('../public/models/horse.fbx', import.meta.url));
const model = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
// Exercise this helper against the actual unretimed moving cycle. Calling the
// runtime preparer here would retime twice and hide integration regressions.
const original = model.animations.find(clip => clip.name.endsWith('|Walk'))!.clone();
original.duration = Math.fround(4 / 3);
original.trim();
const walk = retimeHorseWalk(original);
const feet = ['BackFootL', 'FrontFootL', 'BackFootR', 'FrontFootR'];

function position(clip: T.AnimationClip, foot: string, phase: number) {
  const track = clip.tracks.find(track => track.name === foot + '.position')!;
  return Array.from(track.InterpolantFactoryMethodLinear().evaluate(phase * clip.duration) as Float32Array);
}

function floor(foot: string) {
  return Math.min(...Array.from({ length: 400 }, (_, i) => position(walk, foot, i / 400)[1]));
}

describe('horse walk contact retiming', () => {
  it('maintains at least two grounded hooves throughout the entire walk', () => {
    const ground = feet.map(floor);
    const contacts = feet.map(() => 0);
    for (let i = 0; i < 2000; i++) {
      const planted = feet.map((foot, index) => position(walk, foot, i / 2000)[1] <= ground[index] + 1e-5);
      expect(planted.filter(Boolean).length).toBeGreaterThanOrEqual(2);
      planted.forEach((onGround, index) => { if (onGround) contacts[index]++; });
    }
    contacts.forEach((count, index) => expect(count / 2000).toBeCloseTo(index % 2 === 0 ? 0.63 : 0.64, 2));
  });

  it('lands LH, LF, RH, RF in four separate evenly spaced beats', () => {
    feet.forEach((foot, index) => {
      const contact = index / 4;
      const before = (contact - 0.005 + 1) % 1;
      const after = (contact + 0.005) % 1;
      expect(position(walk, foot, before)[1]).toBeGreaterThan(floor(foot) + 1e-4);
      expect(position(walk, foot, after)[1]).toBeCloseTo(floor(foot), 6);
    });
  });

  it('retreats steadily during grounded stance rather than easing and skating', () => {
    feet.forEach((foot, index) => {
      const contact = index / 4;
      const stance = index % 2 === 0 ? 0.63 : 0.64;
      const points = Array.from({ length: 5 }, (_, i) => position(walk, foot, (contact + stance * (0.1 + 0.2 * i)) % 1));
      const step = points[1][2] - points[0][2];
      expect(step).toBeLessThan(-0.1);
      for (let i = 2; i < points.length; i++) expect(points[i][2] - points[i - 1][2]).toBeCloseTo(step, 5);
    });
  });

  it('preserves forward travel and swing clearance without plant, lift or loop jumps', () => {
    feet.forEach((foot, index) => {
      const samples = Array.from({ length: 200 }, (_, i) => position(walk, foot, i / 200));
      const sourceSamples = Array.from({ length: 200 }, (_, i) => position(original, foot, i / 200));
      const range = (values: number[][], axis: number) => Math.max(...values.map(p => p[axis])) - Math.min(...values.map(p => p[axis]));
      expect(range(samples, 2)).toBeCloseTo(range(sourceSamples, 2), 1);
      expect(range(samples, 1)).toBeGreaterThan(0.2);
      for (const event of [index / 4, (index / 4 + (index % 2 === 0 ? 0.63 : 0.64)) % 1, 0]) {
        const before = new T.Vector3(...position(walk, foot, (event - 1e-6 + 1) % 1));
        const after = new T.Vector3(...position(walk, foot, (event + 1e-6) % 1));
        expect(before.distanceTo(after)).toBeLessThan(0.0001);
      }
      position(walk, foot, 0).forEach((value, axis) => expect(value).toBeCloseTo(position(walk, foot, 1)[axis], 6));
    });
  });

  it('leaves the source and unrelated tracks untouched and keeps valid quaternion tracks', () => {
    const before = T.AnimationClip.toJSON(original);
    const result = retimeHorseWalk(original);
    expect(T.AnimationClip.toJSON(original)).toEqual(before);
    expect(result.duration).toBe(original.duration);
    expect(result.tracks.map(track => track.name)).toEqual(original.tracks.map(track => track.name));
    for (const track of result.tracks) {
      expect(track.validate()).toBe(true);
      const source = original.tracks.find(source => source.name === track.name)!;
      expect(track).not.toBe(source);
      const retimed = feet.some(foot => track.name === foot + '.position' || track.name === foot + '.quaternion');
      if (!retimed) expect(T.KeyframeTrack.toJSON(track)).toEqual(T.KeyframeTrack.toJSON(source));
      if (retimed && track.name.endsWith('.quaternion')) {
        for (let i = 0; i < track.values.length; i += 4) {
          expect(new T.Quaternion().fromArray(track.values, i).length()).toBeCloseTo(1, 5);
        }
      }
    }
  });
});
