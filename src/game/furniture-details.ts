import type {Furniture} from '../data/house.ts';
import type {BoxSpec,MaterialKind} from './model.ts';

/** Local u runs along the back wall, v faces the room. Orient both the visible
 * parts and their colliders together, including headboards and TV screens. */
export function furnitureDetails(f:Furniture):BoxSpec[]|undefined {
  const kinds=['bathtub','vanity','toilet','radiator','dresser','wardrobe','nightstand','mirror','tilePanel','ledge'];
  if(!kinds.includes(f.kind)&&!(f.kind==='bed'&&f.facing)&&!(f.kind==='tv'&&f.facing))return;
  const boxes:BoxSpec[]=[],[x0,z0,x1,z1]=f.rect,face=f.facing??'south';
  const turn=face==='east'||face==='west',w=turn?z1-z0:x1-x0,d=turn?x1-x0:z1-z0,h=f.height,b=f.bottom??0;
  const point=(u:number,v:number):[number,number]=>face==='south'?[x0+u,z0+v]:face==='north'?[x1-u,z1-v]:face==='west'?[x1-v,z0+u]:[x0+v,z1-u];
  const add=(u0:number,v0:number,u1:number,v1:number,lo:number,hi:number,material:MaterialKind,collision=true)=>{
    if(u1<=u0||v1<=v0||hi<=lo)return;
    const a=point(u0,v0),c=point(u1,v1);
    boxes.push({position:[(a[0]+c[0])/2,b+(lo+hi)/2,(a[1]+c[1])/2],size:[Math.abs(a[0]-c[0]),hi-lo,Math.abs(a[1]-c[1])],material,collision});
  };
  const ellipse=(u:number,v:number,rx:number,rz:number,lo:number,hi:number,material:MaterialKind,collision=true,shape:BoxSpec['shape']='ovalY')=>{
    add(u-rx,v-rz,u+rx,v+rz,lo,hi,material,collision);
    boxes.at(-1)!.shape=shape;
  };
  const drawer=(lo:number,hi:number,material:MaterialKind)=>{
    add(.015,d-.015,w-.015,d+.006,lo,hi,material);
    add(w*.32,d+.006,w*.68,d+.025,hi-.045,hi-.028,'hardware',false);
  };
  if(f.kind==='bathtub') {
    add(0,0,w,d,.02,.17,'bathTile');
    add(0,0,w,.065,.17,h,'ceramic');add(0,d-.065,w,d,.17,h,'ceramic');
    add(0,.065,.08,d-.065,.17,h,'ceramic');add(w-.08,.065,w,d-.065,.17,h,'ceramic');
    add(.08,.065,w-.08,d-.065,.16,.20,'ceramic');
    ellipse(.25,d*.5,.025,.025,.20,.204,'hardware',false);
    // Black shower rail, mixer and overhead head on the tiled back wall.
    add(.22,.025,.245,.05,h+.10,2.02,'hardware',false);
    add(.17,.025,.30,.15,h+.16,h+.21,'hardware',false);
    add(.22,.025,.245,.29,1.98,2.01,'hardware',false);
    add(.12,.17,.35,.37,1.95,1.98,'hardware',false);
  } else if(f.kind==='vanity') {
    add(.02,.015,w-.02,d-.01,.09,h-.12,'upholstery');
    add(0,0,w,d,h-.12,h-.075,'wood');
    drawer(.13,.40,'upholstery');drawer(.415,h-.15,'upholstery');
    add(.065,.065,w-.065,d-.04,h-.075,h-.04,'ceramic');
    add(.065,.065,w-.065,.10,h-.04,h+.025,'ceramic');
    add(.065,d-.075,w-.065,d-.04,h-.04,h+.025,'ceramic');
    add(.065,.10,.10,d-.075,h-.04,h+.025,'ceramic');
    add(w-.10,.10,w-.065,d-.075,h-.04,h+.025,'ceramic');
    add(w*.5-.018,.02,w*.5+.018,.05,h-.08,h+.19,'hardware',false);
    add(w*.5-.018,.03,w*.5+.018,.16,h+.16,h+.19,'hardware',false);
  } else if(f.kind==='toilet') {
    ellipse(w/2,d*.46,w*.34,d*.32,.05,h-.08,'ceramic',true,'ellipsoid');
    ellipse(w/2,d*.52,w*.49,d*.46,h-.08,h,'ceramic');
    // A closed oval seat, attached to the cistern wall.
    ellipse(w/2,d*.52,w*.47,d*.43,h,h+.018,'cabinet',false);
  } else if(f.kind==='radiator') {
    add(0,0,w,d,0,h,'cabinet');
    for(let u=.025;u<w-.015;u+=.038)add(u,d,u+.015,d+.014,.025,h-.025,'ceramic',false);
  } else if(f.kind==='bed') {
    add(0,0,w,d,.05,.23,'wood');
    add(.01,.02,w-.01,d-.01,.23,h-.19,'upholstery');
    add(.02,.04,w-.02,d-.015,h-.19,h,'linen');
    add(0,0,w,.085,.15,1.12,'wood');
    add(.045,.085,w-.045,.11,.44,1.085,'upholstery');
    for(const u of [.045,w/2+.025]) {
      add(u,.16,u+w/2-.07,.52,h,h+.12,'linen',false);
      add(u,.64,u+w/2-.07,d-.055,h,h+.045,'bedding',false);
      for(let j=0;j<3;j++)add(u,.70+j*.4,u+w/2-.07,.86+j*.4,h+.045,h+.048,j===1?'linen':'rug',false);
    }
  } else if(f.kind==='dresser'||f.kind==='nightstand') {
    const mat=f.kind==='nightstand'?'wood':'cabinet';
    add(0,0,w,d,.035,h,mat);
    const count=f.kind==='nightstand'?2:4;
    for(let i=0;i<count;i++)drawer(.07+i*(h-.08)/count,.055+(i+1)*(h-.08)/count,mat);
  } else if(f.kind==='wardrobe') {
    add(0,0,w,d,.035,h,'cabinet');
    add(.025,d,w*.5-.008,d+.014,.06,h-.04,'mirror',false);
    add(w*.5+.008,d,w-.025,d+.014,.06,h-.04,'cabinet',false);
    for(const y of [h*.33,h*.66])add(w*.5,d+.015,w-.02,d+.02,y,y+.012,'metal',false);
  } else if(f.kind==='mirror') {
    const shape=turn?'ovalX':'ovalZ';
    add(0,0,w,d,0,h,'hardware',false);boxes.at(-1)!.shape=shape;
    add(.012,d,w-.012,d+.004,.012,h-.012,'mirror',false);boxes.at(-1)!.shape=shape;
  } else if(f.kind==='tv') {
    // Default TV bottom matches the existing living-room placement.
    const lo=f.bottom===undefined?1.03:0;
    add(0,0,w,d,lo,lo+h,'hardware');
    add(.012,d,w-.012,d+.003,lo+.012,lo+h-.012,'screen',false);
  } else if(f.kind==='tilePanel') {
    add(0,0,w,d,0,h,'bathTile',false);
    for(let y=.6;y<h;y+=.6)add(0,d,w,d+.001,y,y+.004,'rug',false);
    for(let u=.6;u<w;u+=.6)add(u,d,u+.004,d+.001,0,h,'rug',false);
  } else if(f.kind==='ledge') {
    add(0,0,w,d,0,h-.025,'wall');add(0,0,w,d,h-.025,h,'bathTile');
  }
  return boxes;
}
