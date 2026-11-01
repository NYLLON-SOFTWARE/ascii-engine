import * as T from 'three';
import { describe, expect, it } from 'vitest';
import { NoviceMonk } from '../src/monk';

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
});
