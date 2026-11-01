import {validateWorld} from './world';
import type {WorldDocument} from './types';
function db(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('glyph-valley',1);r.onupgradeneeded=()=>r.result.createObjectStore('worlds');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function saveWorld(w:WorldDocument){const d=await db();await new Promise<void>((resolve,reject)=>{const tx=d.transaction('worlds','readwrite');tx.objectStore('worlds').put(structuredClone(w),'current');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});d.close();}
export async function loadWorld(){const d=await db();const v=await new Promise<unknown>((resolve,reject)=>{const r=d.transaction('worlds').objectStore('worlds').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});d.close();return v?validateWorld(v):null;}
export function downloadWorld(w:WorldDocument){const blob=new Blob([JSON.stringify(w)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='glyph-valley.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
