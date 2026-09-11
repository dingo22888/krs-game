import type {Furniture} from '../data/house.ts';
import type {BoxSpec,MaterialKind} from './model.ts';

/** Cabinet-local u is horizontal along its front; v points toward the cook.
 * Every solid part shares its dimensions with the collision model. */
export function kitchenDetails(f:Furniture):BoxSpec[]|undefined {
  if(!f.kitchen&&!['barstool','kitchenPendant','kitchenSplash','pantryDoor','windowBlind','wallClock','ceilingSpot'].includes(f.kind))return;
  const [x0,z0,x1,z1]=f.rect,face=f.facing??'south',turn=face==='east'||face==='west';
  const w=turn?z1-z0:x1-x0,d=turn?x1-x0:z1-z0,h=f.height,b=f.bottom??0,boxes:BoxSpec[]=[];
  const point=(u:number,v:number)=>face==='north'?[x1-u,z1-v]:face==='west'?[x1-v,z0+u]:face==='east'?[x0+v,z1-u]:[x0+u,z0+v];
  const add=(u0:number,v0:number,u1:number,v1:number,lo:number,hi:number,material:MaterialKind,collision=true,shape?:BoxSpec['shape'])=>{
    if(u1<=u0||v1<=v0||hi<=lo)return;
    const a=point(u0,v0),c=point(u1,v1);
    boxes.push({position:[(a[0]+c[0])/2,b+(lo+hi)/2,(a[1]+c[1])/2],size:[Math.abs(c[0]-a[0]),hi-lo,Math.abs(c[1]-a[1])],material,collision,...(shape?{shape}:{})});
  };
  const handle=(u:number,y:number,len=.18)=>{
    add(u-len/2,d+.027,u+len/2,d+.045,y,y+.014,'hardware',false);
    for(const a of [u-len/2,u+len/2-.015])add(a,d+.01,a+.015,d+.035,y,y+.014,'hardware',false);
  };
  const panel=(u0:number,u1:number,lo:number,hi:number,material:MaterialKind='kitchenFront',grip=true)=>{
    add(u0+.005,d,u1-.005,d+.018,lo+.004,hi-.004,material);
    if(grip)handle((u0+u1)/2,hi-.055);
  };
  if(f.kind==='counter') {
    const high=h>1.5,hob=f.kitchen==='hob',back=hob?.28:0,top=h-.035;
    add(.045,back+.045,w-.045,d-.05,0,.1,'hardware');
    // Recessed carcass and independent doors keep fine shadow gaps visible.
    add(.015,back,w-.015,d-.008,.1,high?h:f.kitchen==='sink'?h-.21:top,'kitchenFront');
    if(!high) {
      if(f.kitchen==='sink'){
        // Real opening in the oak top, with a recessed black basin.
        const a=.04,c=w-.04,va=.13,vc=d-.07;
        add(0,0,w,va,top,h,'kitchenOak');add(0,vc,w,d+.028,top,h,'kitchenOak');
        add(0,va,a,vc,top,h,'kitchenOak');add(c,va,w,vc,top,h,'kitchenOak');
        add(a,va,c,vc,h-.19,h-.175,'hardware');
        add(a,va,a+.018,vc,h-.175,h+.006,'hardware');add(c-.018,va,c,vc,h-.175,h+.006,'hardware');
        add(a,va,c,va+.018,h-.175,h+.006,'hardware');add(a,vc-.018,c,vc,h-.175,h+.006,'hardware');
        add(w+.015,va,w+.40,vc,h,h+.008,'hardware',false);
        for(let u=w+.04;u<w+.38;u+=.035)add(u,va+.02,u+.008,vc-.02,h+.008,h+.012,'metal',false);
        const tap=(a+c)/2;add(tap-.018,.075,tap+.018,.11,h,h+.32,'hardware',false);
        add(tap-.018,.075,tap+.018,.25,h+.285,h+.32,'hardware',false);
      } else add(0,0,w,d+.028,top,h,'kitchenOak');
    }
    if(f.kitchen==='oven') {
      panel(0,w,.1,.31);panel(0,w,.31,.59);
      panel(0,w,.60,1.23,'hardware',false);
      add(.045,d+.019,w-.045,d+.023,.67,1.09,'screen',false);
      add(.04,d+.019,w-.04,d+.025,1.125,1.215,'hardware',false);
      handle(w/2,1.085,w-.11);
      add(w*.42,d+.026,w*.58,d+.029,1.15,1.18,'steel',false);
      panel(0,w,1.24,1.78);panel(0,w,1.78,h);
    } else if(f.kitchen==='fridge') {
      panel(0,w,.1,.36);panel(0,w,.36,1.78);panel(0,w,1.78,h);
    } else if(f.kitchen==='dishwasher') {
      panel(0,w,.1,h-.13,'kitchenFront',false);
      panel(0,w,h-.13,h-.035,'steel',false);
      add(w*.32,d+.02,w*.68,d+.025,h-.112,h-.055,'hardware',false);
    } else if(f.kitchen==='sink'||f.kitchen==='corner')panel(0,w,.1,top);
    else {
      const n=hob?2:1;
      for(let i=0;i<n;i++)for(const [lo,hi] of [[.1,.35],[.35,.74],[.74,top]])panel(w*i/n,w*(i+1)/n,lo,hi);
    }
    if(hob){
      // Flush induction glass, four subtle rings, central downdraft grille.
      const a=w/2-.40,c=w/2+.40,va=.37,vc=d-.025;
      add(a,va,c,vc,h,h+.006,'screen',false);
      for(const u of [w/2-.24,w/2+.24])for(const v of [va+.14,vc-.11]) {
        add(u-.092,v-.092,u+.092,v+.092,h+.006,h+.007,'metal',false,'ovalY');
        add(u-.088,v-.088,u+.088,v+.088,h+.007,h+.008,'screen',false,'ovalY');
      }
      add(w/2-.048,va+.045,w/2+.048,vc-.035,h+.006,h+.011,'hardware',false);
      for(let v=va+.065;v<vc-.035;v+=.028)add(w/2-.037,v,w/2+.037,v+.008,h+.011,h+.013,'metal',false);
    }
  } else if(f.kind==='barstool') {
    add(.02,.02,w-.02,d-.02,.015,.035,'hardware',true,'ovalY');
    add(w/2-.028,d/2-.028,w/2+.028,d/2+.028,.035,.64,'metal',true,'ovalY');
    add(.025,.045,w-.025,d-.015,.64,.695,'upholstery');
    add(.025,.025,w-.025,.085,.685,h,'upholstery');
    add(.075,d*.65,w-.075,d*.65+.025,.30,.325,'metal');
    for(const u of [.07,w-.095])add(u,d/2,u+.025,d*.65,.30,.325,'metal');
  } else if(f.kind==='kitchenPendant') {
    add(w*.25,d/2-.045,w*.75,d/2+.045,h-.035,h,'hardware',false);
    for(const u of [w*.23,w*.77])add(u-.006,d/2-.006,u+.006,d/2+.006,h-.25,h-.035,'hardware',false);
    add(0,d/2-.035,w,d/2+.035,h-.29,h-.22,'kitchenOak',false,'ovalX');
    for(const [i,t] of [.08,.36,.64,.92].entries()) {
      const u=w*t,lo=i%2?.035:0;
      add(u-.004,d/2-.004,u+.004,d/2+.004,lo+.29,h-.22,'hardware',false);
      add(u-.031,d/2-.031,u+.031,d/2+.031,lo+.20,lo+.31,'kitchenOak',false,'ovalY');
      add(u-.105,d/2-.105,u+.105,d/2+.105,lo,lo+.20,'hardware',false,'shade');
      add(u-.091,d/2-.091,u+.091,d/2+.091,lo-.003,lo+.002,'lampGlow',false,'ovalY');
    }
  } else if(f.kind==='ceilingSpot') {
    add(0,0,w,d,0,h,'hardware',false,'ovalY');
    add(.008,.008,w-.008,d-.008,-.002,.002,'lampGlow',false,'ovalY');
  } else if(f.kind==='kitchenSplash')add(0,0,w,d,0,h,'kitchenFront',false);
  else if(f.kind==='pantryDoor') {
    // A room-depth enclosure with its closed white door facing the kitchen.
    // Front plane matches the cabinet fronts; the cavity is behind it.
    const doorTop=Math.min(2.06,h-.08),jamb=.07,front=d-.065;
    add(0,0,jamb,d,0,h,'wall');add(w-jamb,0,w,d,0,h,'wall');
    add(jamb,front,w-jamb,d,doorTop,h,'wall');
    add(jamb,0,w-jamb,.04,0,h,'wall');
    add(jamb,.04,w-jamb,front,h-.04,h,'wall');
    add(jamb,front,w-jamb,d-.02,0,doorTop,'interiorDoor');
    add(jamb-.015,d-.02,jamb+.025,d+.012,0,doorTop+.035,'interiorDoor',false);
    add(w-jamb-.025,d-.02,w-jamb+.015,d+.012,0,doorTop+.035,'interiorDoor',false);
    add(jamb-.015,d-.02,w-jamb+.015,d+.012,doorTop,doorTop+.035,'interiorDoor',false);
    add(jamb+.12,d-.019,w-jamb-.12,d-.016,.18,doorTop-.30,'hardware',false);
    handle(w-jamb-.08,1,.11);
  } else if(f.kind==='windowBlind') {
    for(const [a,c] of [[0,w/2-.028],[w/2+.028,w]])for(let y=0;y<h;y+=.025)add(a,0,c,d,y,Math.min(y+.021,h),'linen',false);
  } else if(f.kind==='wallClock') {
    const shape=turn?'ovalX':'ovalZ';
    add(0,0,w,d,0,h,'hardware',false,shape);
    for(const [u,y] of [[w/2,h-.035],[w/2,.035],[.035,h/2],[w-.035,h/2]])add(u-.006,d,u+.006,d+.002,y-.012,y+.012,'cabinet',false);
    add(w/2-.004,d,w/2+.004,d+.004,h/2,h*.86,'cabinet',false);
    add(w/2,d,w*.76,d+.004,h/2-.004,h/2+.004,'cabinet',false);
  }
  return boxes;
}
