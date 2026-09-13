import type {FloorPlan,Furniture,Room} from '../data/house.ts';
import type {BoxSpec,MaterialKind} from './model.ts';
import {inPolygon} from './geometry.ts';
import {wallLayout} from './wall-layout.ts';

/** Relative furnishing recipe; the privately loaded room supplies all positions. */
export function furnishDining(plan:FloorPlan,room:Room) {
  const xs=room.polygon.map(p=>p[0]),zs=room.polygon.map(p=>p[1]);
  const west=Math.min(...xs),east=Math.max(...xs),north=Math.min(...zs),south=Math.max(...zs);
  if(east-west<3||south-north<3)return;
  const inside=(f:Furniture)=>inPolygon((f.rect[0]+f.rect[2])/2,(f.rect[1]+f.rect[3])/2,room.polygon);
  plan.furniture=plan.furniture.filter(f=>!inside(f)||(!f.kind.startsWith('dining')&&!(f.kind==='shelf'&&f.rect[1]<north+.55)&&!(f.kind==='radiator'&&f.rect[0]<west+.2)));
  const add=(kind:Furniture['kind'],rect:Furniture['rect'],height:number,bottom=0,facing:Furniture['facing']='south')=>plan.furniture.push({kind,rect,height,bottom,facing});
  for(const f of plan.furniture.filter(f=>inside(f)&&(f.kind==='chair'||f.kind==='table'))){f.finish='dining';if(f.kind==='chair')f.height=1.02;}
  room.surface='oak';
  const cx=(west+east)/2,width=Math.min(2.8,east-west-.6),back=north+.018;
  add('diningStorage',[cx-width/2,back,cx+width/2,back+.40],1.53);
  add('diningWallpaper',[west+.008,north+.003,east-.008,north+.012],plan.height-.16);
  // Four high-level strips also span lintels, safely above the door openings.
  add('diningCove',[west+.018,north+.018,east-.018,north+.072],.085,plan.height-.17);
  add('diningCove',[west+.018,south-.072,east-.018,south-.018],.085,plan.height-.17,'north');
  add('diningCove',[west+.018,north+.073,west+.072,south-.073],.085,plan.height-.17,'east');
  add('diningCove',[east-.072,north+.073,east-.018,south-.073],.085,plan.height-.17,'west');
  const table=plan.furniture.find(f=>f.kind==='table'&&inside(f));
  if(table){const tx=(table.rect[0]+table.rect[2])/2,tz=(table.rect[1]+table.rect[3])/2;add('diningPendant',[tx-.28,tz-.28,tx+.28,tz+.28],plan.height-1.5,1.5);}
  const layout=wallLayout(plan),door=layout.openings.find(o=>o.kind==='passage'&&Math.abs(o.rect[0]-east)<.25&&o.rect[1]>north&&o.rect[3]<south);
  if(door&&door.rect[1]-north>1.8)add('diningBench',[east-.40,north+.80,east-.02,Math.min(door.rect[1]-.25,north+2.15)],.44,0,'west');
  for(const o of layout.openings.filter(o=>o.kind==='window'&&Math.abs(o.rect[2]-west)<.15&&o.rect[1]>north&&o.rect[3]<south)) {
    const end=o.rect[3]-(o.balcony?.side==='end'?o.balcony.width:0),start=o.rect[1]+(o.balcony?.side==='start'?o.balcony.width:0);
    if(end-start>.8){
      add('radiator',[west+.016,start+.06,west+.13,end-.06],.57,.12,'east');
      for(const t of [.22,.62,.87]){const z=start+(end-start)*t;add('diningPlant',[west-.04,z-.12,west+.20,z+.12],t===.22?.9:.6,o.sill??.85);}
    }
  }
}

