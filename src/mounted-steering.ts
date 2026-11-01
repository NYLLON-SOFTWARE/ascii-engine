import { HORSE_GALLOP_SPEED, HORSE_WALK_SPEED } from './horse-animation';
import { canStand } from './world';
import type { WorldDocument } from './types';

const maxBank = Math.PI / 10; // 18 degrees about the horse's local forward axis

/** WASD chooses a world heading. Move along the arc the mount actually turns through. */
export function steerMount(world: WorldDocument, dx: number, dz: number, fast: boolean, dt: number) {
  const p = world.player;
  if (!p.mounted || dt <= 0 || (!dx && !dz)) return { moving: false, bank: 0 };
  const speed = fast ? HORSE_GALLOP_SPEED : HORSE_WALK_SPEED;
  const error = Math.atan2(dx, dz) - p.angle;
  const shortest = Math.atan2(Math.sin(error), Math.cos(error));
  // A galloping horse needs a wider arc; ease out of the turn as it lines up.
  const maxStep = (fast ? 2.8 : 4.6) * dt;
  const yaw = Math.max(-maxStep, Math.min(maxStep, shortest * -Math.expm1(-dt * 8)));
  const mid = p.angle + yaw / 2;
  const travel = speed * dt * (Math.abs(yaw) < 1e-6 ? 1 : Math.sin(yaw / 2) / (yaw / 2));
  const oldX = p.x, oldZ = p.z;
  const nx = oldX + Math.sin(mid) * travel, nz = oldZ + Math.cos(mid) * travel;
  if (canStand(nx, p.z, world, 0.55)) p.x = nx;
  if (canStand(p.x, nz, world, 0.55)) p.z = nz;
  p.angle = Math.atan2(Math.sin(p.angle + yaw), Math.cos(p.angle + yaw));
  p.horse[0] = p.x;
  p.horse[1] = p.z;
  p.horseAngle = p.angle;

  const distance = Math.hypot(p.x - oldX, p.z - oldZ);
  // Lateral acceleration = achieved speed × signed turn rate. Positive yaw
  // turns the +Z nose toward +X; leaning toward +X requires negative Z roll.
  const lateralAcceleration = distance / dt * (yaw / dt);
  return { moving: distance > 1e-8, bank: -maxBank * Math.tanh(lateralAcceleration / 9.81) };
}

/** Ease into the corner, then let the weight settle as the path straightens. */
export function approachBank(current: number, target: number, dt: number) {
  if (dt <= 0) return current;
  const rate = target === 0 ? 7 : 10;
  const next = current + (target - current) * -Math.expm1(-rate * dt);
  return Math.abs(next) < 1e-5 && Math.abs(target) < 1e-5 ? 0 : next;
}
