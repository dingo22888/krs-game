import * as THREE from 'three';
import type {FloorPlan} from '../data/house.ts';
import {origin} from './building.ts';
import {studioFrame} from './studio.ts';

/** Procedural finishes: reference photographs remain private. */
export function brewTexture(kind:'wood'|'fabric'|'album'){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const c=canvas.getContext('2d')!;
 c.fillStyle=kind==='wood'?'#805636':kind==='fabric'?'#332218':'#232327';c.fillRect(0,0,256,256);
 if(kind==='wood'){
  for(let i=0;i<220;i++){
   const x=i*1.19;c.strokeStyle=i%3?'#653f2018':'#e8b97418';c.lineWidth=.6;
   c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+6,70,x-5,180,x,256);c.stroke();
  }
 }else if(kind==='fabric'){
  for(let x=0;x<256;x+=64){
   c.fillStyle='#9d3929';c.fillRect(x,0,11,256);c.fillStyle='#d09857';c.fillRect(x+14,0,2,256);c.fillRect(x+57,0,2,256);
   for(let y=24;y<256;y+=48){
    c.strokeStyle='#ad8043';c.lineWidth=1.4;
    for(let j=0;j<12;j++){
     const a=j*Math.PI/6;c.beginPath();c.ellipse(x+36+Math.cos(a)*10,y+Math.sin(a)*13,3,5,a,0,Math.PI*2);c.stroke();
    }
    c.beginPath();c.ellipse(x+36,y,7,9,0,0,Math.PI*2);c.stroke();
   }
  }
  for(let y=0;y<256;y+=3){c.fillStyle='#e3d5ac12';c.fillRect(0,y,256,1);}
 }else{
  const g=c.createLinearGradient(0,0,256,256);g.addColorStop(0,'#874727');g.addColorStop(.5,'#152433');g.addColorStop(1,'#b57647');c.fillStyle=g;c.fillRect(4,4,248,248);
  c.strokeStyle='#deb46c';c.lineWidth=3;
  for(let i=0;i<9;i++){c.beginPath();c.moveTo(25+i*17,210);c.lineTo(120+i*9,50);c.lineTo(85+i*13,190);c.stroke();}
 }
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='fabric'?3:1,kind==='fabric'?3:1);t.anisotropy=4;return t;
}

export function addBrewDecor(scene:THREE.Scene,plan:FloorPlan){
 const [ox,oy,oz]=origin(plan);
 for(const f of plan.furniture.filter(f=>f.kind==='brewSign')){
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=280;
  const c=canvas.getContext('2d')!;c.fillStyle='#142724';c.fillRect(0,0,640,280);
  c.strokeStyle='#89e5af';c.lineWidth=6;c.strokeRect(12,12,616,256);
  c.textAlign='center';c.fillStyle='#a7f4be';c.font='bold 68px Georgia';c.fillText('KrausBräu',320,112);
  c.font='34px monospace';c.fillText('BRAUSTUBE',320,173);c.font='22px monospace';c.fillText('Hopfen. Malz. Gute Gesellschaft.',320,223);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const {w,d,point,angle}=studioFrame(f),p=point(w/2,d+.003);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(w,f.height),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
  sign.position.set(ox+p[0],oy+(f.bottom??0)+f.height/2,oz+p[1]);sign.rotation.y=angle;scene.add(sign);
 }
 const bar=plan.furniture.find(f=>f.kind==='brewBar');if(!bar)return;
 const light=new THREE.PointLight('#ffd6a0',5,5,2);light.position.set(ox+(bar.rect[0]+bar.rect[2])/2,oy+1.67,oz+(bar.rect[1]+bar.rect[3])/2);scene.add(light);
}
