export type V2 = [number, number];
/** Last value in each nine-float vegetation instance. */
export const GrassForm = { blade: 0, flower: 1, ribbon: 2, seedHead: 3 } as const;
export interface GlyphAsset { id:string; name:string; source:string; normalSource?:string; width:number; height:number; glyphs:number[]; colors:number[]; alpha:number[]; normals:number[]; pivot:V2; footprint:number; worldHeight:number; }
export interface Prop { id:string; asset:string; x:number; z:number; rotation:number; scale:number; }
export interface Stroke { id:string; kind:'grass'|'flowers'; mode:'paint'|'erase'|'restyle'; points:V2[]; radius:number; density:number; color:string; softness:number; seed:number; }
export interface Lighting { moon:number; wind:number; haze:number; torchColor:string; reflection:'night sky'|'moon'|'none'; }
export interface Player { x:number; z:number; angle:number; mounted:boolean; torch:boolean; horse:V2; horseAngle?:number; }
export interface WorldDocument { version:1; name:string; seed:number; size:256; props:Prop[]; strokes:Stroke[]; river:{points:V2[]; width:number}; lighting:Lighting; player:Player; assets:GlyphAsset[]; }
export interface ReferenceShot { id:string; name:string; timestamp:number; target:V2; span:number; player:V2; angle:number; mounted:boolean; time:number; ui:'play'|'map'|'editor'; }
export interface Blade { x:number; z:number; height:number; angle:number; phase:number; color:[number,number,number]; flower:number; }
export interface ChunkData { key:string; blades:Float32Array; count:number; }
export type Tool='select'|'place'|'grass'|'flowers'|'river';
