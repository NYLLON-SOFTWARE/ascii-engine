import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { actorFrame, ChaseCamera, frameActorCapture, meadow } from '../src/chase-camera';
import { createWorld, grassChunks } from '../src/world';

describe('behind-the-monk view', () => {
  it('eases the boom out and back at either frame rate and preserves a paused pose', () => {
    function distances(hz: number) {
      const rig = new ChaseCamera(), p = createWorld().player;
      const distance = () => Math.hypot(rig.camera.position.x - p.x, rig.camera.position.z - p.z);
      rig.reset(p);
      const onFoot = distance();
      p.mounted = true;
      rig.update(p, 0);
      expect(distance()).toBe(onFoot);
      for (let i = 0; i < hz / 2; i++) rig.update(p, 1 / hz);
      const halfway = distance();
      for (let i = 0; i < hz * 2; i++) rig.update(p, 1 / hz);
      const riding = distance();
      expect(halfway).toBeGreaterThan(onFoot);
      expect(halfway).toBeLessThan(riding);
      expect(riding).toBeGreaterThan(onFoot * 1.5);
      p.mounted = false;
      for (let i = 0; i < hz * 3; i++) rig.update(p, 1 / hz);
      expect(distance()).toBeCloseTo(onFoot, 3);
      rig.zoomBy(-800, true);
      rig.update(p, 0);
      expect(distance()).toBeLessThan(onFoot * .7);
      return halfway;
    }
    expect(distances(30)).toBeCloseTo(distances(120), 8);
  });

  it('holds a chosen world direction while the view catches up, then reads new input relative to the camera', () => {
    const rig = new ChaseCamera(), p = createWorld().player, move = new T.Vector2();
    p.angle = Math.PI; rig.reset(p);
    expect(rig.movement(1, 0, move).distanceTo(new T.Vector2(1, 0))).toBeLessThan(1e-6);
    p.angle = Math.PI / 2;
    for (let i = 0; i < 120; i++) {
      rig.update(p, 1 / 60);
      expect(rig.movement(1, 0, move).x).toBeCloseTo(1, 6);
    }
    rig.releaseInput();
    rig.movement(0, -1, move);
    expect(move.x).toBeCloseTo(1, 5);
    expect(move.y).toBeCloseTo(0, 2);
    rig.movement(1, 0, move);
    expect(move.y).toBeCloseTo(1, 5);
  });

  it('takes the short way around the heading seam', () => {
    const rig = new ChaseCamera(), p = createWorld().player;
    p.angle = Math.PI - .05; rig.reset(p);
    p.angle = -Math.PI + .05;
    const view = rig.camera.getWorldDirection(new T.Vector3());
    rig.update(p, .05);
    const after = rig.camera.getWorldDirection(new T.Vector3());
    expect(after.x).toBeLessThan(view.x);
    expect(after.angleTo(view)).toBeLessThan(.03);
  });

  it('projects actor pixels and their reconstructed depth onto the same world rays for two independent capture frames', () => {
    const main = new T.PerspectiveCamera(45, 1.6, .12, 220);
    main.position.set(4, 5, 8); main.lookAt(-1, .7, 0); main.updateMatrixWorld();
    const source = new T.PerspectiveCamera();
    for (const origin of [new T.Vector3(0, 0, 0), new T.Vector3(-3, .2, -5)]) {
      expect(frameActorCapture(source, main, origin)).toBe(true);
      for (const point of [new T.Vector3(.3, .4, .5), new T.Vector3(-.6, 1.8, -.7)]) {
        const pixel = point.clone().project(source);
        const drawn = new T.Vector3(pixel.x * actorFrame.width / 2, pixel.y * actorFrame.height / 2, 0)
          .applyQuaternion(main.quaternion).add(origin);
        drawn.y += actorFrame.centerY;
        drawn.project(main);
        const actual = point.clone().add(origin).project(main);
        expect(drawn.x).toBeCloseTo(actual.x, 9);
        expect(drawn.y).toBeCloseTo(actual.y, 9);
        expect(pixel.unproject(source).add(origin).project(main).z).toBeCloseTo(actual.z, 9);
      }
    }
    expect(frameActorCapture(source, main, new T.Vector3(10, 9, 25))).toBe(false);
  });

  it('keeps every still-visible blade inside the preload ring across chunk and map boundaries', () => {
    for (const [x,z] of [[15.99,16.01],[-.01,-31.9],[125,-124]]) {
      const resident = new Set(grassChunks(x,z,meadow.fadeEnd+meadow.preload,true).map(c => c.x+','+c.z));
      for (let a = 0; a < 2 * Math.PI; a += .04) {
        // Allow the horse to gallop 8 m while jobs catch up.
        const bx = x + 8 + meadow.fadeEnd * Math.sin(a), bz = z + meadow.fadeEnd * Math.cos(a);
        if (Math.abs(bx) >= 128 || Math.abs(bz) >= 128) continue;
        expect(resident.has(Math.floor(bx / 16)+','+Math.floor(bz / 16))).toBe(true);
      }
    }
  });
});
