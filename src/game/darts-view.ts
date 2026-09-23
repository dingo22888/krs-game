import * as THREE from 'three';
import type {FloorPlan} from '../data/house.ts';
import {origin} from './building.ts';
import {Darts,DART_NUMBERS} from './darts.ts';

export class DartsView {
 readonly game=new Darts();readonly group=new THREE.Group();
 readonly target=new THREE.Vector3();readonly normal=new THREE.Vector3(-1,0,0);
 readonly ui=document.createElement('section');readonly prompt=document.createElement('button');
 readonly board:THREE.Mesh<THREE.CircleGeometry,THREE.MeshStandardMaterial>;
 private status:HTMLElement;private playButton:HTMLButtonElement;private reticle:HTMLElement;
 private phase:'idle'|'in'|'game'|'out'='idle';private time=0;private focus=0;private exitFocus=1;
 private savedPosition=new THREE.Vector3();private savedRotation=new THREE.Quaternion();private focusedRotation=new THREE.Quaternion();private savedFov=74;
 private camera?:THREE.PerspectiveCamera;private ray=new THREE.Raycaster();private aim=new THREE.Vector2(0,.09);private clock=0;
 private running=false;private flight?:{mesh:THREE.Group;from:THREE.Vector3;to:THREE.Vector3;t:number;hit:ReturnType<Darts['throw']>};
 private arrows:THREE.Group[]=[];private cooldown=0;
 available=false;onEnter=()=>{};onExit=()=>{};onReturn=()=>{};onCancel=()=>{};
 onResult=(_result:{throws:{x:number;y:number}[]})=>{};
 onNewGame=()=>this.startRanked();onPause=()=>{};
 constructor(plan:FloorPlan,private scene:THREE.Scene){
  const room=plan.rooms.find(r=>/^braukeller$/i.test(r.name))!,[ox,oy,oz]=origin(plan);
  const east=Math.max(...room.polygon.map(p=>p[0])),south=Math.max(...room.polygon.map(p=>p[1]));
  this.target.set(ox+east-.035,oy+1.73,oz+south-2.0);
  this.group.position.copy(this.target);this.group.rotation.y=-Math.PI/2;scene.add(this.group);
  const surround=new THREE.Mesh(new THREE.CylinderGeometry(.33,.33,.026,64),new THREE.MeshStandardMaterial({color:'#1a2020',roughness:1}));
  surround.rotation.x=Math.PI/2;surround.position.z=-.012;this.group.add(surround);
  this.board=new THREE.Mesh(new THREE.CircleGeometry(.2255,96),new THREE.MeshStandardMaterial({map:this.boardTexture(),roughness:.92}));
  this.board.position.z=.006;this.group.add(this.board);this.group.updateMatrixWorld(true);
  const boardLight=new THREE.SpotLight('#ffdfb2',.8,1.1,Math.PI*.32,.7,2);
  boardLight.position.copy(this.target).addScaledVector(this.normal,.38);boardLight.position.y+=.32;boardLight.target.position.copy(this.target);scene.add(boardLight,boardLight.target);
  this.prompt.type='button';this.prompt.className='pong-prompt darts-prompt';this.prompt.textContent='E / Klick · Eine Runde Darts';this.prompt.hidden=true;
  this.prompt.onclick=()=>this.enter();document.body.append(this.prompt);
  this.ui.className='darts-ui';this.ui.hidden=true;this.ui.setAttribute('role','dialog');this.ui.setAttribute('aria-label','Darts im Braukeller');
  this.ui.innerHTML='<div class="darts-caption"><b>BRAUKELLER / DARTS</b><span>Maus bewegen oder Finger ziehen · Loslassen / Klick wirft</span><p role="status" aria-live="polite">9 Pfeile · Double und Triple zählen.</p></div><div class="darts-reticle" aria-hidden="true"></div><div class="pong-actions"><button data-play>9 Pfeile starten</button><button data-pause>Pause</button><button data-exit>Zurück ins Haus</button></div>';
  this.status=this.ui.querySelector('p')!;this.playButton=this.ui.querySelector('[data-play]')!;this.reticle=this.ui.querySelector('.darts-reticle')!;
  this.ui.querySelector<HTMLButtonElement>('[data-pause]')!.onclick=()=>this.onPause();
  this.playButton.onclick=()=>this.onNewGame();this.ui.querySelector<HTMLButtonElement>('[data-exit]')!.onclick=()=>this.leave();
  const aimAt=(e:PointerEvent)=>{
   if(this.phase!=='game'||!this.camera)return;
   this.ray.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),this.camera);
   const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal,this.target),p=new THREE.Vector3();
   if(this.ray.ray.intersectPlane(plane,p)){this.group.worldToLocal(p);this.aim.set(THREE.MathUtils.clamp(p.x,-.27,.27),THREE.MathUtils.clamp(p.y,-.27,.27));}
  };
  this.ui.addEventListener('pointermove',e=>{if(!(e.target as HTMLElement).closest('button'))aimAt(e);});
  this.ui.addEventListener('pointerdown',e=>{if(e.button!==0||(e.target as HTMLElement).closest('button'))return;aimAt(e);this.ui.setPointerCapture(e.pointerId);});
  this.ui.addEventListener('pointerup',e=>{if(e.button!==0||(e.target as HTMLElement).closest('button'))return;aimAt(e);this.throwDart();});
  this.ui.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===this.ui){e.preventDefault();if(!e.repeat)this.throwDart();}});
  this.ui.tabIndex=-1;document.body.append(this.ui);
 }
 private boardTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const c=canvas.getContext('2d')!,scale=512/.2255;
  c.translate(512,512);c.fillStyle='#161919';c.beginPath();c.arc(0,0,512,0,Math.PI*2);c.fill();
  const ring=(r0:number,r1:number,a:number,b:number,color:string)=>{c.beginPath();c.arc(0,0,r1*scale,a,b);c.arc(0,0,r0*scale,b,a,true);c.closePath();c.fillStyle=color;c.fill();c.strokeStyle='#b6b8a2';c.lineWidth=1.4;c.stroke();};
  for(let i=0;i<20;i++){
   const a=-Math.PI/2+(i-.5)*Math.PI/10,b=a+Math.PI/10,dark=i%2===0;
   ring(.0159,.099,a,b,dark?'#242624':'#d7c9a7');ring(.099,.107,a,b,dark?'#aa3434':'#327c62');
   ring(.107,.162,a,b,dark?'#242624':'#d7c9a7');ring(.162,.17,a,b,dark?'#aa3434':'#327c62');
   const angle=-Math.PI/2+i*Math.PI/10;c.fillStyle='#e1e2d6';c.font='38px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(String(DART_NUMBERS[i]),Math.cos(angle)*.198*scale,Math.sin(angle)*.198*scale);
  }
  ring(.00635,.0159,0,Math.PI*2,'#327c62');ring(0,.00635,0,Math.PI*2,'#aa3434');
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
 }
 get active(){return this.phase!=='idle';}
 hidePrompt(){this.available=false;this.prompt.hidden=true;}
 approach(camera:THREE.PerspectiveCamera){
  this.camera=camera;if(this.active)return;
  const delta=camera.position.clone().sub(this.target);this.available=false;
  if(delta.dot(this.normal)>.40&&delta.length()<3.1){
   this.ray.setFromCamera(new THREE.Vector2(),camera);const hits=this.ray.intersectObjects(this.scene.children,true);
   this.available=hits.length>0&&hits[0].object===this.board;
  }
  this.prompt.hidden=!this.available;
 }
 key(code:string,down:boolean){if(!this.active&&this.available&&down&&code==='KeyE'){this.enter();return true;}return false;}
 enter(){
  if(!this.available||!this.camera||this.active)return;
  const c=this.camera;this.savedPosition.copy(c.position);this.savedRotation.copy(c.quaternion);this.savedFov=c.fov;
  const focused=c.clone();focused.lookAt(this.target);this.focusedRotation.copy(focused.quaternion);
  this.phase='in';this.time=0;this.focus=0;this.running=false;this.aim.set(0,.09);this.ui.hidden=false;this.hidePrompt();
  document.body.classList.add('darts-playing');this.onEnter();
  this.status.textContent='9 Pfeile · Ziele mit dem kleinen Kreuz. Es schwankt leicht: den Wurf gut timen!';
 }
 startRanked(){this.clearArrows();this.game.reset();this.running=true;this.cooldown=0;this.status.textContent='Pfeil 1 / 9 · 0 Punkte';this.ui.focus({preventScroll:true});}
 private currentAim(){return new THREE.Vector2(this.aim.x+Math.sin(this.clock*2.7)*.006,this.aim.y+Math.sin(this.clock*3.9+.4)*.005);}
 private throwDart(){
  if(this.phase!=='game'||!this.running||this.flight||this.cooldown>0)return;
  if(this.game.hits.length%3===0)this.clearArrows();
  const aim=this.currentAim(),hit=this.game.throw(aim.x,aim.y);if(!hit)return;
  const dart=new THREE.Group(),metal=new THREE.MeshBasicMaterial({color:'#9a9c97'});
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.002,.004,.065,8),metal);shaft.rotation.x=Math.PI/2;shaft.position.z=.036;dart.add(shaft);
  const flightMaterial=new THREE.MeshBasicMaterial({color:'#a96b40',side:THREE.DoubleSide});
  for(const angle of [0,Math.PI/2]){const fin=new THREE.Mesh(new THREE.PlaneGeometry(.025,.032),flightMaterial);fin.rotation.x=Math.PI/2;fin.rotation.z=angle;fin.position.z=.088;dart.add(fin);}
  dart.quaternion.copy(this.group.quaternion);this.scene.add(dart);this.arrows.push(dart);
  const to=this.group.localToWorld(new THREE.Vector3(aim.x,aim.y,.009));
  this.flight={mesh:dart,from:this.camera!.position.clone().add(new THREE.Vector3(0,-.16,0)),to,t:0,hit};
 }
 update(camera:THREE.PerspectiveCamera,dt:number){
  this.camera=camera;if(!this.active)return;this.time+=dt;this.clock+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
  const p=Math.min(1,this.time/.55),s=p*p*(3-2*p),t=this.phase==='out'?this.exitFocus*(1-s):this.phase==='in'?s:1;this.focus=t;
  camera.position.copy(this.savedPosition);camera.quaternion.slerpQuaternions(this.savedRotation,this.focusedRotation,t);
  const distance=this.savedPosition.distanceTo(this.target),fit=Math.max(.83,.70/camera.aspect);
  camera.fov=THREE.MathUtils.lerp(this.savedFov,THREE.MathUtils.radToDeg(2*Math.atan(fit/(2*distance))),t);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  this.playButton.disabled=this.phase!=='game'||this.running||!!this.flight;
  if(this.phase==='in'&&p===1){this.phase='game';this.playButton.focus({preventScroll:true});}
  if(this.phase==='out'&&p===1){this.cancel(camera);this.onReturn();return;}
  const aim=this.currentAim(),screen=this.group.localToWorld(new THREE.Vector3(aim.x,aim.y,.015)).project(camera);
  this.reticle.style.left=`${(screen.x+1)*innerWidth/2}px`;this.reticle.style.top=`${(1-screen.y)*innerHeight/2}px`;this.reticle.hidden=!this.running||!!this.flight;
  if(this.flight){
   const f=this.flight;f.t=Math.min(1,f.t+dt/.52);f.mesh.position.lerpVectors(f.from,f.to,f.t);f.mesh.position.y+=Math.sin(f.t*Math.PI)*.12;
   if(f.t===1){this.flight=undefined;this.cooldown=.65;
    this.status.textContent=`${f.hit!.label} · ${f.hit!.points} Punkte — Gesamt ${this.game.score} · ${this.game.hits.length} / 9 Pfeile`;
    if(this.game.finished){this.running=false;this.playButton.textContent='Neue 9-Pfeile-Runde';this.onResult({throws:this.game.hits.map(({x,y})=>({x,y}))});}
   }
  }
 }
 leave(){if(!this.active||this.phase==='out')return;this.onCancel();this.running=false;this.exitFocus=this.focus;this.phase='out';this.time=0;this.clearArrows();this.onExit();}
 cancel(camera:THREE.PerspectiveCamera){this.onCancel();if(this.active){camera.position.copy(this.savedPosition);camera.quaternion.copy(this.savedRotation);camera.fov=this.savedFov;camera.updateProjectionMatrix();}this.phase='idle';this.running=false;this.ui.hidden=true;this.hidePrompt();this.clearArrows();document.body.classList.remove('darts-playing');}
 private clearArrows(){this.flight=undefined;for(const arrow of this.arrows){arrow.removeFromParent();const mats=new Set<THREE.Material>();arrow.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);}});mats.forEach(m=>m.dispose());}this.arrows=[];}
 dispose(){this.onCancel();this.clearArrows();this.ui.remove();this.prompt.remove();document.body.classList.remove('darts-playing');}
}
