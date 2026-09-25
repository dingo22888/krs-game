import type {FloorId,FloorPlan,Furniture} from '../data/house.ts';
import {inPolygon} from './geometry.ts';
import type {Rect} from './geometry.ts';
import type {BoxSpec,MaterialKind} from './model.ts';
import {studioFrame} from './studio.ts';
import {wallLayout} from './wall-layout.ts';

/** Photo-inspired furnishings, anchored to the private room at runtime. */
export function prepareLivingRoom(input:Record<FloorId,FloorPlan>){
 const room=input.eg.rooms.find(r=>/^wohnzimmer$/i.test(r.name));if(!room)return input;
 const xs=room.polygon.map(p=>p[0]),zs=room.polygon.map(p=>p[1]);
 const [west,north,east,south]=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
 if(east-west<3.6||south-north<3.6)return input;
 const result=structuredClone(input),plan=result.eg;
 plan.rooms.find(r=>r.name===room.name)!.surface='oak';
 plan.furniture=plan.furniture.filter(f=>!inPolygon((f.rect[0]+f.rect[2])/2,(f.rect[1]+f.rect[3])/2,room.polygon));
 const add=(kind:Furniture['kind'],rect:Rect,height:number,facing:Furniture['facing']='south',bottom=0)=>plan.furniture.push({kind,rect,height,facing,bottom,finish:'living'});
 const z=south-1.40;
 add('rug',[west+.13,south-2.82,east-.78,south-.08],.018);
 add('sofa',[west+.15,south-2.68,west+1.19,south-.15],1.02,'east');
 add('sofa',[west+1.18,south-1.12,west+1.94,south-.15],.46,'north');
 add('livingOttoman',[west+1.97,south-.96,west+2.63,south-.18],.44);
 add('armchair',[west+.20,north+.29,west+1.10,north+1.32],1.10,'east');
 add('livingOttoman',[west+1.18,north+.55,west+1.70,north+1.14],.41);
 add('livingCoffee',[west+1.38,south-2.37,west+1.93,south-1.82],.40);
 add('livingCoffee',[west+1.98,south-2.06,west+2.53,south-1.51],.36);
 const diagonal=65*.0254,width=diagonal*16/Math.hypot(16,9),height=diagonal*9/Math.hypot(16,9);
 add('tv',[east-.066,z-width/2,east-.016,z+width/2],height,'west',1.03);
 add('livingMedia',[east-.43,z-1.05,east-.04,z+1.05],.44,'west');
 // Keep the hall-side end clear: the subwoofer sits beside the south end of the console.
 add('livingSpeaker',[east-.80,south-.53,east-.50,south-.17],.43,'west');
 add('livingSpeaker',[east-.065,z-.43,east-.025,z+.43],.065,'west',.92);
 add('diningPlant',[west+.06,south-.55,west+.36,south-.25],.94);
 for(const [i,x] of [west+1.05,west+1.64].entries())add('livingArt',[x,south-.018,x+.38,south-.007],.84,'north',1.12-i*.13);
 // Wallpaper only on actual wall pieces. Existing door openings stay clear.
 for(const r of wallLayout(plan).walls){
  if(Math.abs(r[0]-east)<.16){const a=Math.max(north,r[1]),b=Math.min(south,r[3]);if(b>a)add('livingWall',[east-.012,a,east-.004,b],plan.height);}
  if(Math.abs(r[3]-north)<.16){const a=Math.max(west,r[0]),b=Math.min(east,r[2]);if(b>a)add('livingWall',[a,north+.004,b,north+.012],plan.height);}
 }
 for(const o of plan.openings.filter(o=>o.kind==='window'&&Math.abs(o.rect[2]-west)<.18&&o.rect[1]>=north&&o.rect[3]<=south)){
  const a=o.rect[1],b=o.rect[3];
  for(const zz of [a-.06,b-.37])add('livingCurtain',[west+.065,zz,west+.13,zz+.43],plan.height-.17,'east',.10);
  add('livingSpeaker',[west+.05,a-.13,west+.095,b+.13],.027,'east',plan.height-.10);
  add('radiator',[west+.045,a+.08,west+.15,b-.08],.61,'east',.13);
 }
 add('diningPendant',[west+1.75,north+1.64,west+2.30,north+2.19],.71,'south',plan.height-.71);
 for(const zz of [north+.10,south-.28])add('livingSpeaker',[east-.17,zz,east-.025,zz+.19],.20,'west',plan.height-.39);
 return result;
}

