import { GrassForm } from './types';

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
export const grassVertex = `${common}
uniform vec2 uGrassRange, uGrassTrail;
attribute vec2 aBase;
attribute float aHeight, aAngle, aPhase, aForm;
attribute vec3 aColor;
varying vec3 vColor;
varying vec2 vUv;
varying float vForm;
void main(){
  vUv=uv; vForm=aForm;
  float tip=position.y, arc=tip*tip;
  float trait=fract(aPhase*1.731), variation=aPhase/6.283;
  bool flower=aForm==${GrassForm.flower}., broad=aForm==${GrassForm.ribbon}., stalk=aForm==${GrassForm.seedHead}.;
  vec2 grain=vec2(cos(aAngle),sin(aAngle)), side=vec2(-grain.y,grain.x);

  // A passing gust drifts across neighbouring crowns. Only the small flutter
  // is individual. A blade keeps its own curved silhouette even in still air.
  float gust=sin(dot(aBase,vec2(.53,.31))-1.55*uTime+.60*sin(aBase.y*.33-uTime*.48));
  float flutter=sin(uTime*3.8+dot(aBase,vec2(1.77,-.84))+aPhase*.8);
  vec2 breeze=(vec2(.91,.42)*(.13+.41*gust)+side*.095*flutter)*aHeight*uWind;
  vec2 lean=grain*aHeight*(stalk?.18+.22*trait:.25+.70*trait);

  vec2 track=uGrassTrail-uPlayer.xz;
  float along=clamp(dot(aBase-uPlayer.xz,track)/max(.0001,dot(track,track)),0.,1.);
  vec2 away=aBase-(uPlayer.xz+along*track);
  float gap=length(away);
  float pressed=(1.-smoothstep(.05,.58+.19*trait,gap))*(1.-.62*along);
  vec2 lay=away/max(.07,gap)*pressed*(.11+.40*aHeight);
  float range=smoothstep(uGrassRange.x-3.*variation,uGrassRange.y-4.*variation,distance(aBase,uPlayer.xz));
  float border=smoothstep(119.,127.9,max(abs(aBase.x),abs(aBase.y)));
  float cover=1.-uChase*max(range,border);
  float width=broad?.030+.022*trait:.013+.014*trait;
  if(flower || stalk) width=flower?.084:.073;
  else width*=1.-.965*pow(tip,1.65);
  vec2 curl=side*(trait-.5)*aHeight*.24*tip*arc;
  vec2 root=aBase+cover*((lean+breeze+lay)*arc+curl+side*position.x*width);
  vec3 world=vec3(root.x,heightAt(aBase)+aHeight*(tip-.07*arc)*(1.-.53*pressed)*cover,root.y);

  vec3 color=aColor;
  if(flower) color=mix(color,vec3(.61,.65,.59),smoothstep(.55,.83,tip));
  if(stalk) color=mix(color,vec3(.45,.43,.31),.72*smoothstep(.48,.83,tip));
  vec3 normal=normalize(vec3(grain.x*(.38+.42*tip),1.-.33*tip,grain.y*(.38+.42*tip)));
  vColor=illuminate(color,normal,world)*(.57+.72*tip);
  vColor=mix(vColor,uDusk,max(distanceMist(aBase),1.-cover));
  gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
}`;
export const grassFragment = `
varying vec3 vColor;
varying vec2 vUv;
varying float vForm;
void main(){
  float x=vUv.x-.5, across=abs(x), h=vUv.y;
  float form=floor(vForm+.5);
  if(form==${GrassForm.flower}.) {
    // Four pale petals on a slender stalk.
    float y=h-.78;
    bool petal=h>.58 && (across<.09 || abs(y)<.055 || abs(across-abs(y)*1.35)<.085);
    if(across>.075 && !petal)discard;
  } else if(form==${GrassForm.seedHead}. && across>.065) {
    // Alternating oblique awns grow from the upper part of a seed stem.
    float t=(h-.57)/.43;
    float envelope=.44*(1.-.66*t);
    float awn=fract(t*3.8+step(0.,x)*.5)-(.12+.67*across/max(.1,envelope));
    if(t<0. || across>envelope || abs(awn)>.15)discard;
  }
  float fold=smoothstep(.30,.76,vUv.x+.09*(h-.5));
  float rib=form==${GrassForm.ribbon}. ? .10*(1.-smoothstep(.035,.19,abs(x+.05*h))) : 0.;
  gl_FragColor=vec4(vColor*(.85+.17*fold+rib),1.);
}`;
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
  // Broken flecks of leaf litter stay visible between crowns and in worn patches.
  vec2 litterGrid=vWorld.xz/vec2(.19,.16);
  float fleck=hash(floor(litterGrid)+37.);
  float mark=fleck>.95?8.:(fleck>.90?2.:1.);
  vec2 tile=vec2(mod(mark,8.),floor(mark/8.));
  float litter=textureGrad(uAtlas,(tile+fract(litterGrid))/8.,dFdx(litterGrid)/8.,dFdy(litterGrid)/8.).a;
  soil+=(1.-road)*vec3(.017,.024,.017)*(.19+litter*smoothstep(.84,.94,fleck))*(.65+uMoon);
  // Leave a little meadow colour under the thinning blades before the ground fades into night.
  float d=distance(vWorld.xz,uPlayer.xz);
  float mottling=.5+.5*sin(vWorld.x*.38+sin(vWorld.z*.24))*cos(vWorld.z*.29);
  soil+=uChase*(1.-road)*smoothstep(12.,38.,d)*(.55+.45*mottling)*vec3(.016,.024,.014);
  vec3 gravel=vec3(.18,.19,.23)*ink*(.5+hash(floor(grid))*.5)*road;
  float torch=pow(max(0.,1.-d/7.),2.)*uTorch;
  vec3 color=soil+gravel*(.3+uMoon)+gravel*uTorchColor*torch;
  gl_FragColor=vec4(mix(color,uDusk,distanceMist(vWorld.xz)),1.);
}`;
