import * as T from 'three';
import type { Player } from './types';
import { terrainHeight } from './world';

// Blades have completely disappeared before their chunks can be unloaded.
export const meadow = { fadeStart: 16, fadeEnd: 42, preload: 12 } as const;
export const actorFrame = { width: 5, height: 6.4, centerY: 1.6 } as const;

export class ChaseCamera {
  readonly camera = new T.PerspectiveCamera(45, 1, 0.12, 220);
  private readonly anchor = new T.Vector3();
  private readonly aim = new T.Vector3();
  private readonly destination = new T.Vector3();
  private heading = 0;
  private riding = 0;
  private zoom = 1;
  private wantedZoom = 1;
  private keyX = 0;
  private keyZ = 0;
  private inputHeading = 0;

  reset(player: Player) {
    this.heading = player.angle;
    this.riding = Number(player.mounted);
    this.zoom = this.wantedZoom;
    this.anchor.set(player.x, terrainHeight(player.x, player.z), player.z);
    this.releaseInput();
    this.positionCamera();
  }

  zoomBy(delta: number, frozen = false) {
    this.wantedZoom = T.MathUtils.clamp(this.wantedZoom * Math.exp(delta * 0.001), 0.68, 1.65);
    if (frozen) {
      this.zoom = this.wantedZoom;
      this.positionCamera();
    }
  }

  update(player: Player, dt: number) {
    const delta = player.angle - this.heading;
    const shortest = Math.atan2(Math.sin(delta), Math.cos(delta));
    const step = shortest * -Math.expm1(-4.2 * dt);
    this.heading += T.MathUtils.clamp(step, -3.5 * dt, 3.5 * dt);
    this.riding = T.MathUtils.lerp(this.riding, Number(player.mounted), -Math.expm1(-3.6 * dt));
    this.zoom = T.MathUtils.lerp(this.zoom, this.wantedZoom, -Math.expm1(-10 * dt));
    this.destination.set(player.x, terrainHeight(player.x, player.z), player.z);
    this.anchor.lerp(this.destination, -Math.expm1(-14 * dt));
    this.positionCamera();
  }

  private positionCamera() {
    const forwardX = Math.sin(this.heading), forwardZ = Math.cos(this.heading);
    const distance = (6.6 + 3.6 * this.riding) * this.zoom;
    const lookAhead = (2.1 + 1.3 * this.riding) * this.zoom;
    const eyeHeight = 0.95 + 0.72 * this.riding + (3 + this.riding) * this.zoom;
    // A small shoulder offset leaves the trail ahead visible at the screen centre.
    const x = this.anchor.x - 0.26 * forwardZ, z = this.anchor.z + 0.26 * forwardX;
    this.camera.position.set(x - forwardX * distance, this.anchor.y + eyeHeight, z - forwardZ * distance);
    this.aim.set(x + forwardX * lookAhead, this.anchor.y + 0.95 + 0.72 * this.riding, z + forwardZ * lookAhead);
    this.camera.lookAt(this.aim);
    this.camera.updateMatrixWorld();
  }

  releaseInput() {
    this.keyX = this.keyZ = 0;
  }

  movement(x: number, z: number, out: T.Vector2) {
    // Sample the screen axes when the player chooses a direction. Otherwise
    // holding a turn key would keep steering further as the camera catches up.
    if (x !== this.keyX || z !== this.keyZ) {
      this.inputHeading = this.heading;
      this.keyX = x;
      this.keyZ = z;
    }
    const s = Math.sin(this.inputHeading), c = Math.cos(this.inputHeading);
    return out.set(-x * c - z * s, x * s - z * c);
  }
}

/** Crop the main perspective frustum to the actor's camera-facing glyph quad.
 * The capture scene uses actor-local coordinates. Its rays must still match
 * the main view at every pixel, including for an off-centre parked horse. */
export function frameActorCapture(source: T.PerspectiveCamera, main: T.PerspectiveCamera, origin: T.Vector3) {
  source.position.copy(origin);
  source.position.y += actorFrame.centerY;
  source.position.applyMatrix4(main.matrixWorldInverse);
  const { x, y, z } = source.position;
  if (-z <= main.near || -z >= main.far) return false;

  const scale = main.near / -z;
  source.position.copy(main.position).sub(origin);
  source.quaternion.copy(main.quaternion);
  source.updateMatrixWorld();
  source.near = main.near;
  source.far = main.far;
  source.projectionMatrix.makePerspective(
    (x - actorFrame.width / 2) * scale, (x + actorFrame.width / 2) * scale,
    (y + actorFrame.height / 2) * scale, (y - actorFrame.height / 2) * scale, main.near, main.far
  );
  source.projectionMatrixInverse.copy(source.projectionMatrix).invert();
  return true;
}
