export const common=`
uniform float uTime; uniform float uMoon; uniform float uWind; uniform float uHaze;
uniform vec3 uPlayer; uniform vec3 uTorchColor; uniform float uTorch;
float heightAt(vec2 p){return sin(p.x*.06)*cos(p.y*.045)*.28;}
vec3 illuminate(vec3 color,vec3 normal,vec3 world){
 float lambert=max(.0,dot(normal,normalize(vec3(-.55,.8,.35))));
 float torch=pow(max(0.,1.-distance(world.xz,uPlayer.xz)/7.),2.)*uTorch;
 vec3 result=color*(.25+uMoon*(.65+lambert*1.25))+color*uTorchColor*torch*1.9;
 return mix(result,vec3(.06,.075,.10),uHaze*.35);
}`;
export const grassVertex=`${common}
attribute vec2 aBase;attribute float aHeight;attribute float aAngle;attribute float aPhase;attribute vec3 aColor;attribute float aFlower;
varying vec3 vColor;varying float vFlower;varying vec2 vUv;
void main(){vUv=uv;vFlower=aFlower;float tip=position.y;vec2 dir=vec2(cos(aAngle),sin(aAngle));
 vec2 away=aBase-uPlayer.xz;float d=length(away);float bend=max(0.,1.-d/.85);
 vec2 wind=vec2(sin(uTime*1.7+aBase.x*.5+aPhase),cos(uTime*.9+aBase.y*.5))*.12*uWind;
 vec2 offset=wind+away/max(d,.05)*bend*.28;
 float wide=aFlower>.5?.065:.018;
 vec3 world=vec3(aBase.x+dir.x*position.x*wide+offset.x*tip*tip,heightAt(aBase)+aHeight*tip*(1.-bend*.55),aBase.y+dir.y*position.x*wide+offset.y*tip*tip);
 vec3 c=mix(aColor,vec3(.66,.69,.68),aFlower*tip);
 vColor=illuminate(c,normalize(vec3(dir.x*.3,1.,dir.y*.3)),world)*(0.6+tip*.65);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
}`;
export const grassFragment=`varying vec3 vColor;varying float vFlower;varying vec2 vUv;void main(){if(vFlower>.5){float x=abs(vUv.x-.5),y=abs(vUv.y-.77);if(vUv.y>.55&&x>.12&&y>.045&&abs(x-y)>.06)discard;if(vUv.y<.55&&x>.1)discard;}gl_FragColor=vec4(vColor,1.);}`;
export const glyphVertex=`${common}
attribute vec3 aOffset;attribute vec3 aColor;attribute vec3 aNormal;attribute float aGlyph;attribute float aSize;attribute float aAlpha;attribute float aSway;
varying vec2 vUv;varying vec3 vColor;varying float vGlyph;varying float vAlpha;
void main(){vUv=uv;vGlyph=aGlyph;vAlpha=aAlpha;vec3 up=vec3(0.,.573576,-.819152);
 vec3 world=aOffset+vec3(position.x*aSize,0.,0.)+up*position.y*aSize*1.5;
 world.x+=sin(uTime*.8+aOffset.z*.7)*aSway*uWind*.07;
 vec3 n=normalize(vec3(aNormal.x,aNormal.y*.574+aNormal.z*.819,-aNormal.y*.819+aNormal.z*.574));
 vColor=illuminate(aColor,n,world);gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.);
}`;
export const glyphFragment=`uniform sampler2D uAtlas;varying vec2 vUv;varying vec3 vColor;varying float vGlyph;varying float vAlpha;
void main(){vec2 cell=vec2(mod(vGlyph,8.),floor(vGlyph/8.));float a=texture2D(uAtlas,(cell+vUv)/8.).a*vAlpha;if(a<.22)discard;gl_FragColor=vec4(vColor,1.);}`;
