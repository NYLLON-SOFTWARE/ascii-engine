import * as T from 'three';
import type { WorldDocument } from './types';
import { GLYPHS, terrainHeight } from './world';
import fragmentShader from './stream.frag.glsl?raw';

// Keep existing scenery and saved asset indices intact.
export const atlasGlyphs = GLYPHS + "'~()";
const waterMarks = ".,:'~-_=()";
const vertexShader = [
  'varying vec2 vStream;',
  'varying vec3 vWorld;',
  'void main() {',
  '  vStream = uv;',
  '  vWorld = position;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');

function sampleCourse(river: WorldDocument['river']): T.Vector2[] {
  const points = river.points.map(([x, z]) => new T.Vector2(x, z))
    .filter((point, index, all) => index === 0 || point.distanceToSquared(all[index - 1]) > 1e-8);
  if (points.length < 2) return points;

  const course = [points[0]];
  function append(curve: T.Curve<T.Vector2>) {
    const segments = Math.min(384, Math.max(1, Math.ceil(curve.getLength() / 0.85)));
    for (let i = 1; i <= segments; i++) course.push(curve.getPoint(i / segments));
  }
  // A short fillet turns the flow through each editable corner. The rounding
  // stays inside the soft shore so the source polyline still governs gameplay.
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i];
    const incoming = points[i - 1].clone().sub(corner);
    const outgoing = points[i + 1].clone().sub(corner);
    const trim = Math.min(river.width * 0.32, incoming.length() * 0.25, outgoing.length() * 0.25);
    const entry = corner.clone().addScaledVector(incoming.normalize(), trim);
    const exit = corner.clone().addScaledVector(outgoing.normalize(), trim);
    append(new T.LineCurve(course[course.length - 1], entry));
    append(new T.QuadraticBezierCurve(entry, corner, exit));
  }
  append(new T.LineCurve(course[course.length - 1], points[points.length - 1]));
  return course;
}

function streamRibbon(river: WorldDocument['river']) {
  const course = sampleCourse(river);
  const halfWidth = river.width * 0.5;
  const skirt = Math.min(1.4, halfWidth * 0.42);
  const reach = halfWidth + skirt;
  // A collapsed pair of editor handles produces a small round pool.
  if (course.length === 1) course.push(course[0].clone().add(new T.Vector2(0, 0.001)));
  const positions: number[] = [], coordinates: number[] = [], indices: number[] = [];
  const slices = Math.max(4, Math.ceil(reach * 2 / 1.1));
  let length = 0;

  function ring(point: T.Vector2, tangent: T.Vector2, distance: number) {
    const row = positions.length / 3;
    for (let i = 0; i <= slices; i++) {
      const cross = reach * (2 * i / slices - 1);
      const x = point.x + tangent.y * cross;
      const z = point.y - tangent.x * cross;
      // Follow the terrain through the wet margin. Keep the continuous ground
      // below it so partially transparent bank pixels always have a bed.
      positions.push(x, terrainHeight(x, z) - 0.016, z);
      coordinates.push(cross, distance);
      if (row > 0 && i < slices) {
        const a = row + i, b = a - (slices + 1);
        indices.push(b, a, b + 1, a, a + 1, b + 1);
      }
    }
  }

  for (let i = 0; i < course.length; i++) {
    const prev = course[Math.max(0, i - 1)], next = course[Math.min(course.length - 1, i + 1)];
    const tangent = next.clone().sub(prev).normalize();
    if (tangent.lengthSq() === 0) tangent.copy(course[i]).sub(prev).normalize();
    if (i === 0) ring(course[i].clone().addScaledVector(tangent, -reach), tangent, -reach);
    if (i > 0) length += course[i].distanceTo(prev);
    ring(course[i], tangent, length);
    if (i === course.length - 1) ring(course[i].clone().addScaledVector(tangent, reach), tangent, length + reach);
  }

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(coordinates, 2));
  geometry.setIndex(indices);
  return { geometry, length, halfWidth, skirt };
}

export function createStream(river: WorldDocument['river'], atlas: T.Texture, lighting: Record<string, T.IUniform>) {
  const { geometry, length, halfWidth, skirt } = streamRibbon(river);
  const material = new T.ShaderMaterial({
    name: 'Trickling stream',
    vertexShader, fragmentShader,
    uniforms: {
      ...lighting,
      uAtlas: { value: atlas },
      uMarks: { value: Array.from(waterMarks, mark => atlasGlyphs.indexOf(mark)) },
      uHalfWidth: { value: halfWidth }, uLength: { value: length }, uShore: { value: skirt },
      uReflection: { value: 1 }
    },
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    forceSinglePass: true
  });
  return new T.Mesh(geometry, material);
}
