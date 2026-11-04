import * as T from 'three';
import { describe, expect, it } from 'vitest';
import { NoviceMonk } from '../src/monk';
import { sampleRiderMotion } from '../src/rider-motion';

function pose(monk: NoviceMonk) {
  const parts: number[][] = [];
  monk.root.traverse(part => {
    const values = [...part.position.toArray(), ...part.quaternion.toArray(), ...part.scale.toArray()];
    if (part instanceof T.Mesh) {
      const positions = part.geometry.getAttribute('position');
      if (positions instanceof T.BufferAttribute && positions.usage === T.DynamicDrawUsage) {
        values.push(...positions.array);
      }
    }
    parts.push(values);
  });
  return parts;
}

describe('novice pose lifecycle', () => {
  it('shifts weight and turns the shoulders while the planted sandals hold their ground at different frame rates', () => {
    for (const hz of [30, 120]) {
      const monk = new NoviceMonk(82173), dt = 1 / hz;
      // Establish a straight walk on level ground at gameplay speed.
      const feet = ['Monk left foot', 'Monk right foot'].map(name => monk.root.getObjectByName(name)!);
      const last = [new T.Vector3(), new T.Vector3()];
      const current = new T.Vector3();
      let plants = 0, maxSlip = 0, minX = 0, maxX = 0, minTurn = 0, maxTurn = 0;
      for (let frame = 1; frame <= hz * 6; frame++) {
        monk.update(dt, 'walk');
        monk.root.position.z = frame * dt * 1.75;
        minX = Math.min(minX, monk.hips.position.x); maxX = Math.max(maxX, monk.hips.position.x);
        minTurn = Math.min(minTurn, monk.chest.rotation.y); maxTurn = Math.max(maxTurn, monk.chest.rotation.y);
        feet.forEach((foot, i) => {
          foot.getWorldPosition(current);
          if (frame * dt > .25 && Math.abs(current.y - .06) < 1e-9 && Math.abs(last[i].y - .06) < 1e-9) {
            maxSlip = Math.max(maxSlip, current.distanceTo(last[i])); plants++;
          }
          last[i].copy(current);
        });
      }
      expect(plants).toBeGreaterThan(hz * 4);
      expect(maxSlip).toBeLessThan(1e-8);
      expect(maxX - minX).toBeGreaterThan(.04);
      expect(maxTurn - minTurn).toBeGreaterThan(.15);
    }
  });

  it('freezes a walking pose without snapping its limbs or cloth to idle', () => {
    const monk = new NoviceMonk();
    const idle = pose(monk);
    for (let i = 0; i < 15; i++) monk.update(0.016, 'walk');
    const walking = pose(monk);
    expect(walking).not.toEqual(idle);
    for (let i = 0; i < 10; i++) monk.update(0, 'idle');
    expect(pose(monk)).toEqual(walking);
  });

  it('restores identical preset poses after different animation histories', () => {
    const a = new NoviceMonk();
    const b = new NoviceMonk();
    for (let i = 0; i < 25; i++) {
      a.update(0.016, 'run');
      b.update(0.023, 'ride');
    }
    for (const motion of ['idle', 'walk', 'run', 'ride'] as const) {
      a.reset(4.2, motion);
      b.reset(4.2, motion);
      expect(pose(a)).toEqual(pose(b));
    }
  });

  it('allows an explicit mount and dismount transition while time is frozen', () => {
    const monk = new NoviceMonk();
    const reference = new NoviceMonk();
    monk.reset(1.2, 'idle');
    const standing = pose(monk);
    monk.update(0, 'ride', true);
    reference.reset(1.2, 'ride');
    expect(pose(monk)).not.toEqual(standing);
    expect(pose(monk)).toEqual(pose(reference));
    monk.update(0, 'idle', true);
    expect(pose(monk)).toEqual(standing);
  });

  it('absorbs gallop seat motion with its limbs while keeping hands and feet near the saddle', () => {
    const monk = new NoviceMonk();
    const targets = ['Monk left hand', 'Monk right hand', 'Monk left foot', 'Monk right foot'];
    const positions: T.Vector3[][] = [];
    const heights: number[] = [];
    for (let i = 0; i < 32; i++) {
      const rider = sampleRiderMotion({ walkPhase: 0, runPhase: i / 32, walkWeight: 0, runWeight: 1 });
      monk.update(0, 'ride', true, rider);
      // The same hip alignment used by Actors.placeRider, with the saddle at 0.
      monk.root.position.set(0, -monk.hips.position.y + monk.seatOffset.lift, monk.seatOffset.forward);
      monk.root.updateWorldMatrix(true, true);
      heights.push(monk.hips.getWorldPosition(new T.Vector3()).y);
      positions.push(targets.map(name => monk.root.getObjectByName(name)!.getWorldPosition(new T.Vector3())));
      expect(monk.chest.rotation.x).toBeGreaterThan(0.2);
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.04);
    for (const sample of positions) {
      sample.forEach((position, i) => expect(position.distanceTo(positions[0][i])).toBeLessThan(0.005));
    }
  });

  it('freezes the complete riding pose and clears it on preset reset or dismount', () => {
    const monk = new NoviceMonk();
    const reference = new NoviceMonk();
    const rider = sampleRiderMotion({ walkPhase: 0, runPhase: 0.4, walkWeight: 0, runWeight: 1 });
    monk.update(0, 'ride', true, rider);
    const galloping = pose(monk), seat = { ...monk.seatOffset };
    monk.update(0, 'ride', false, sampleRiderMotion({ walkPhase: 0, runPhase: 0, walkWeight: 0, runWeight: 0 }));
    expect(pose(monk)).toEqual(galloping);
    expect(monk.seatOffset).toEqual(seat);
    monk.reset(1.2, 'ride');
    reference.reset(1.2, 'ride');
    expect(pose(monk)).toEqual(pose(reference));
    expect(monk.seatOffset).toEqual({ lift: 0, forward: 0 });
    monk.update(0, 'ride', true, rider);
    monk.update(0, 'idle', true);
    reference.update(0, 'idle', true);
    expect(pose(monk)).toEqual(pose(reference));
  });

  it('returns to the original walking arm pose after dismounting', () => {
    const monk = new NoviceMonk(), reference = new NoviceMonk();
    monk.update(0, 'ride', true, sampleRiderMotion({ walkPhase: 0, runPhase: 0.4, walkWeight: 0, runWeight: 1 }));
    for (let i = 0; i < 120; i++) {
      monk.update(1 / 60, 'walk');
      reference.update(1 / 60, 'walk');
    }
    const actual = pose(monk), expected = pose(reference);
    actual.forEach((part, i) => {
      const error = Math.max(...part.map((value, j) => Math.abs(value - expected[i][j])));
      expect(error).toBeLessThan(1e-6);
    });
  });
});
