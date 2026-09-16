import type {FloorId,FloorPlan,Furniture,Room} from '../data/house.ts';
import type {Rect} from './geometry.ts';
import {decomposePolygon,inPolygon,rectanglePoints,subtractRects} from './geometry.ts';
import type {BoxSpec,MaterialKind} from './model.ts';

const bounds=(r:Room):Rect=>[Math.min(...r.polygon.map(p=>p[0])),Math.min(...r.polygon.map(p=>p[1])),Math.max(...r.polygon.map(p=>p[0])),Math.max(...r.polygon.map(p=>p[1]))];
const overlaps=(a:Rect,b:Rect)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
/** Confirmed corrections are located from room adjacency and the retained door,
 * never from public copies of private plan coordinates. */
export function prepareStudio(input:Record<FloorId,FloorPlan>){
 const result=structuredClone(input),og=result.og,dg=result.dg;
 const bed=og.rooms.find(r=>/^(schlafen|schlafzimmer)$/i.test(r.name)),hall=og.rooms.find(r=>/^kinderflur$/i.test(r.name));
 if(bed&&hall){
  const b=bounds(bed),h=bounds(hall);
  if(b[0]>h[2]&&b[0]-h[2]<.5)og.openings=og.openings.filter(o=>!(o.kind==='passage'&&o.rect[0]>=h[2]-.1&&o.rect[2]<=b[0]+.1&&o.rect[1]>=Math.max(b[1],h[1])-.1&&o.rect[3]<=Math.min(b[3],h[3])+.1));
 }
 const room=dg.rooms.find(r=>/^dachstudio$/i.test(r.name));if(!room)return result;
 const r=bounds(room),[west,north,east,south]=r;
 const door=dg.openings.find(o=>o.kind==='passage'&&o.rect[3]-o.rect[1]>o.rect[2]-o.rect[0]);if(!door)return result;
 const raw=dg.walls.flatMap(decomposePolygon),x=(door.rect[0]+door.rect[2])/2;
 const strips=raw.filter(w=>Math.abs((w[0]+w[2])/2-x)<.12&&w[2]-w[0]>.08&&w[2]-w[0]<.3);
 const jamb=strips.filter(w=>w[3]<=door.rect[1]+.06&&door.rect[1]-w[3]<.18).sort((a,b)=>b[3]-a[3])[0];
 const upstream=jamb&&strips.filter(w=>w[3]<jamb[1]&&jamb[1]-w[3]<.85).sort((a,b)=>b[3]-a[3])[0];
 if(jamb&&upstream){
  const fill:Rect=[jamb[0],upstream[3],jamb[2],jamb[1]];
  if(!dg.openings.some(o=>overlaps(o.rect,fill))&&subtractRects([fill],raw).length)dg.walls.push(rectanglePoints(fill));
 }
 if(east-west<3||south-north<7)return result;
 dg.furniture=dg.furniture.filter(f=>!inPolygon((f.rect[0]+f.rect[2])/2,(f.rect[1]+f.rect[3])/2,room.polygon));room.surface='oak';
 const add=(kind:Furniture['kind'],rect:Rect,height:number,facing:Furniture['facing']='south',bottom?:number,workstation?:Furniture['workstation'])=>dg.furniture.push({kind,rect,height,facing,...(bottom===undefined?{}:{bottom}),...(workstation?{workstation}:{})});
 // Right of the entry: a long white desk under the eaves, its monitor facing
 // the centre aisle. The opposite gable holds the smaller L-shaped workspace.
 const length=Math.min(2.65,south-door.rect[3]-.48),z=south-.18-length/2;
 add('studioDesk',[east-1.22,z-length/2,east-.44,z+length/2],.76,'west',undefined,'wide');
 add('studioChair',[east-1.92,z-.32,east-1.30,z+.32],1.20,'east');
 add('rug',[west+.18,z-1.2,east-1.28,z+1.2],.015);
 add('studioShelf',[west+.12,south-1.8,west+.5,south-.2],.7,'east');
 const cx=west+(east-west)*.60;
 add('studioDesk',[cx-.78,north+.20,cx+.78,north+.91],.75,'south',undefined,'standard');
 add('studioChair',[cx-.22,north+1.12,cx+.38,north+1.74],1.14,'north',undefined,'standard');
 add('studioDesk',[west+.26,north+.92,cx-.8,north+2.0],.75,'east');
 add('rug',[cx-.65,north+.95,cx+.55,north+2.15],.015);
 add('studioShelf',[east-.55,north+1.4,east-.15,north+2.25],.72,'west');
 // Exposed timber replaces the existing tiny rectangular structural posts.
 for(const wall of raw.filter(w=>w[2]-w[0]>=.10&&w[2]-w[0]<=.13&&w[3]-w[1]>=.1&&w[3]-w[1]<=.13)){
  const pad=.003;add('studioBeam',[wall[0]-pad,wall[1]-pad,wall[2]+pad,wall[3]+pad],dg.height);
 }
 for(const zz of [north+1.8,south-1.8])add('studioLamp',[east-1.0,zz-.06,east-.9,zz+.06],.15,'west',1.95);
 if(dg.furniture.some(f=>f.kind==='studioDesk'&&dg.spawn.x>f.rect[0]-.2&&dg.spawn.x<f.rect[2]+.2&&dg.spawn.z>f.rect[1]-.2&&dg.spawn.z<f.rect[3]+.2))dg.spawn={x:door.rect[2]+.42,z:(door.rect[1]+door.rect[3])/2,yaw:Math.PI};
 for(const [xx,zz] of [[west+.50,north+.55],[west+.5,south-.48]])add('diningPlant',[xx-.14,zz-.14,xx+.14,zz+.14],.60);
 return result;
}

