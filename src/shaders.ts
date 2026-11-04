// Shared by the distant ground, vegetation, props and water. The overhead
// authoring/reference views retain their calibrated lighting.
export const vista = `
uniform float uChase;
uniform vec3 uDusk;
float distanceMist(vec2 point) {
  float range = distance(point, uPlayer.xz);
  float horizon = smoothstep(30.0, 100.0, range);
  float border = smoothstep(118.0, 128.0, max(abs(point.x), abs(point.y)));
  return uChase * max(horizon, border);
}
`;

export const common=`
uniform float uTime; uniform float uMoon; uniform float uWind; uniform float uHaze;
uniform vec3 uPlayer; uniform vec3 uTorchColor; uniform float uTorch;
${vista}
float heightAt(vec2 p){return sin(p.x*.06)*cos(p.y*.045)*.28;}
vec3 illuminate(vec3 color,vec3 normal,vec3 world){
 float lambert=max(.0,dot(normal,normalize(vec3(-.55,.8,.35))));
 float torch=pow(max(0.,1.-distance(world.xz,uPlayer.xz)/7.),2.)*uTorch;
 vec3 result=color*(.25+uMoon*(.65+lambert*1.25))+color*uTorchColor*torch*1.9;
 return mix(result,vec3(.06,.075,.10),uHaze*.35);
}`;
export const grassVertex=`${common}
uniform vec2 uGrassRange;
attribute vec2 aBase;attribute float aHeight;attribute float aAngle;attribute float aPhase;attribute vec3 aColor;attribute float aFlower;
varying vec3 vColor;varying float vFlower;varying vec2 vUv;
void main(){vUv=uv;vFlower=aFlower;float tip=position.y;vec2 dir=vec2(cos(aAngle),sin(aAngle));
 vec2 away=aBase-uPlayer.xz;float d=length(away);float bend=max(0.,1.-d/.85);
 vec2 wind=vec2(sin(uTime*1.7+aBase.x*.5+aPhase),cos(uTime*.9+aBase.y*.5))*.12*uWind;
 vec2 offset=wind+away/max(d,.05)*bend*.28;
 float variation = aPhase / 6.283;
 float range = smoothstep(uGrassRange.x - 3.0 * variation, uGrassRange.y - 4.0 * variation, d);
 float border = smoothstep(119.0, 127.9, max(abs(aBase.x), abs(aBase.y)));
 float cover = 1.0 - uChase * max(range, border);
 float wide=(aFlower>.5?.065:.018)*cover;
 vec3 world=vec3(aBase.x+dir.x*position.x*wide+offset.x*tip*tip*cover,heightAt(aBase)+aHeight*tip*(1.-bend*.55)*cover,aBase.y+dir.y*position.x*wide+offset.y*tip*tip*cover);
 vec3 c=mix(aColor,vec3(.66,.69,.68),aFlower*tip);
 vColor=illuminate(c,normalize(vec3(dir.x*.3,1.,dir.y*.3)),world)*(0.6+tip*.65);
 vColor=mix(vColor,uDusk,max(distanceMist(aBase),1.0-cover));
 gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
}`;
export const grassFragment=`varying vec3 vColor;varying float vFlower;varying vec2 vUv;void main(){if(vFlower>.5){float x=abs(vUv.x-.5),y=abs(vUv.y-.77);if(vUv.y>.55&&x>.12&&y>.045&&abs(x-y)>.06)discard;if(vUv.y<.55&&x>.1)discard;}gl_FragColor=vec4(vColor,1.);}`;
export const glyphVertex=`${common}
uniform mat3 uCardBasis;
uniform vec3 uSubjectView;
uniform vec2 uSubjectRadius;
attribute vec3 aAnchor;attribute vec3 aOffset;attribute vec3 aColor;attribute vec3 aNormal;attribute float aGlyph;attribute float aSize;attribute float aAlpha;attribute float aSway;
varying vec2 vUv;varying vec3 vColor;varying float vGlyph;varying float vAlpha;
void main(){vUv=uv;vGlyph=aGlyph;vAlpha=aAlpha;
 vec3 cell=aAnchor+uCardBasis*aOffset;
 vec3 world=cell+uCardBasis*vec3(position.x*aSize,position.y*aSize*1.5,0.);
 world.x+=sin(uTime*.8+cell.z*.7)*aSway*uWind*.07;
 vec3 n=normalize(uCardBasis*aNormal);
 vColor=mix(illuminate(aColor,n,world),uDusk,distanceMist(world.xz));
 if(uChase>.5){
   // Open a feathered window only in foreground cells crossing the player.
   vec3 eye=(viewMatrix*vec4(cell,1.)).xyz;
   float fraction=max(eye.z/uSubjectView.z,0.02);
   float radius=length((eye.xy/fraction-uSubjectView.xy)/uSubjectRadius);
   float inFront=smoothstep(0.10,0.65,eye.z-uSubjectView.z);
   vAlpha*=mix(1.,smoothstep(.65,1.5,radius),inFront)*smoothstep(.2,1.2,-eye.z);
 }
 gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
}`;
export const glyphFragment=`uniform sampler2D uAtlas;varying vec2 vUv;varying vec3 vColor;varying float vGlyph;varying float vAlpha;
void main(){vec2 cell=vec2(mod(vGlyph,8.),floor(vGlyph/8.));float a=texture2D(uAtlas,(cell+vUv)/8.).a*vAlpha;if(a<.22)discard;gl_FragColor=vec4(vColor,1.);}`;

export const groundFragment = `
uniform sampler2D uAtlas;
uniform float uMoon, uTorch;
uniform vec3 uPlayer, uTorchColor;
varying vec3 vWorld;
${vista}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  float px=10.+sin(vWorld.z*.055)*5.+sin(vWorld.z*.13)*1.5;
  float road=1.-smoothstep(1.,2.4,abs(vWorld.x-px));
  vec2 grid=vWorld.xz/vec2(.22,.32);
  float glyph=floor(8.+hash(floor(grid))*19.);
  vec2 cell=vec2(mod(glyph,8.),floor(glyph/8.));
  float ink=textureGrad(uAtlas,(cell+fract(grid))/8.,dFdx(grid)/8.,dFdy(grid)/8.).a;
  vec3 soil=vec3(.015,.020,.029)+hash(floor(vWorld.xz*4.))*.006;
  // Leave a little meadow colour under the thinning blades before the ground fades into night.
  float d=distance(vWorld.xz,uPlayer.xz);
  float mottling=.5+.5*sin(vWorld.x*.38+sin(vWorld.z*.24))*cos(vWorld.z*.29);
  soil+=uChase*(1.-road)*smoothstep(12.,38.,d)*(.55+.45*mottling)*vec3(.016,.024,.014);
  vec3 gravel=vec3(.18,.19,.23)*ink*(.5+hash(floor(grid))*.5)*road;
  float torch=pow(max(0.,1.-d/7.),2.)*uTorch;
  vec3 color=soil+gravel*(.3+uMoon)+gravel*uTorchColor*torch;
  gl_FragColor=vec4(mix(color,uDusk,distanceMist(vWorld.xz)),1.);
}`;