export function diningDetails(f:Furniture):BoxSpec[]|undefined {
  if(f.finish!=='dining'&&!f.kind.startsWith('dining'))return;
  const [x0,z0,x1,z1]=f.rect,face=f.facing??'south',turn=face==='east'||face==='west';
  const w=turn?z1-z0:x1-x0,d=turn?x1-x0:z1-z0,h=f.height,b=f.bottom??0,boxes:BoxSpec[]=[];
  const point=(u:number,v:number)=>face==='north'?[x1-u,z1-v]:face==='west'?[x1-v,z0+u]:face==='east'?[x0+v,z1-u]:[x0+u,z0+v];
  const add=(u0:number,v0:number,u1:number,v1:number,lo:number,hi:number,material:MaterialKind,collision=true,shape?:BoxSpec['shape'])=>{
    if(u1<=u0||v1<=v0||hi<=lo)return;
    const a=point(u0,v0),c=point(u1,v1);boxes.push({position:[(a[0]+c[0])/2,b+(lo+hi)/2,(a[1]+c[1])/2],size:[Math.abs(c[0]-a[0]),hi-lo,Math.abs(c[1]-a[1])],material,collision,...(shape?{shape}:{})});
  };
  const grip=(u:number,y:number)=>add(u-.045,d+.013,u+.045,d+.028,y,y+.012,'steel',false);
  if(f.kind==='diningStorage'){
    const side=(w-1.08)/2,left=side,right=side+1.08;
    const shelving=(a:number,c:number)=>{
      add(a,0,c,.025,.04,.80,'cabinet');
      for(const y of [.04,.40,.77])add(a,0,c,d,y,y+.03,'cabinet');
      for(const u of [a,(a+c)/2-.014,c-.028])add(u,.025,u+.028,d,.07,.77,'cabinet');
      for(const u of [a+.045,(a+c)/2+.025]){
        const rw=(c-a)/2-.07;
        add(u,.06,u+rw,d-.018,.45,.744,'wicker');
        add(u+rw*.34,d-.017,u+rw*.66,d-.014,.69,.722,'hardware',false);
        add(u,.06,u+rw,d-.018,.09,.374,'upholstery');
      }
    };
    shelving(0,left);shelving(right,w);
    add(left,0,right,.025,.04,h,'cabinet');
    for(const u of [left,right-.025,left+.73])add(u,.025,u+.025,d,.04,h,'cabinet');
    for(const y of [.04,h-.025])add(left,0,right,d,y,y+.025,'cabinet');
    for(const [lo,hi] of [[.07,.52],[.53,h-.04]]){add(left+.025,d-.027,left+.72,d,lo,hi,'interiorDoor');grip(left+.65,hi-.12);}
    for(const y of [.15,.48,.81,1.14]){
      add(left+.76,.03,right-.025,d-.025,y,y+.012,'glass',false);
      for(let j=0;j<2;j++)add(left+.80+j*.09,.12,left+.85+j*.09,.19,y+.014,y+.11,'ceramic',false,'ovalY');
    }
    add(left+.76,d-.014,right-.025,d,.075,h-.04,'glass');
    grip(left+.80,.77);
    // Small table lamp on the left cube shelf.
    add(side*.45-.08,d*.5-.08,side*.45+.08,d*.5+.08,.8,.82,'steel',false,'ovalY');
    add(side*.45-.008,d*.5-.008,side*.45+.008,d*.5+.008,.82,1.13,'steel',false);
    add(side*.45-.105,d*.5-.105,side*.45+.105,d*.5+.105,1.10,1.30,'cabinet',false,'shade');
  }else if(f.kind==='table'){
    add(0,0,w,d,h-.055,h,'diningWood');
    for(const u of [.025,w-.115])for(const v of [.025,d-.115])add(u,v,u+.09,v+.09,0,h-.055,'diningWood');
    add(.07,.065,w-.07,.095,h-.15,h-.055,'diningWood');add(.07,d-.095,w-.07,d-.065,h-.15,h-.055,'diningWood');
    add(.065,.07,.095,d-.07,h-.15,h-.055,'diningWood');add(w-.095,.07,w-.065,d-.07,h-.15,h-.055,'diningWood');
    const alongZ=d>w;
    for(const side of [-1,1])for(const offset of [-.38,.38]){const u=w/2+(alongZ?side*.24:offset),v=d/2+(alongZ?offset:side*.24);add(u-.16,v-.20,u+.16,v+.20,h+.001,h+.003,'upholstery',false);}
  }else if(f.kind==='chair'){
    for(const u of [.02,w-.05])for(const v of [.04,d-.07])add(u,v,u+.03,v+.03,0,.45,'wicker');
    add(.01,.025,w-.01,d-.02,.43,.485,'wicker');
    add(.025,.075,w-.025,d-.04,.485,.515,'linen');
    add(.015,.015,w-.015,.075,.48,h,'wicker');
  }else if(f.kind==='diningBench'){
    add(0,0,w,d,.36,.44,'upholstery');add(0,.01,.12,d-.01,0,.36,'upholstery');add(w-.12,.01,w,d-.01,0,.36,'upholstery');
  }else if(f.kind==='diningWallpaper')add(0,0,w,d,0,h,'diningPattern',false);
  else if(f.kind==='diningCove'){
    add(0,0,w,d,0,.027,'cabinet',false);add(0,.014,w,d,.027,.037,'lampGlow',false);
    add(0,0,w,.014,.027,h,'cabinet',false);
  }else if(f.kind==='diningPendant'){
    add(w/2-.055,d/2-.055,w/2+.055,d/2+.055,h-.075,h,'cabinet',false,'shade');
    add(w/2-.003,d/2-.003,w/2+.003,d/2+.003,.37,h-.075,'cabinet',false);
    add(0,0,w,d,0,.37,'diningShade',false,'drum');
    add(.022,.022,w-.022,d-.022,0,.35,'copper',false,'drum');
    add(w/2-.045,d/2-.045,w/2+.045,d/2+.045,.09,.19,'lampGlow',false,'ellipsoid');
  }else if(f.kind==='diningPlant'){
    add(w*.16,d*.16,w*.84,d*.84,0,.20,'upholstery',false,'ovalY');
    add(w*.2,d*.2,w*.8,d*.8,.20,.204,'wood',false,'ovalY');
    add(w/2-.007,d/2-.007,w/2+.007,d/2+.007,.20,h*.84,'wood',false);
    for(let i=0;i<8;i++){const a=i*Math.PI/4,u=w/2+Math.cos(a)*w*.42,v=d/2+Math.sin(a)*d*.42,y=.26+i*(h-.38)/8;add(u-.07,v-.10,u+.07,v+.10,y,y+.035,'leaf',false,'ellipsoid');}
  }
  return boxes;
}