/** Front-local u runs across the desk, v toward the seated person. */
export function studioFrame(f:Furniture){
 const [x0,z0,x1,z1]=f.rect,face=f.facing??'south',turn=face==='west'||face==='east';
 return {w:turn?z1-z0:x1-x0,d:turn?x1-x0:z1-z0,point:(u:number,v:number):[number,number]=>face==='west'?[x1-v,z0+u]:face==='east'?[x0+v,z1-u]:face==='north'?[x1-u,z1-v]:[x0+u,z0+v],angle:face==='west'?-Math.PI/2:face==='east'?Math.PI/2:face==='north'?Math.PI:0};
}
export function monitorSize(f:Furniture){const wide=f.workstation==='wide',diagonal=(wide?49:27)*.0254,ratio=wide?32/9:16/9;return {width:diagonal*ratio/Math.hypot(ratio,1),height:diagonal/Math.hypot(ratio,1)};}
export function studioDetails(f:Furniture):BoxSpec[]|undefined{
 if(!f.kind.startsWith('studio'))return;
 const {w,d,point}=studioFrame(f),b=f.bottom??0,h=f.height,out:BoxSpec[]=[];
 const add=(u:number,v:number,uw:number,dv:number,y:number,hh:number,material:MaterialKind,collision=true,shape?:BoxSpec['shape'])=>{
  if(uw<=0||dv<=0)return;const a=point(u,v),c=point(u+uw,v+dv);out.push({position:[(a[0]+c[0])/2,b+y+hh/2,(a[1]+c[1])/2],size:[Math.abs(c[0]-a[0]),hh,Math.abs(c[1]-a[1])],material,collision,shape});
 };
 if(f.kind==='studioDesk'){
  add(0,0,w,d,h-.035,.035,'cabinet');
  for(const u of [.03,w-.42]){
   add(u,.04,.38,d-.10,.05,h-.085,'cabinet');
   for(let i=0;i<4;i++){add(u+.01,d-.052,.36,.014,.10+i*.145,.137,'interiorDoor');add(u+.12,d-.032,.14,.023,.2+i*.145,.012,'steel',false);}
  }
  if(f.workstation){
   const m=monitorSize(f),mid=w/2;
   add(mid-.14,.15,.28,.26,h,.02,'hardware');add(mid-.025,.20,.05,.04,h+.02,.17,'hardware');
   add(mid-m.width/2-.012,.19,m.width+.024,.04,h+.17,m.height+.024,'hardware');
   add(mid-.23,d-.23,.46,.15,h,.015,'hardware',false);
   for(let i=0;i<12;i++)for(let j=0;j<4;j++)add(mid-.218+i*.036,d-.217+j*.031,.028,.021,h+.016,.002,'steel',false);
   add(mid+.30,d-.21,.06,.095,h,.025,'hardware',false,'ellipsoid');
   if(f.workstation==='wide'){
    add(.05,.08,.38,.3,h,.18,'hardware');add(.07,.09,.34,.26,h+.18,.012,'metal',false);
    add(w-.28,.13,.14,.18,h,.02,'metal',false);add(w-.22,.20,.015,.015,h+.02,.38,'steel',false);
    add(w-.29,.17,.16,.08,h+.38,.06,'hardware',false);add(w-.28,.17,.14,.08,h+.375,.004,'lampGlow',false);
   }
  }
 }else if(f.kind==='studioChair'){
  add(.06,.10,w-.12,d-.12,.45,.07,'upholstery');add(.06,.04,w-.12,.10,.51,h-.51,'upholstery');
  add(w/2-.03,d/2-.03,.06,.06,.08,.37,'steel',true,'ovalY');
  add(.025,d/2-.035,w-.05,.07,.07,.025,'steel');add(w/2-.035,.025,.07,d-.05,.07,.025,'steel');
  for(const [u,v] of [[.015,d/2],[w-.075,d/2],[w/2,.015],[w/2,d-.075]])add(u,v,.065,.06,.025,.045,'hardware');
  for(const u of [.025,w-.055]){add(u,.10,.03,.03,.48,.20,'metal');add(u-.005,.10,.04,d-.17,.66,.025,'hardware');}
 }else if(f.kind==='studioShelf'){
  add(0,0,w,d,0,h,'cabinet');for(let i=0;i<3;i++){add(i*w/3+.006,d,w/3-.012,.018,.035,h-.07,'interiorDoor');add((i+.5)*w/3-.045,d+.02,.09,.014,h-.10,.012,'hardware',false);}
 }else if(f.kind==='studioBeam')add(0,0,w,d,0,h,'diningWood');
 else if(f.kind==='studioLamp'){add(0,0,w,d,0,h,'hardware',false,'ovalY');add(0,d,w,.005,.01,h-.02,'lampGlow',false);}
 return out;
}
