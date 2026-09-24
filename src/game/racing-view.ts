import * as THREE from 'three';
import type {FloorPlan,Furniture} from '../data/house.ts';
import {origin} from './building.ts';
import {Racing} from './racing.ts';

export class RacingView {
 readonly game=new Racing();
 readonly canvas=document.createElement('canvas');
 readonly texture:THREE.CanvasTexture;
 readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
 readonly target=new THREE.Vector3();readonly normal=new THREE.Vector3();
 readonly ui=document.createElement('section');readonly prompt=document.createElement('button');
 private status:HTMLElement;private playButton:HTMLButtonElement;
 private phase:'idle'|'in'|'game'|'out'='idle';private time=0;private focus=0;private exitFrom=1;
 private savedPosition=new THREE.Vector3();private savedRotation=new THREE.Quaternion();private savedFov=74;
 private seatedPosition=new THREE.Vector3();private seatedRotation=new THREE.Quaternion();
 private gasPointers=new Set<number>();private brakePointers=new Set<number>();private steeringPointer?:number;
 private keys=new Set<string>();private paddle=0;private running=false;private ray=new THREE.Raycaster();private lastCamera?:THREE.PerspectiveCamera;
 onResult=(_result:{distance:number;collisions:number})=>{};onCancel=()=>{};onPause=()=>{};onNewGame=()=>this.startRanked();
 startRanked(){this.game.reset();this.clearInput();this.running=true;this.updateStatus();this.draw();}
 available=false;onEnter=()=>{};onExit=()=>{};onReturn=()=>{};
 constructor(plan:FloorPlan,f:Furniture,private scene:THREE.Scene){
  const [ox,oy,oz]=origin(plan),width=f.rect[3]-f.rect[1]-.024,height=f.height-.024;
  this.canvas.width=640;this.canvas.height=360;this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;this.texture.magFilter=THREE.NearestFilter;
  this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:this.texture,toneMapped:false}));
  this.mesh.position.set(ox+f.rect[0]-.005,oy+(f.bottom??1.03)+f.height/2,oz+(f.rect[1]+f.rect[3])/2);this.mesh.rotation.y=-Math.PI/2;scene.add(this.mesh);this.mesh.updateMatrixWorld();
  this.target.copy(this.mesh.position);this.normal.set(-1,0,0);
  this.prompt.type='button';this.prompt.className='pong-prompt racing-prompt';this.prompt.textContent='E / Klick · Konsole spielen';this.prompt.hidden=true;document.body.append(this.prompt);
  this.ui.className='pong-ui racing-ui';this.ui.hidden=true;this.ui.setAttribute('role','dialog');this.ui.setAttribute('aria-label','Retro-Rennen am Fernseher');this.ui.setAttribute('aria-modal','true');
  this.ui.innerHTML='<div class="pong-instructions">KRS TURBO · 1992<span>←/→ Lenken · ↑ Gas · ↓ Bremse (oder WASD) · 60 Sekunden</span><p role="status" aria-live="polite"></p></div><div class="racing-pedals"><button type="button" data-brake aria-label="Bremse halten">↓ Bremse</button><button type="button" data-gas aria-label="Gas halten">↑ Gas</button></div><div class="pong-actions"><button type="button" data-play>Spiel starten</button><button type="button" data-pause>Pause</button><button type="button" data-exit>Zurück ins Wohnzimmer</button></div>';
  this.status=this.ui.querySelector('p')!;this.playButton=this.ui.querySelector('[data-play]')!;
  this.ui.querySelector('[data-exit]')!.addEventListener('click',()=>this.leave());
  this.playButton.addEventListener('click',()=>{if(!this.running)this.onNewGame();});
  this.ui.querySelector('[data-pause]')!.addEventListener('click',()=>this.onPause());
  const move=(e:PointerEvent)=>{if(this.phase!=='game'||e.pointerId!==this.steeringPointer)return;const a=this.screenPoint(-.5,0),b=this.screenPoint(.5,0);this.paddle=THREE.MathUtils.clamp(((e.clientX-a.x)/(b.x-a.x)-.5)*2,-1,1);};
  this.ui.addEventListener('pointermove',move);
  this.ui.addEventListener('pointerdown',e=>{
   if((e.target as HTMLElement).closest('button')||this.steeringPointer!==undefined)return;
   this.steeringPointer=e.pointerId;this.ui.setPointerCapture(e.pointerId);move(e);
  });
  const releaseSteering=(e:PointerEvent)=>{if(e.pointerId===this.steeringPointer){this.steeringPointer=undefined;this.paddle=0;}};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])this.ui.addEventListener(event,releaseSteering as EventListener);
  for(const [selector,pointers] of [['[data-gas]',this.gasPointers],['[data-brake]',this.brakePointers]] as const){
   const button=this.ui.querySelector<HTMLButtonElement>(selector)!;
   button.addEventListener('pointerdown',e=>{e.preventDefault();if(this.phase!=='game'||!this.running)return;button.setPointerCapture(e.pointerId);pointers.add(e.pointerId);button.classList.add('pressed');});
   const release=(e:PointerEvent)=>{pointers.delete(e.pointerId);button.classList.toggle('pressed',pointers.size>0);};
   for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,release as EventListener);
  }
  this.ui.addEventListener('keydown',e=>{if(e.key==='Tab'){const buttons=[...this.ui.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const i=buttons.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}});
  document.body.append(this.ui);this.prompt.addEventListener('click',()=>this.enter());this.draw();
 }
 get active(){return this.phase!=='idle';}
 private screenPoint(x:number,y:number){const s=this.mesh.geometry.parameters;const p=this.mesh.localToWorld(new THREE.Vector3(x*s.width,y*s.height,0)).project(this.lastCamera!);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};}
 key(code:string,down:boolean){
  if(this.active){if(['KeyA','KeyD','ArrowLeft','ArrowRight','KeyW','KeyS','ArrowUp','ArrowDown'].includes(code)){if(down)this.keys.add(code);else this.keys.delete(code);return true;}}
  else if(this.available&&down&&code==='KeyE'){this.enter();return true;}return false;
 }
 hidePrompt(){this.available=false;this.prompt.hidden=true;}
 approach(camera:THREE.PerspectiveCamera){
  this.lastCamera=camera;if(this.active)return;
  const delta=camera.position.clone().sub(this.target),front=delta.dot(this.normal);
  this.available=false;
  if(front>.35&&front<3.6&&delta.length()<3.8){
   this.ray.setFromCamera(new THREE.Vector2(),camera);const hit=this.ray.intersectObject(this.mesh)[0];
   if(hit&&!this.ray.intersectObjects(this.scene.children,false).some(h=>h.distance<hit.distance-.015))this.available=true;
  }
  this.prompt.hidden=!this.available;
 }
 enter(){
  if(!this.available||!this.lastCamera||this.active)return;
  const camera=this.lastCamera;this.savedPosition.copy(camera.position);this.savedRotation.copy(camera.quaternion);this.savedFov=camera.fov;
  this.seatedPosition.copy(camera.position);
  const c=camera.clone();c.position.copy(this.seatedPosition);c.lookAt(this.target);this.seatedRotation.copy(c.quaternion);
  this.phase='in';this.time=0;this.focus=0;this.running=false;this.clearInput();this.ui.hidden=false;this.hidePrompt();document.body.classList.add('racing-playing');this.updateStatus();this.onEnter();
 }
 leave(){if(!this.active||this.phase==='out')return;this.onCancel();this.exitFrom=this.focus;this.phase='out';this.time=0;this.running=false;this.clearInput();this.onExit();}
 clearInput(){this.keys.clear();this.paddle=0;this.steeringPointer=undefined;this.gasPointers.clear();this.brakePointers.clear();this.ui.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));}
 private updateStatus(){this.status.textContent=this.game.finished?`Ziel! ${Math.floor(this.game.distance)} m · ${this.game.collisions} Rempler`:`${Math.ceil(60-this.game.time)} s · ${Math.floor(this.game.distance)} m · ${this.game.collisions} Rempler`;this.playButton.textContent=this.game.finished?'Neues Rennen':this.running?'Rennen läuft':'Rennen starten';}
 update(camera:THREE.PerspectiveCamera,dt:number){
  this.lastCamera=camera;if(!this.active)return;
  this.time+=dt;const progress=Math.min(this.time/.7,1),smooth=progress*progress*(3-2*progress),t=this.phase==='out'?this.exitFrom*(1-smooth):this.phase==='in'?smooth:1;this.focus=t;
  camera.position.lerpVectors(this.savedPosition,this.seatedPosition,t);camera.quaternion.slerpQuaternions(this.savedRotation,this.seatedRotation,t);
  const size=this.mesh.geometry.parameters,fit=Math.max(size.height/.60,size.width/(camera.aspect*.86));
  const fov=THREE.MathUtils.radToDeg(2*Math.atan(fit/(2*this.seatedPosition.distanceTo(this.target))));camera.fov=THREE.MathUtils.lerp(this.savedFov,fov,t);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  this.playButton.disabled=this.phase!=='game'||this.running;
  if(this.phase==='in'&&progress===1){this.phase='game';this.playButton.disabled=false;this.playButton.focus({preventScroll:true});}
  if(this.phase==='out'&&progress===1){this.cancel(camera);this.onReturn();return;}
  if(this.phase==='game'&&this.running){
   const keyboard=Number(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
   const brake=this.keys.has('KeyS')||this.keys.has('ArrowDown')||this.brakePointers.size>0;
   const gas=this.keys.has('KeyW')||this.keys.has('ArrowUp')||this.gasPointers.size>0;
   this.game.step(dt,keyboard||this.paddle,brake?-1:gas?1:0);this.updateStatus();
   if(this.game.finished){this.running=false;this.onResult(this.game.result());}
   this.draw();
  }
 }
 private draw(){
  const c=this.canvas.getContext('2d')!,g=this.game;
  c.fillStyle='#142539';c.fillRect(0,0,640,360);
  c.fillStyle='#67c7c5';c.font='bold 16px monospace';c.fillText('KRS TURBO',15,28);c.font='12px monospace';c.fillStyle='#e4e6cf';c.fillText('1992',15,48);
  c.fillText('STRECKE',15,110);c.font='bold 20px monospace';c.fillText(`${Math.floor(g.distance)} m`,15,138);
  c.font='12px monospace';c.fillText('ZEIT',520,36);c.font='bold 24px monospace';c.fillText(`${Math.ceil(60-g.time)} s`,520,65);
  c.font='12px monospace';c.fillText('TEMPO',520,124);c.fillText(`${Math.round(g.speed*3.6)} km/h`,520,147);c.fillText('REMPLER',520,217);c.fillText(String(g.collisions),520,240);
  c.fillStyle='#487751';c.fillRect(142,0,356,360);c.fillStyle='#333844';c.fillRect(176,0,288,360);
  const scroll=g.distance*5%40;
  for(let y=-40;y<360;y+=40){c.fillStyle='#eae4c9';c.fillRect(173,y+scroll,5,23);c.fillRect(462,y+scroll,5,23);c.fillStyle='#a7adb0';c.fillRect(269,y+scroll,3,19);c.fillRect(366,y+scroll,3,19);}
  const car=(x:number,y:number,color:string)=>{c.fillStyle='#111923';c.fillRect(x-15,y-14,30,9);c.fillRect(x-15,y+12,30,9);c.fillStyle=color;c.fillRect(x-11,y-23,22,48);c.fillStyle='#bce0e6';c.fillRect(x-8,y-10,16,11);c.fillStyle='#253747';c.fillRect(x-8,y+8,16,7);c.fillStyle='#ffeac1';c.fillRect(x-10,y-22,5,3);c.fillRect(x+5,y-22,5,3);};
  g.cars.forEach((a,i)=>car(320+a.x*141,a.y*360,i%2?'#dd9259':'#96c6e1'));
  if(g.cooldown===0||Math.floor(g.cooldown*12)%2===0)car(320+g.x*141,306,'#d8f777');
  if(!this.running){c.fillStyle='#112438ee';c.fillRect(182,105,276,133);c.textAlign='center';c.font='bold 22px monospace';c.fillStyle='#dcf48d';c.fillText(g.finished?'ZIEL ERREICHT':'KRS TURBO',320,146);c.font='13px monospace';c.fillStyle='#e2e8e5';c.fillText(g.finished?`${Math.floor(g.distance)} METER`:'60 SEKUNDEN · VOLLGAS',320,178);c.fillText('GAS GEBEN & AUSWEICHEN',320,209);c.textAlign='left';}
  this.texture.needsUpdate=true;
 }

 cancel(camera:THREE.PerspectiveCamera){this.onCancel();if(this.active){camera.position.copy(this.savedPosition);camera.quaternion.copy(this.savedRotation);camera.fov=this.savedFov;camera.updateProjectionMatrix();}this.phase='idle';this.running=false;this.clearInput();this.ui.hidden=true;this.hidePrompt();document.body.classList.remove('racing-playing');this.draw();}
 dispose(){this.ui.remove();this.prompt.remove();this.texture.dispose();document.body.classList.remove('racing-playing');}
}
