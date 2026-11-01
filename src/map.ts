import type {WorldDocument} from './types';
import {riverDistance,pathX,hash} from './world';
export class WorldMap {
 private texture=document.createElement('canvas');zoom=1;pan=[0,0];
 constructor(){this.texture.width=this.texture.height=1024;}
 rebuild(w:WorldDocument){const c=this.texture.getContext('2d')!;c.fillStyle='#050609';c.fillRect(0,0,1024,1024);c.font='5px monospace';c.textAlign='center';for(let z=-128;z<128;z+=1.5)for(let x=-128;x<128;x+=1.5){const rd=riverDistance(x,z,w);let char=';',color='#1d2822';if(rd<w.river.width*.5){char='≈';color='#526279';}else if(Math.abs(x-pathX(z))<2){char='·';color='#8c8a81';}else if(hash(x*10,z*10,24)>.8){char=':';color='#39413d';}c.fillStyle=color;c.fillText(char,(x+128)*4,(z+128)*4);}
 c.font='8px monospace';for(const p of w.props){c.fillStyle=p.asset==='tree'?'#89968d':'#555c62';c.fillText(p.asset==='tree'?'♠':p.asset==='ruin'?'#':'°',(p.x+128)*4,(p.z+128)*4);}for(const s of w.strokes){c.strokeStyle=s.mode==='erase'?'#080a0d':s.color;c.lineWidth=s.radius*8;c.globalAlpha=.18;c.lineCap='round';c.beginPath();s.points.forEach(([x,z],i)=>i?c.lineTo((x+128)*4,(z+128)*4):c.moveTo((x+128)*4,(z+128)*4));c.stroke();}c.globalAlpha=1;c.strokeStyle='#5b3d3e';c.lineWidth=5;c.strokeRect(2,2,1020,1020);}
 draw(canvas:HTMLCanvasElement,w:WorldDocument,mini=false){const c=canvas.getContext('2d')!,rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}const width=canvas.width,height=canvas.height;c.fillStyle='#030407';c.fillRect(0,0,width,height);let scale:number,ox:number,oy:number;if(mini){scale=width/280;ox=width/2-(w.player.x+128)*4*scale;oy=height/2-(w.player.z+128)*4*scale;}else{scale=Math.min(width,height)/1024*this.zoom;ox=(width-1024*scale)/2+this.pan[0]*dpr;oy=(height-1024*scale)/2+this.pan[1]*dpr;}c.imageSmoothingEnabled=false;c.drawImage(this.texture,ox,oy,1024*scale,1024*scale);if (!w.player.mounted) {
      const [hx, hz] = w.player.horse;
      c.fillStyle = '#b7a07b';
      c.font = (mini ? 11 : 14*dpr) + 'px monospace';
      c.textAlign = 'center';
      c.fillText('♞', (hx+128)*4*scale+ox, (hz+128)*4*scale+oy);
    }
    const px=(w.player.x+128)*4*scale+ox,py=(w.player.z+128)*4*scale+oy;c.fillStyle='#ddd59d';c.font=`${mini?11:15*dpr}px monospace`;c.textAlign='center';c.fillText('@',px,py);if(!mini){c.fillStyle='#b8b9af';c.font=`${11*dpr}px monospace`;c.fillText('Wanderer',px,py-17*dpr);for(const [label,x,z] of [['OLD WATCH',0,-10],['WILLOW REACH',-25,-50],['GLYPH MEADOWS',20,45]] as const)c.fillText(label,(x+128)*4*scale+ox,(z+128)*4*scale+oy);}}
}
