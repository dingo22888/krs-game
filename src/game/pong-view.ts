import * as THREE from 'three';
import type {FloorPlan,Furniture} from '../data/house.ts';
import {origin} from './building.ts';
import {monitorSize,studioFrame} from './studio.ts';
import {Pong} from './pong.ts';

export class PongView {
 readonly game=new Pong();
 readonly canvas=document.createElement('canvas');
 readonly texture:THREE.CanvasTexture;
 readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
 readonly target=new THREE.Vector3();readonly normal=new THREE.Vector3();
 readonly ui=document.createElement('section');readonly prompt=document.createElement('button');
 private status:HTMLElement;private playButton:HTMLButtonElement;
 private phase:'idle'|'in'|'game'|'out'='idle';private time=0;private focus=0;private exitFrom=1;
 private savedPosition=new THREE.Vector3();private savedRotation=new THREE.Quaternion();private savedFov=74;
 private seatedPosition=new THREE.Vector3();private seatedRotation=new THREE.Quaternion();
 private keys=new Set<string>();private paddle=.5;private running=false;private ray=new THREE.Raycaster();private lastCamera?:THREE.PerspectiveCamera;
 onResult=(_result:{player:number;opponent:number})=>{};onCancel=()=>{};
 startRanked(){this.game.reset();this.paddle=.5;this.running=true;this.updateStatus();this.draw();}
 available=false;onEnter=()=>{};onExit=()=>{};onReturn=()=>{};
 constructor(plan:FloorPlan,f:Furniture,private scene:THREE.Scene){
  const {w,point,angle}=studioFrame(f),size=monitorSize(f),p=point(w/2,.232),[ox,oy,oz]=origin(plan);
  this.canvas.width=1600;this.canvas.height=450;this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
  this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(size.width,size.height),new THREE.MeshBasicMaterial({map:this.texture,toneMapped:false}));
  this.mesh.position.set(p[0]+ox,oy+f.height+.182+size.height/2,p[1]+oz);this.mesh.rotation.y=angle;scene.add(this.mesh);this.mesh.updateMatrixWorld();
  this.target.copy(this.mesh.position);this.normal.set(0,0,1).applyQuaternion(this.mesh.quaternion);
  this.prompt.type='button';this.prompt.className='pong-prompt';this.prompt.textContent='E / Klick · Hinsetzen & Pong spielen';this.prompt.hidden=true;document.body.append(this.prompt);
  this.ui.className='pong-ui';this.ui.hidden=true;this.ui.setAttribute('role','dialog');this.ui.setAttribute('aria-label','Pong am Schreibtisch');this.ui.setAttribute('aria-modal','true');
  this.ui.innerHTML='<div class="pong-instructions">BÜROPAUSE · PONG<span>Maus bewegen, W/S oder ↑/↓ · Mobil: nach oben/unten ziehen</span><p role="status" aria-live="polite"></p></div><div class="pong-actions"><button type="button" data-play>Spiel starten</button><button type="button" data-exit>Aufstehen · Esc</button></div>';
  this.status=this.ui.querySelector('p')!;this.playButton=this.ui.querySelector('[data-play]')!;
  this.ui.querySelector('[data-exit]')!.addEventListener('click',()=>this.leave());
  this.playButton.addEventListener('click',()=>{if(this.game.winner){this.game.reset();this.paddle=.5;}this.running=!this.running;this.updateStatus();});
  const move=(e:PointerEvent)=>{if(this.phase!=='game')return;const a=this.screenPoint(-.5,.5),b=this.screenPoint(.5,-.5);this.paddle=THREE.MathUtils.clamp((e.clientY-a.y)/(b.y-a.y),.1,.9);};
  this.ui.addEventListener('pointermove',move);this.ui.addEventListener('pointerdown',e=>{if((e.target as HTMLElement).closest('button'))return;this.ui.setPointerCapture(e.pointerId);move(e);});
  this.ui.addEventListener('keydown',e=>{if(e.key==='Tab'){const buttons=[...this.ui.querySelectorAll<HTMLButtonElement>('button')];const i=buttons.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}});
  document.body.append(this.ui);this.prompt.addEventListener('click',()=>this.enter());this.draw();
 }
 get active(){return this.phase!=='idle';}
 private screenPoint(x:number,y:number){const s=this.mesh.geometry.parameters;const p=this.mesh.localToWorld(new THREE.Vector3(x*s.width,y*s.height,0)).project(this.lastCamera!);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};}
 key(code:string,down:boolean){
  if(this.active){if(['KeyW','KeyS','ArrowUp','ArrowDown'].includes(code)){if(down)this.keys.add(code);else this.keys.delete(code);return true;}if(down&&code==='Escape'){this.leave();return true;}}
  else if(this.available&&down&&code==='KeyE'){this.enter();return true;}return false;
 }
 hidePrompt(){this.available=false;this.prompt.hidden=true;}
 approach(camera:THREE.PerspectiveCamera){
  this.lastCamera=camera;if(this.active)return;
  const delta=camera.position.clone().sub(this.target),front=delta.dot(this.normal);
  this.available=false;
  if(front>.35&&front<1.65&&delta.length()<1.85){
   this.ray.setFromCamera(new THREE.Vector2(),camera);const hit=this.ray.intersectObject(this.mesh)[0];
   if(hit&&!this.ray.intersectObjects(this.scene.children,false).some(h=>h.distance<hit.distance-.015))this.available=true;
  }
  this.prompt.hidden=!this.available;
 }
 enter(){
  if(!this.available||!this.lastCamera||this.active)return;
  const camera=this.lastCamera;this.savedPosition.copy(camera.position);this.savedRotation.copy(camera.quaternion);this.savedFov=camera.fov;
  this.seatedPosition.copy(this.target).addScaledVector(this.normal,.86);this.seatedPosition.y+=.075;
  const c=camera.clone();c.position.copy(this.seatedPosition);c.lookAt(this.target);this.seatedRotation.copy(c.quaternion);
  this.phase='in';this.time=0;this.focus=0;this.running=false;this.keys.clear();this.ui.hidden=false;this.hidePrompt();document.body.classList.add('pong-playing');this.updateStatus();this.onEnter();
 }
 leave(){if(!this.active||this.phase==='out')return;this.onCancel();this.exitFrom=this.focus;this.phase='out';this.time=0;this.running=false;this.keys.clear();this.onExit();}
 private updateStatus(){this.status.textContent=this.game.winner||`${this.game.scores[0]} : ${this.game.scores[1]} · ${this.running?'Erster mit 5 Punkten gewinnt.':'Bereit für eine Büropause? Du spielst links.'}`;this.playButton.textContent=this.game.winner?'Neue Partie':this.running?'Pause':'Spiel starten';}
 update(camera:THREE.PerspectiveCamera,dt:number){
  this.lastCamera=camera;if(!this.active)return;
  this.time+=dt;const progress=Math.min(this.time/.7,1),smooth=progress*progress*(3-2*progress),t=this.phase==='out'?this.exitFrom*(1-smooth):this.phase==='in'?smooth:1;this.focus=t;
  camera.position.lerpVectors(this.savedPosition,this.seatedPosition,t);camera.quaternion.slerpQuaternions(this.savedRotation,this.seatedRotation,t);
  const size=this.mesh.geometry.parameters,fit=Math.max(size.height/.43,size.width/(camera.aspect*.86));
  const fov=THREE.MathUtils.radToDeg(2*Math.atan(fit/(2*.86)));camera.fov=THREE.MathUtils.lerp(this.savedFov,fov,t);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  this.playButton.disabled=this.phase!=='game';
  if(this.phase==='in'&&progress===1){this.phase='game';this.playButton.disabled=false;this.playButton.focus({preventScroll:true});}
  if(this.phase==='out'&&progress===1){this.cancel(camera);this.onReturn();return;}
  if(this.phase==='game'&&this.running){
   const dir=Number(this.keys.has('KeyS')||this.keys.has('ArrowDown'))-Number(this.keys.has('KeyW')||this.keys.has('ArrowUp'));
   if(dir)this.paddle=THREE.MathUtils.clamp(this.paddle+dir*dt*1.15,.1,.9);
   const old=this.game.scores.join();this.game.step(dt,this.paddle);
   if(old!==this.game.scores.join()||this.game.winner){this.updateStatus();if(this.game.winner){this.running=false;this.onResult({player:this.game.scores[0],opponent:this.game.scores[1]});}}
   this.draw();
  }
 }
 private draw(){
  const c=this.canvas.getContext('2d')!,g=this.game;c.fillStyle='#0b171c';c.fillRect(0,0,1600,450);
  c.fillStyle='#9ed9c5';c.font='26px monospace';c.fillText('KRS / ARCADE',35,55);c.fillStyle='#d8e9df';c.font='bold 52px monospace';c.fillText('PONG',35,126);
  c.font='22px monospace';c.fillStyle='#8ca4a5';c.fillText('BÜROPAUSE',35,175);c.fillText('DU     PC',1330,55);c.font='bold 58px monospace';c.fillStyle='#e1ecd5';c.fillText(`${g.scores[0]} : ${g.scores[1]}`,1320,126);
  c.font='20px monospace';c.fillStyle='#8ca4a5';c.fillText('BEST OF 9',1320,180);
  const x=310,y=25,w=940,h=400;c.strokeStyle='#365451';c.lineWidth=2;c.strokeRect(x,y,w,h);c.setLineDash([9,13]);c.beginPath();c.moveTo(x+w/2,y);c.lineTo(x+w/2,y+h);c.stroke();c.setLineDash([]);
  c.fillStyle='#aee1cd';c.fillRect(x+w*.04,y+(g.player-.09)*h,12,.18*h);c.fillStyle='#e9d5ad';c.fillRect(x+w*.948,y+(g.opponent-.09)*h,12,.18*h);
  c.fillStyle='#f3f4df';c.beginPath();c.arc(x+g.ball.x*w,y+g.ball.y*h,7,0,Math.PI*2);c.fill();
  if(!this.active||g.winner){c.fillStyle='#0b171ce8';c.fillRect(x+125,y+140,w-250,100);c.fillStyle='#d8e9df';c.textAlign='center';c.font='30px monospace';c.fillText(g.winner||'HINSETZEN & LOSLEGEN',x+w/2,y+200);c.textAlign='left';}
  this.texture.needsUpdate=true;
 }
 cancel(camera:THREE.PerspectiveCamera){this.onCancel();if(this.active){camera.position.copy(this.savedPosition);camera.quaternion.copy(this.savedRotation);camera.fov=this.savedFov;camera.updateProjectionMatrix();}this.phase='idle';this.running=false;this.keys.clear();this.ui.hidden=true;this.hidePrompt();document.body.classList.remove('pong-playing');this.draw();}
 dispose(){this.ui.remove();this.prompt.remove();this.texture.dispose();document.body.classList.remove('pong-playing');}
}
