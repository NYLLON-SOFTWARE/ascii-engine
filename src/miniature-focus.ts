import * as T from 'three';

// A tilted oval of sharp ground follows the projected body. Progressively
// broader mip levels supply the blur without sampling across the whole screen.
const fragmentShader = `
uniform sampler2D uScene;
uniform vec2 uSize, uFocus, uRadius;
varying vec2 vUv;
void main() {
  vec2 delta = vUv - uFocus;
  delta.x *= uSize.x / uSize.y;
  delta.y += 0.10 * delta.x;
  float falloff = smoothstep(0.95, 2.55, length(delta / uRadius));
  float blur = falloff * min(uSize.y * 0.009, 18.0);
  if (blur < 0.25) {
    gl_FragColor = textureLod(uScene, vUv, 0.0);
    return;
  }
  float level = max(0.0, log2(max(1.0, blur * 0.85)));
  vec2 tap = 0.68 * blur / uSize;
  vec2 a = vec2(tap.x, 0.32 * tap.y), b = vec2(-0.32 * tap.x, tap.y);
  vec3 light = textureLod(uScene, vUv, level).rgb * 0.32;
  light += 0.17 * (textureLod(uScene, vUv + a, level).rgb + textureLod(uScene, vUv - a, level).rgb
                + textureLod(uScene, vUv + b, level).rgb + textureLod(uScene, vUv - b, level).rgb);
  gl_FragColor = vec4(light, 1.0);
}`;

export class MiniatureFocus {
  private readonly target: T.WebGLRenderTarget;
  private readonly scene = new T.Scene();
  private readonly screenCamera = new T.Camera();
  private readonly size = new T.Vector2(1, 1);
  private readonly focus = new T.Vector2();
  private readonly radius = new T.Vector2();
  private readonly foot = new T.Vector3();
  private readonly head = new T.Vector3();

  constructor(renderer: T.WebGLRenderer) {
    const gl = renderer.getContext();
    this.target = new T.WebGLRenderTarget(1, 1, {
      samples: Math.min(4, gl.getParameter(gl.SAMPLES)),
      generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter,
      depthBuffer: true, resolveDepthBuffer: false
    });
    this.target.texture.name = 'Focused meadow scene';
    const triangle = new T.BufferGeometry();
    triangle.setAttribute('position', new T.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0], 3));
    const material = new T.ShaderMaterial({
      uniforms: {
        uScene: {value: this.target.texture}, uSize: {value: this.size},
        uFocus: {value: this.focus}, uRadius: {value: this.radius}
      },
      vertexShader: 'varying vec2 vUv; void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader, depthTest: false, depthWrite: false, toneMapped: false
    });
    const mesh = new T.Mesh(triangle, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  resize(renderer: T.WebGLRenderer) {
    renderer.getDrawingBufferSize(this.size);
    this.size.set(Math.max(1, this.size.x), Math.max(1, this.size.y));
    this.target.setSize(this.size.x, this.size.y);
  }

  render(renderer: T.WebGLRenderer, world: T.Scene, camera: T.Camera, origin: T.Vector3, mounted: boolean) {
    this.foot.copy(origin).project(camera);
    this.head.copy(origin);
    this.head.y += mounted ? 2.95 : 1.8;
    this.head.project(camera);
    this.focus.set(.5 + .25 * (this.foot.x + this.head.x), .5 + .25 * (this.foot.y + this.head.y));
    const halfHeight = Math.abs(this.head.y - this.foot.y) * .25;
    const depth = -this.foot.copy(origin).applyMatrix4(camera.matrixWorldInverse).z;
    const scale = .5 * camera.projectionMatrix.elements[5] / (camera instanceof T.PerspectiveCamera ? Math.max(.1, depth) : 1);
    this.radius.set(.20 + scale * (mounted ? 1.35 : .40), .115 + halfHeight + (mounted ? scale * .46 : 0));

    const output = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    try { renderer.render(world, camera); }
    finally { renderer.setRenderTarget(output); }
    renderer.render(this.scene, this.screenCamera);
  }
}
