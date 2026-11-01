import { describe, expect, it } from 'vitest';
import { sampleMonkGait, type MonkMotion } from '../src/monk-gait';

const cycles = [
  { motion: 'walk' as const, period: 0.72, speed: 1.75 },
  { motion: 'run' as const, period: 0.62, speed: 4.3 }
];

describe('novice monk gait', () => {
  for (const { motion, period, speed } of cycles) {
    it(`${motion} repeats continuously and alternates feet every half cycle`, () => {
      for (const time of [0, 0.07, 0.19, 0.31, 0.57]) {
        const now = sampleMonkGait(time, motion);
        const next = sampleMonkGait(time + period, motion);
        const alternate = sampleMonkGait(time + period / 2, motion);
        expect(next.left.forward).toBeCloseTo(now.left.forward, 10);
        expect(next.left.lift).toBeCloseTo(now.left.lift, 10);
        expect(next.bob).toBeCloseTo(now.bob, 10);
        expect(alternate.left.forward).toBeCloseTo(now.right.forward, 10);
        expect(alternate.left.lift).toBeCloseTo(now.right.lift, 10);
        expect(alternate.armSwing).toBeCloseTo(-now.armSwing, 10);
      }
      const beforeWrap = sampleMonkGait(period - 0.00001, motion);
      const afterWrap = sampleMonkGait(0.00001, motion);
      expect(Math.abs(beforeWrap.left.forward - afterWrap.left.forward)).toBeLessThan(0.001);
      expect(Math.abs(beforeWrap.left.lift - afterWrap.left.lift)).toBeLessThan(0.001);
    });

    it(`${motion} holds the stance foot on the ground without world-space sliding`, () => {
      const start = sampleMonkGait(0.04, motion).left;
      const end = sampleMonkGait(0.08, motion).left;
      expect(start.lift).toBe(0);
      expect(end.lift).toBe(0);
      expect(end.forward + speed * 0.04).toBeCloseTo(start.forward, 10);
    });

    it(`${motion} keeps both ankle targets reachable and above ground`, () => {
      for (let i = 0; i < 400; i++) {
        const pose = sampleMonkGait(period * i / 400, motion);
        for (const foot of [pose.left, pose.right]) {
          expect(foot.lift).toBeGreaterThanOrEqual(0);
          const reach = Math.hypot(foot.forward, 0.88 + pose.bob - (0.06 + foot.lift));
          expect(reach).toBeLessThan(0.92);
        }
      }
    });
  }

  it('walks with ground support and runs with a flight phase', () => {
    let runningFlight = false;
    for (let i = 0; i < 200; i++) {
      const walking = sampleMonkGait(i * 0.72 / 200, 'walk');
      expect(Math.min(walking.left.lift, walking.right.lift)).toBe(0);
      const running = sampleMonkGait(i * 0.62 / 200, 'run');
      runningFlight ||= running.left.lift > 0.01 && running.right.lift > 0.01;
    }
    expect(runningFlight).toBe(true);
  });

  it('keeps idle and seated feet neutral', () => {
    for (const motion of ['idle', 'ride'] as const) {
      for (const time of [0, 0.6, 1.2, 2.4]) {
        const pose = sampleMonkGait(time, motion);
        expect(pose.left).toEqual({ forward: 0, lift: 0 });
        expect(pose.right).toEqual({ forward: 0, lift: 0 });
        expect(Math.abs(pose.bob)).toBeLessThanOrEqual(0.006);
      }
    }
  });

  it('is deterministic and finite across negative, large, and invalid times', () => {
    const motions: MonkMotion[] = ['idle', 'walk', 'run', 'ride'];
    for (const motion of motions) {
      for (const time of [-100.4, -0.02, 0, 10, 1e12, Infinity, NaN]) {
        const pose = sampleMonkGait(time, motion);
        expect(pose).toEqual(sampleMonkGait(time, motion));
        const { left, right, ...body } = pose;
        expect([...Object.values(left), ...Object.values(right), ...Object.values(body)].every(Number.isFinite)).toBe(true);
      }
    }
  });
});
