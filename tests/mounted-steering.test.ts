import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/world';
import { approachBank, steerMount } from '../src/mounted-steering';

function meadow() {
  const w = createWorld();
  w.props = [];
  Object.assign(w.player, { x: 45, z: -40, angle: 0, mounted: true, horse: [45, -40] });
  return w;
}

function corner(side: number, fast: boolean, hz: number) {
  const w = meadow(), p = w.player, dt = 1 / hz;
  let bank = 0, peak = 0;
  for (let i = 0; i < hz * 2; i++) {
    const step = steerMount(w, side, 0, fast, dt);
    bank = approachBank(bank, step.bank, dt);
    peak = Math.max(peak, Math.abs(bank));
    if (i === 0) {
      // Initially moves along the old direction, not sideways at full speed.
      expect(p.z + 40).toBeGreaterThan(5 * Math.abs(p.x - 45));
    }
    expect(bank * side).toBeLessThanOrEqual(0);
  }
  expect(p.horse).toEqual([p.x, p.z]);
  expect(p.horseAngle).toBe(p.angle);
  return { x: p.x - 45, z: p.z + 40, bank, peak };
}

describe('mounted steering', () => {
  it('follows mirrored arcs, banks inward, and leans more at a gallop', () => {
    const left = corner(-1, true, 60), right = corner(1, true, 60);
    expect(left.x).toBeCloseTo(-right.x, 6);
    expect(left.z).toBeCloseTo(right.z, 6);
    expect(left.peak).toBeCloseTo(right.peak, 8);
    expect(right.peak).toBeGreaterThan(corner(1, false, 60).peak * 1.7);
    expect(right.peak).toBeLessThanOrEqual(Math.PI / 10);
    expect(Math.abs(right.bank)).toBeLessThan(0.001);
  });

  it('keeps corner radius and peak bank consistent across frame rates', () => {
    const coarse = corner(1, true, 30), fine = corner(1, true, 120);
    expect(Math.hypot(coarse.x - fine.x, coarse.z - fine.z)).toBeLessThan(0.04);
    expect(Math.abs(coarse.peak - fine.peak)).toBeLessThan(0.01);
  });

  it('crosses the heading seam by the short route and changes lean smoothly on reversal', () => {
    const w = meadow();
    w.player.angle = Math.PI - 0.08;
    const target = -Math.PI + 0.08;
    let bank = 0;
    for (let i = 0; i < 30; i++) {
      const turn = steerMount(w, Math.sin(target), Math.cos(target), true, 1 / 60);
      bank = approachBank(bank, turn.bank, 1 / 60);
      expect(bank).toBeLessThan(0);
    }
    expect(w.player.angle).toBeCloseTo(target, 2);
    expect(approachBank(bank, 0, 0)).toBe(bank); // Frozen mid-corner.
    const opposite = steerMount(w, 1, 0, true, 1 / 60);
    expect(opposite.bank).toBeGreaterThan(0);
    expect(Math.abs(approachBank(bank, opposite.bank, 1 / 60) - bank)).toBeLessThan(0.06);
  });

  it('settles instead of banking when stopped, blocked, or unmounted', () => {
    const w = meadow();
    Object.assign(w.player, { x: 126, z: 126, angle: 0.4 });
    expect(steerMount(w, 1, 0, true, 1 / 60)).toMatchObject({ moving: false });
    expect(Math.abs(steerMount(w, 1, 0, true, 1 / 60).bank)).toBe(0);
    expect([w.player.x, w.player.z]).toEqual([126, 126]);
    expect(steerMount(w, 0, 0, true, 1 / 60)).toEqual({ moving: false, bank: 0 });
    let bank = 0.3;
    for (let i = 0; i < 120; i++) bank = approachBank(bank, 0, 1 / 60);
    expect(bank).toBe(0);
    w.player.mounted = false;
    const before = structuredClone(w.player);
    expect(steerMount(w, 1, 0, true, 1 / 60)).toEqual({ moving: false, bank: 0 });
    expect(w.player).toEqual(before);
  });
});
