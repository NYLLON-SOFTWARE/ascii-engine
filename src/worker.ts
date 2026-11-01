import {generateChunk} from './world';
import {convertPixels} from './converter';
self.onmessage=(e:MessageEvent)=>{const {id,kind,payload}=e.data;try{if(kind==='chunk'){const data=generateChunk(payload.cx,payload.cz,payload.world);self.postMessage({id,result:data},{transfer:[data.buffer]});}else self.postMessage({id,result:convertPixels(payload)});}catch(error){self.postMessage({id,error:String(error)});}};
