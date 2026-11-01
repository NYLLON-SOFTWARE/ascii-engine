varying vec2 vStream; // metres across the channel, metres along the course
varying vec3 vWorld;
uniform sampler2D uAtlas;
uniform float uMarks[10];
uniform float uTime, uHalfWidth, uLength, uShore, uMoon, uTorch, uReflection;
uniform vec3 uPlayer, uTorchColor;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float field(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float lettering(vec2 glyphUV, float glyph, vec2 dx, vec2 dy) {
  vec2 tile = vec2(mod(glyph, 8.0), floor(glyph / 8.0));
  vec2 padding = vec2(0.035);
  vec2 local = clamp(glyphUV, padding, 1.0 - padding);
  // Glyph coordinates increase in the downstream direction. The font atlas
  // increases upwards. Supply derivatives before cell wrapping to avoid seams.
  local.y = 1.0 - local.y;
  float inside = step(0.0, min(glyphUV.x, glyphUV.y)) *
                 step(max(glyphUV.x, glyphUV.y), 1.0);
  return textureGrad(uAtlas, (tile + local) / 8.0,
                     dx * vec2(1,-1) / 8.0, dy * vec2(1,-1) / 8.0).a * inside;
}

float trickles(float laneWidth, float seed, float pace) {
  float s = vStream.y;
  // Narrow streams of marks weave gently between one another. Each lane has
  // one persistent speed. A glyph keeps its identity as it travels.
  float cross = vStream.x + laneWidth * (1.18 * sin(s * 0.60 + seed + vStream.x * 0.37)
                                       + 0.44 * sin(s * 1.17 - seed));
  float lane = floor(cross / laneWidth);
  float laneKey = hash(vec2(lane, seed));
  float laneDepth = clamp(1.0 - abs((lane + 0.5) * laneWidth) / uHalfWidth, 0.0, 1.0);
  float speed = mix(0.11, 0.54, smoothstep(0.0, 0.82, laneDepth)) *
                mix(0.80, 1.2, laneKey) * pace;
  float spacing = mix(0.30, 0.53, laneKey) * (laneWidth / 0.25);
  float downstream = (s - uTime * speed) / spacing + laneKey * 19.0;
  vec2 id = vec2(lane + seed, floor(downstream));
  float choice = hash(id + 97.1);
  int mark = choice < 0.12 ? 0 : choice < 0.29 ? 1 : choice < 0.36 ? 2 :
             choice < 0.42 ? 3 : choice < 0.73 ? 4 : choice < 0.86 ? 5 :
             choice < 0.91 ? 6 : choice < 0.95 ? 7 : choice < 0.975 ? 8 : 9;
  vec2 shift = vec2(hash(id + 34.8), hash(id + 11.3)) - 0.5;
  vec2 footprint = vec2(0.96, 1.14) * mix(0.91, 1.24, hash(id + 64.1));
  vec2 uv = (fract(vec2(cross / laneWidth, downstream)) - 0.5 - shift * 0.17) * footprint + 0.5;
  // Lane-specific phase offsets should not affect texture filtering.
  vec2 dx = vec2(dFdx(cross) / laneWidth, dFdx(s) / spacing) * footprint;
  vec2 dy = vec2(dFdy(cross) / laneWidth, dFdy(s) / spacing) * footprint;
  float ink = lettering(uv, uMarks[mark], dx, dy);
  float group = field(vec2(lane * 0.72 + seed, downstream * 0.32));
  float separation = smoothstep(0.32, 0.73, group * 0.70 + hash(id + 72.3) * 0.30);
  return ink * separation * mix(0.40, 1.0, hash(id + 91.6));
}

void main() {
  if (max(abs(vWorld.x), abs(vWorld.z)) > 128.0) discard;
  vec2 p = vWorld.xz;
  float cap = max(max(-vStream.y, vStream.y - uLength), 0.0);
  float depthIn = uHalfWidth - length(vec2(vStream.x, cap));
  // Stable flecks of silt and uneven tongues of damp earth interrupt the edge.
  float shoreVariation = (field(p * 0.81) - 0.5) * 0.72 + (field(p * 3.4) - 0.5) * 0.30;
  float bank = depthIn / uShore + shoreVariation;
  float wet = smoothstep(-0.66, 0.67, bank);
  if (wet < 0.008) discard;
  float depth = smoothstep(-0.20, min(uHalfWidth * 0.68, 2.7), depthIn + shoreVariation * uShore);
  float grain = field(p * 5.8);
  vec3 bed = mix(vec3(0.029, 0.039, 0.036), vec3(0.078, 0.096, 0.084), grain);
  vec3 pool = mix(vec3(0.018, 0.035, 0.053), vec3(0.036, 0.066, 0.081), field(p * 0.43));
  vec3 color = mix(bed, pool, depth) * (0.72 + 0.62 * uMoon);

  float flecks = trickles(0.16, 39.7, 0.69);
  float current = trickles(0.34, 5.4, 1.0);
  float ink = (0.36 * flecks + 1.18 * current) * smoothstep(-0.47, 0.9, bank);
  float glint = smoothstep(0.45, 0.83, field(vec2(vStream.x * 0.71, vStream.y * 0.29 - uTime * 0.045)));
  vec3 silver = mix(vec3(0.22, 0.31, 0.32), vec3(0.38, 0.51, 0.58), depth);
  color += ink * silver * (0.47 + 0.68 * uMoon + 0.35 * glint * uReflection);
  float warmth = pow(max(0.0, 1.0 - distance(p, uPlayer.xz) / 6.0), 2.0) * uTorch;
  color += uTorchColor * warmth * (0.016 + ink * 0.25);
  gl_FragColor = vec4(color, wet);
}
