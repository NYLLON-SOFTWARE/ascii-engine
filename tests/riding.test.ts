import { describe, expect, it } from 'vitest';
import { changeMount, createWorld, positionForShot, shots, validateWorld } from '../src/world';

describe('riding transitions', () => {
  it('parks the horse at its last heading and restores it after the rider turns on foot', () => {
    const world = createWorld();
    world.player.angle = -1.2;
    const saddle = [world.player.x, world.player.z];
    expect(changeMount(world)).toBe('dismounted');
    expect(world.player.horse).toEqual(saddle);
    world.player.angle = 0.8;
    const saved = validateWorld(JSON.parse(JSON.stringify(world)));
    expect(changeMount(saved)).toBe('mounted');
    expect([saved.player.x, saved.player.z]).toEqual(saddle);
    expect(saved.player.angle).toBe(-1.2);
  });

  it('leaves both actors in place when the rider tries to mount from too far away', () => {
    const world = createWorld();
    changeMount(world);
    world.player.x += 8;
    const before = structuredClone(world.player);
    expect(changeMount(world)).toBe('far');
    expect(world.player).toEqual(before);
  });

  it('gives the player and horse separate positions in each on-foot preset', () => {
    const world = createWorld();
    for (const shot of shots.filter(shot => !shot.mounted)) {
      positionForShot(world, shot);
      const [hx,hz] = world.player.horse;
      const distance = Math.hypot(hx-world.player.x, hz-world.player.z);
      expect(distance).toBeGreaterThan(1.5);
      expect(distance).toBeLessThan(3);
    }
  });

  it('can load a world written before heading was saved', () => {
    const world = createWorld();
    delete world.player.horseAngle;
    expect(validateWorld(world).player.horseAngle).toBe(world.player.angle);
  });
});