export function livingDetails(f:Furniture):BoxSpec[]|undefined{
 if(f.finish!=='living'||['tv','radiator','diningPlant','diningPendant'].includes(f.kind))return;
 const {w,d,point}=studioFrame(f),out:BoxSpec[]=[];
 const add=(u:number,v:number,uw:number,dv:number,y:number,h:number,material:MaterialKind,collision=true,shape?:BoxSpec['shape'])=>{
  const a=point(u,v),b=point(u+uw,v+dv);if(uw<=0||dv<=0||h<=0)return;
  out.push({position:[(a[0]+b[0])/2,(f.bottom??0)+y+h/2,(a[1]+b[1])/2],size:[Math.abs(b[0]-a[0]),h,Math.abs(b[1]-a[1])],material,collision,shape});
 };
 if(f.kind==='sofa'||f.kind==='armchair'||f.kind==='livingOttoman'){
  for(const u of [.07,w-.12])for(const v of [.08,d-.13])add(u,v,.05,.05,.02,.13,'hardware');
  add(.025,.025,w-.05,d-.05,.13,.25,'upholstery');
  const back=f.height>.6,n=f.kind==='sofa'&&back?3:1;
  for(let i=0;i<n;i++){
   const a=.10+i*(w-.2)/n,cw=(w-.2)/n-.012;
   add(a,back?.19:.02,cw,d-(back?.22:.04),.37,.13,'upholstery',true,'rounded');
   if(back){add(a,.035,cw,.24,.47,f.height-.55,'upholstery',true,'rounded');add(a,.02,cw,.27,f.height-.16,.17,'upholstery',false,'rounded');}
  }
  if(back){
   for(const u of [.015,w-.145])add(u,.12,.13,d-.14,.33,.34,'upholstery',true,'rounded');
   if(f.kind==='armchair')for(const u of [.03,w-.15])add(u,.04,.12,.32,.70,.32,'upholstery',false,'rounded');
   add(w*.24,.24,.30,.16,.51,.28,'bedding',false,'rounded');
   if(n>1)add(w*.68,.24,.32,.16,.51,.28,'linen',false,'rounded');
  }
 }else if(f.kind==='rug')add(0,0,w,d,.004,f.height,'livingRug',false);
 else if(f.kind==='livingCoffee'){
  add(0,0,w,d,f.height-.045,.045,'ceramic');add(0,0,w,d,.035,.035,'cabinet');
  for(const u of [0,w-.035])add(u,0,.035,d,.035,f.height-.08,'cabinet');
 }else if(f.kind==='livingMedia'){
  add(0,0,w,d,.08,.035,'cabinet');add(0,0,w,d,f.height-.04,.04,'cabinet');add(0,0,w,.02,.1,f.height-.14,'cabinet');
  for(let i=0;i<=3;i++)add(Math.min(w-.025,i*w/3),0,.025,d,.10,f.height-.14,'cabinet');
  for(const u of [.08,w-.12])add(u,.07,.045,.06,0,.08,'hardware');
  add(.10,.06,.43,.25,.12,.15,'steel');add(.12,.312,.39,.012,.16,.065,'hardware',false);
  add(w/3+.12,.05,.09,.25,.12,.23,'interiorDoor');add(w/3+.29,.14,.15,.08,.12,.045,'hardware',false,'rounded');
  add(2*w/3+.10,.08,.33,.23,.12,.07,'hardware');
 }else if(f.kind==='livingSpeaker')add(0,0,w,d,0,f.height,'hardware',f.bottom===0);
 else if(f.kind==='livingCurtain'){
  for(let i=0;i<10;i++){add(i*w/10,.008*(i%2),w/10,.026,0,f.height-.24,'livingSheer',false);add(i*w/10,.008*(i%2),w/10,.028,f.height-.24,.24,'livingGray',false);}
 }else if(f.kind==='livingWall')add(0,0,w,d,0,f.height,'livingGray',false);
 else if(f.kind==='livingArt')add(0,0,w,d,0,f.height,'livingArt',false);

 return out;
}
