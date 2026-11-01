uniform sampler2D uColor, uDepth, uAtlas;
uniform mat4 uSourceInv, uSourceWorld, uMainVP;
uniform vec3 uActorPosition;
uniform vec2 uGrid;
varying vec2 vUv;

void main() {
  // Take the silhouette and depth at this pixel, even when the center of its
  // glyph cell falls just outside a hoof, the reins or the rider's head.
  vec4 surface = texture2D(uColor, vUv);
  if (surface.a < 0.5) discard;

  vec2 baseCells = vUv * uGrid;
  float pixelsPerBaseCell = 1.0 / max(max(fwidth(baseCells).x, fwidth(baseCells).y), 0.001);
  float level = clamp(ceil(log2(3.0 / pixelsPerBaseCell)), 0.0, 3.0);
  vec2 grid = uGrid / exp2(level);
  vec2 cells = vUv * grid;
  vec4 center = texture2D(uColor, (floor(cells) + 0.5) / grid);
  vec3 linearColor = mix(surface.rgb, center.rgb, center.a * 0.55);
  vec3 color = pow(clamp(linearColor, 0.0, 1.0), vec3(1.0 / 2.2));
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float glyph = floor(clamp(7.0 + luma * 24.0, 7.0, 31.0));
  vec2 atlasCell = vec2(mod(glyph, 8.0), floor(glyph / 8.0));
  // Derivatives of continuous cell coordinates keep atlas tile boundaries
  // from selecting an unrelated, nearly transparent mip level.
  float ink = textureGrad(uAtlas, (atlasCell + fract(cells)) / 8.0,
                          dFdx(cells) / 8.0, dFdy(cells) / 8.0).a;
  float detail = smoothstep(2.0, 6.0, pixelsPerBaseCell * exp2(level));
  float tone = mix(0.68 + 0.35 * ink, 0.24 + 1.01 * ink, detail);

  float depth = texture2D(uDepth, vUv).r;
  vec4 local = uSourceInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = uSourceWorld * (local / local.w);
  world.xyz += uActorPosition;
  vec4 clip = uMainVP * world;
  gl_FragDepth = 0.5 * clip.z / clip.w + 0.5;
  gl_FragColor = vec4(color * tone, 1.0);
}
