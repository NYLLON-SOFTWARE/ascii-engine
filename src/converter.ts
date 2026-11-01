import {GLYPHS} from './world';
import type {GlyphAsset} from './types';
export interface ConvertInput {id:string;name:string;source:string;normalSource?:string;width:number;height:number;pixels:Uint8ClampedArray;normalPixels?:Uint8ClampedArray;density:number;normalStrength:number;palette:'original'|'moonlit'|'grayscale';worldHeight:number;}
export function convertPixels(input:ConvertInput):GlyphAsset {
 const {width:w,height:h,pixels:p}=input,n=w*h,glyphs:number[]=[],colors:number[]=[],alpha:number[]=[],normals:number[]=[];
 const lum=(x:number,y:number)=>{let k=(Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x)))*4;return (.2126*p[k]+.7152*p[k+1]+.0722*p[k+2])/255*p[k+3]/255;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let i=y*w+x,k=i*4,l=lum(x,y),dx=lum(x+1,y)-lum(x-1,y),dy=lum(x,y+1)-lum(x,y-1);let gi=Math.max(1,Math.min(GLYPHS.length-1,Math.round(l*input.density*(GLYPHS.length-1))));if(Math.hypot(dx,dy)>.2&&l<.65)gi=GLYPHS.indexOf(Math.abs(dx)>Math.abs(dy)*2?'|':Math.abs(dy)>Math.abs(dx)*2?'-':dx*dy>0?'/':'\\');glyphs.push(gi);alpha.push(p[k+3]/255<.1?0:p[k+3]/255);
 let c=[p[k]/255,p[k+1]/255,p[k+2]/255];if(input.palette==='grayscale')c=[l,l,l];if(input.palette==='moonlit')c=[l*.76,l*.86,l];colors.push(...c);
 if(input.normalPixels){const q=input.normalPixels;const nx=q[k]/127.5-1,ny=1-q[k+1]/127.5,nz=q[k+2]/127.5-1,d=Math.hypot(nx,ny,nz)||1;normals.push(nx/d,ny/d,nz/d);}else{let nx=-dx*input.normalStrength,ny=dy*input.normalStrength,nz=.55,d=Math.hypot(nx,ny,nz);normals.push(nx/d,ny/d,nz/d);}
 }
 return {id:input.id,name:input.name,source:input.source,normalSource:input.normalSource,width:w,height:h,glyphs,colors,alpha,normals,pivot:[.5,1],footprint:input.worldHeight*.12,worldHeight:input.worldHeight};
}
