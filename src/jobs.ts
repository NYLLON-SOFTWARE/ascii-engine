import type {ConvertInput} from './converter';
import type {GlyphAsset,WorldDocument} from './types';
export class Jobs {
 private worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'}); private next=0; private pending=new Map<number,{resolve:(v:any)=>void,reject:(e:Error)=>void}>();
 constructor(){this.worker.onmessage=e=>{const p=this.pending.get(e.data.id);if(!p)return;this.pending.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.result);};this.worker.onerror=e=>{for(const p of this.pending.values())p.reject(Error(e.message));this.pending.clear();};}
 call<T>(kind:string,payload:unknown):Promise<T>{return new Promise((resolve,reject)=>{const id=++this.next;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,kind,payload});});}
 chunk(cx:number,cz:number,world:WorldDocument){return this.call<Float32Array>('chunk',{cx,cz,world:{...world,assets:[],props:[]}});}
 convert(input:ConvertInput){return this.call<GlyphAsset>('convert',input);}
}
export async function readImage(source:string,width:number,height?:number){const image=new Image();image.src=source;await image.decode();const h=height??Math.min(256,Math.round(width*image.height/image.width));const canvas=document.createElement('canvas');canvas.width=width;canvas.height=h;const c=canvas.getContext('2d',{willReadFrequently:true})!;c.drawImage(image,0,0,width,h);return {pixels:c.getImageData(0,0,width,h).data,width,height:h};}
export async function toDataURL(url:string){const b=await (await fetch(url)).blob();return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=reject;r.readAsDataURL(b);});}
