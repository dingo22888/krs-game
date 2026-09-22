import * as THREE from 'three';
import type {FloorPlan,Furniture} from '../data/house.ts';
import {origin} from './building.ts';
import {TicTacToe,outcome} from './tic-tac-toe.ts';

const W=768,H=2048;
const grid={x:392,y:94,size:312};
const menu=[
  ['Montag','Spaghettimonster','mit Parmesan-Schnee'],
  ['Dienstag','Ninja-Nuggets','auf Tarnspinat'],
  ['Mittwoch','UFO-Kartoffeln','mit Alien-Quark'],
  ['Donnerstag','Drachen-Chili','Feuerlöscher: Joghurt'],
  ['Freitag','Disco-Pizza','mit tanzenden Pilzen'],
  ['Samstag','Piraten-Pfannkuchen','mit Schatzschokolade'],
  ['Sonntag','Sofa-Knödel','in Fernbedienungssoße'],
];

export class Chalkboard {
  readonly game=new TicTacToe();
  readonly canvas=document.createElement('canvas');
  readonly texture:THREE.CanvasTexture;
  readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial>;
  readonly target=new THREE.Vector3();
  readonly normal=new THREE.Vector3();
  readonly ui=document.createElement('section');
  private cells:HTMLButtonElement[]=[];
  private status:HTMLElement;
  private phase:'idle'|'in'|'game'|'out'='idle';
  private elapsed=0;
  private focus=0;
  private exitFrom=1;
  private thinkingTime=0;
  private dwell=0;
  private armed=true;
  private savedPosition=new THREE.Vector3();
  private savedRotation=new THREE.Quaternion();
  private savedFov=74;
  private zoomPosition=new THREE.Vector3();
  private zoomRotation=new THREE.Quaternion();
  private zoomFov=30;
  private ray=new THREE.Raycaster();
  onChallengeResult=(_result:{wins:number;draws:number;losses:number})=>{};
  onCancel=()=>{};
  onNewChallenge?:()=>void;
  private preparing=false;
  setPreparing(value:boolean){this.preparing=value;this.draw();}
  private challenge:{round:number;wins:number;draws:number;losses:number;counted:boolean}|null=null;
  startChallenge(){this.challenge={round:1,wins:0,draws:0,losses:0,counted:false};this.game.reset();this.draw();}
  private nextRound(){
    if(this.preparing)return;
    if(this.challenge){
      if(!outcome(this.game.board))return;
      this.challenge.round++;this.challenge.counted=false;
      this.game.reset();this.game.thinking=this.challenge.round%2===0;
    }else if(this.onNewChallenge){this.onNewChallenge();return;}else this.game.reset();
    this.thinkingTime=.45;this.draw();
  }
  onEnter=()=>{};
  onExit=()=>{};
  onReturn=()=>{};
  constructor(plan:FloorPlan,f:Furniture,private scene:THREE.Scene){
    const [x0,z0,x1,z1]=f.rect,face=f.facing??'south',turn=face==='east'||face==='west';
    const width=(turn?z1-z0:x1-x0)-.38,height=Math.min(2.06,f.height-.08)-.48;
    const depth=turn?x1-x0:z1-z0;
    const u=(turn?z1-z0:x1-x0)/2,v=depth-.014;
    const point=face==='west'?[x1-v,z0+u]:face==='east'?[x0+v,z1-u]:face==='north'?[x1-u,z1-v]:[x0+u,z0+v];
    const angle=face==='west'?-Math.PI/2:face==='east'?Math.PI/2:face==='north'?Math.PI:0;
    const [ox,oy,oz]=origin(plan);
    this.canvas.width=W;this.canvas.height=H;
    this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;this.texture.anisotropy=8;
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:this.texture,roughness:1,emissive:'#ffffff',emissiveMap:this.texture,emissiveIntensity:.12}));
    this.mesh.position.set(point[0]+ox,oy+(f.bottom??0)+.18+height/2,point[1]+oz);this.mesh.rotation.y=angle;
    scene.add(this.mesh);this.mesh.updateMatrixWorld(true);
    this.normal.set(0,0,1).applyQuaternion(this.mesh.quaternion);
    this.target.copy(this.at(grid.x+grid.size/2,grid.y+grid.size/2));
    this.ui.className='chalk-game';this.ui.hidden=true;
    this.ui.setAttribute('role','dialog');this.ui.setAttribute('aria-modal','true');this.ui.setAttribute('aria-label','Tic-Tac-Toe an der Küchentafel');
    this.ui.innerHTML='<div class="chalk-caption"><span>KÜCHENDUELL · DU BIST X</span><p role="status" aria-live="polite"></p></div><div class="chalk-actions"><button type="button" data-new>Neue Runde</button><button type="button" data-close>Zurück ins Haus</button></div>';
    this.status=this.ui.querySelector('p')!;
    for(let i=0;i<9;i++){
      const cell=document.createElement('button');cell.type='button';cell.className='chalk-cell';
      cell.addEventListener('click',()=>{if(this.phase==='game'&&this.game.play(i)){this.thinkingTime=.45;this.draw();}});
      this.ui.append(cell);this.cells.push(cell);
    }
    this.ui.querySelector('[data-new]')!.addEventListener('click',()=>this.nextRound());
    this.ui.querySelector('[data-close]')!.addEventListener('click',()=>this.leave());
    this.ui.addEventListener('keydown',e=>{
      if(e.key==='Tab'){
        const buttons=[...this.ui.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();
      }
    });
    document.body.append(this.ui);this.draw();
  }
  get active(){return this.phase!=='idle';}
  at(x:number,y:number){return this.mesh.localToWorld(new THREE.Vector3((x/W-.5)*this.mesh.geometry.parameters.width,(.5-y/H)*this.mesh.geometry.parameters.height,0));}
  private draw(){
    const ctx=this.canvas.getContext('2d')!;ctx.fillStyle='#202623';ctx.fillRect(0,0,W,H);
    // Dry chalk and faint eraser streaks, generated locally rather than a photo.
    for(let i=0;i<1000;i++){ctx.fillStyle=`rgba(221,230,207,${i%3===0?.045:.018})`;ctx.fillRect((i*137)%W,(i*313)%H,28+i%93,1+i%3);}
    const text=(s:string,x:number,y:number,size:number,color='#e2e3d3')=>{ctx.fillStyle=color;ctx.font=`${size}px "Comic Sans MS", "Chalkboard SE", cursive`;ctx.fillText(s,x,y);};
    text('Was gibt’s?',44,105,48,'#efe0a5');text('Plan mit',46,171,29);text('Soßen-Potenzial',46,211,29);text('X oder O?',grid.x,64,31,'#d4e7b4');
    // A little chalk doodle beside the game: a very optimistic chef.
    ctx.strokeStyle='#c5d8ad';ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(160,326,49,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.arc(160,327,29,.15,Math.PI-.15);ctx.stroke();
    for(const x of [142,178]){ctx.beginPath();ctx.arc(x,315,3,0,Math.PI*2);ctx.stroke();}
    text('Mahlzeit!',91,420,31,'#c5d8ad');
    ctx.strokeStyle='#e4e4d3';ctx.lineWidth=5;ctx.lineCap='round';
    for(let i=1;i<3;i++){const a=grid.size*i/3;ctx.beginPath();ctx.moveTo(grid.x+a,grid.y);ctx.lineTo(grid.x+a+1,grid.y+grid.size);ctx.moveTo(grid.x,grid.y+a);ctx.lineTo(grid.x+grid.size,grid.y+a-1);ctx.stroke();}
    this.game.board.forEach((mark,i)=>{
      const x=grid.x+(i%3+.5)*grid.size/3,y=grid.y+(Math.floor(i/3)+.5)*grid.size/3,r=32;
      ctx.strokeStyle=mark==='X'?'#ecd39b':'#aacdd9';ctx.lineWidth=7;ctx.beginPath();
      if(mark==='X'){ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y+r);ctx.moveTo(x+r,y-r);ctx.lineTo(x-r,y+r);}else if(mark==='O')ctx.ellipse(x,y,r,r+2,-.1,0,Math.PI*2);
      ctx.stroke();
    });
    menu.forEach(([day,dish,sub],i)=>{const y=500+i*205;text(day,55,y,43,'#efe0a5');text(dish,68,y+57,40);text(sub,68,y+104,33);});
    text('Wer verliert, spült! :)',85,1994,36,'#c5d8ad');
    const result=outcome(this.game.board);
    this.status.textContent=result==='X'?'Gewonnen! Die Küche übernimmt den Abwasch.':result==='O'?'Die Küche gewinnt. Du bist zum Spülen eingeteilt!':result==='draw'?'Unentschieden. Die Spülmaschine rettet euch.':this.game.thinking?'Die Küche grübelt …':'Dein Zug · ein freies Feld anklicken oder antippen';
    this.cells.forEach((cell,i)=>{cell.disabled=Boolean(this.preparing||this.game.board[i]||result||this.game.thinking||this.phase!=='game');cell.setAttribute('aria-label',`Zeile ${Math.floor(i/3)+1}, Spalte ${i%3+1}: ${this.game.board[i]||'frei'}`);});
    const next=this.ui.querySelector<HTMLButtonElement>('[data-new]')!;
    next.disabled=this.preparing||Boolean(this.challenge&&!result);
    next.textContent=this.challenge?'Nächste Partie':'Neue Runde';
    if(this.challenge){
      const c=this.challenge;
      if(result&&!c.counted){c.counted=true;if(result==='X')c.wins++;else if(result==='O')c.losses++;else c.draws++;}
      this.status.textContent=`Wertung · Partie ${c.round}/10 · ${c.wins*3+c.draws} Punkte · ${this.status.textContent}`;
      if(c.round===10&&c.counted){this.challenge=null;next.disabled=false;next.textContent='Neue Runde';this.onChallengeResult({wins:c.wins,draws:c.draws,losses:c.losses});}
    }
    if(this.preparing)this.status.textContent='Highscore-Serie wird vorbereitet …';
    else if(this.onNewChallenge&&!this.challenge){next.textContent='Neue 10-Partien-Serie';}
    this.texture.needsUpdate=true;
  }
  /** Surface distance plus direct sight: no activation through a wall or from behind. */
  approach(camera:THREE.PerspectiveCamera,dt:number){
    if(this.active)return;
    const offset=camera.position.clone().sub(this.target),distance=offset.dot(this.normal);
    if(offset.length()>1.4){this.armed=true;this.dwell=0;return;}
    if(!this.armed||distance<.3||distance>1||offset.length()>1.25){this.dwell=0;return;}
    this.ray.setFromCamera(new THREE.Vector2(),camera);
    const hit=this.ray.intersectObject(this.mesh)[0];
    if(!hit?.uv){this.dwell=0;return;}
    const x=hit.uv.x*W,y=(1-hit.uv.y)*H;
    if(x<grid.x-35||x>grid.x+grid.size+35||y<grid.y-35||y>grid.y+grid.size+35){this.dwell=0;return;}
    const obstruction=this.ray.intersectObjects(this.scene.children,false).find(h=>h.distance<hit.distance-.01);
    if(obstruction){this.dwell=0;return;}
    this.dwell+=dt;if(this.dwell<.3)return;
    this.savedPosition.copy(camera.position);this.savedRotation.copy(camera.quaternion);this.savedFov=camera.fov;
    // Stay on the player's side of the solid door. Zoom optically; no body teleport.
    this.zoomPosition.copy(this.target).addScaledVector(this.normal,Math.max(.5,distance));
    const view=camera.clone();view.position.copy(this.zoomPosition);view.lookAt(this.target);this.zoomRotation.copy(view.quaternion);
    this.phase='in';this.elapsed=0;this.armed=false;this.ui.hidden=false;document.body.classList.add('chalk-playing');this.draw();this.onEnter();
  }
  leave(){if(!this.active||this.phase==='out')return;this.challenge=null;this.onCancel();this.exitFrom=this.focus;this.phase='out';this.elapsed=0;this.draw();this.onExit();}
  update(camera:THREE.PerspectiveCamera,dt:number){
    if(!this.active)return;
    this.elapsed+=dt;
    const progress=Math.min(this.elapsed/.65,1),smooth=progress*progress*(3-2*progress);
    const t=this.phase==='out'?this.exitFrom*(1-smooth):this.phase==='in'?smooth:1;this.focus=t;
    const gridHeight=this.mesh.geometry.parameters.height*grid.size/H,gridWidth=this.mesh.geometry.parameters.width*grid.size/W;
    const distance=this.zoomPosition.distanceTo(this.target);
    this.zoomFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.max(gridHeight/.49,gridWidth/(.65*camera.aspect))/2/distance));
    camera.position.lerpVectors(this.savedPosition,this.zoomPosition,t);camera.quaternion.slerpQuaternions(this.savedRotation,this.zoomRotation,t);camera.fov=THREE.MathUtils.lerp(this.savedFov,this.zoomFov,t);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    if(this.phase==='in'&&progress===1){this.phase='game';this.draw();this.cells.find(c=>!c.disabled)?.focus({preventScroll:true});}
    if(this.phase==='out'&&progress===1){this.phase='idle';this.ui.hidden=true;document.body.classList.remove('chalk-playing');this.onReturn();return;}
    if(this.phase==='game'&&this.game.thinking){this.thinkingTime-=dt;if(this.thinkingTime<=0){this.game.respond();this.draw();}}
    this.cells.forEach((cell,i)=>{
      const x=grid.x+i%3*grid.size/3,y=grid.y+Math.floor(i/3)*grid.size/3;
      const a=this.at(x,y).project(camera),b=this.at(x+grid.size/3,y+grid.size/3).project(camera);
      Object.assign(cell.style,{left:`${(a.x+1)*innerWidth/2}px`,top:`${(1-a.y)*innerHeight/2}px`,width:`${(b.x-a.x)*innerWidth/2}px`,height:`${(a.y-b.y)*innerHeight/2}px`,visibility:this.phase==='game'?'visible':'hidden'});
    });
  }
  cancel(camera:THREE.PerspectiveCamera){
    this.challenge=null;this.onCancel();
    if(!this.active)return;
    camera.position.copy(this.savedPosition);camera.quaternion.copy(this.savedRotation);camera.fov=this.savedFov;camera.updateProjectionMatrix();
    this.phase='idle';this.ui.hidden=true;document.body.classList.remove('chalk-playing');
  }
  dispose(){this.ui.remove();document.body.classList.remove('chalk-playing');this.texture.dispose();}
}
