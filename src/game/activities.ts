import type { FloorPlan, Room } from '../data/house.ts';
import { decomposePolygon, inPolygon } from './geometry.ts';
import type { Point2, Rect } from './geometry.ts';
import { origin } from './building.ts';

export interface BoxingLocation { x:number; y:number; z:number; ceiling:number; room:Room }
const overlaps = (a:Rect,b:Rect) => a[0]<b[2] && a[2]>b[0] && a[1]<b[3] && a[3]>b[1];

function edgeDistance(x:number,z:number,polygon:Point2[]) {
  return Math.min(...polygon.map((a,i)=>{
    const b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
  }));
}

/** Derive activities only after loading the private model. No house coordinates
 * or modified house files belong in the public bundle. Keep the input immutable.
 */
export function prepareActivities(plan:FloorPlan):{plan:FloorPlan;boxing?:BoxingLocation} {
  if(plan.id!=='kg' || plan.height<2)return {plan};
  const room=plan.rooms.find(r=>/werkstatt/i.test(r.name))
    ?? plan.rooms.find(r=>/heizung|heizkeller|heizraum/i.test(r.name));
  if(!room)return {plan};
  const parts=decomposePolygon(room.polygon);
  const obstacles=[...(plan.floorHoles??[]),...(plan.ceilingHoles??[]),...plan.stairZones,
    ...(plan.supports??[]).map(s=>s.rect),...(plan.roofs??[]).map(r=>r.rect)];
  let best:{x:number;z:number;clearance:number}|undefined;
  for(const [x0,z0,x1,z1] of parts) {
    const nx=Math.max(1,Math.ceil((x1-x0)/.15)),nz=Math.max(1,Math.ceil((z1-z0)/.15));
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++) {
      const x=x0+(i+.5)*(x1-x0)/nx,z=z0+(j+.5)*(z1-z0)/nz;
      if(obstacles.some(r=>overlaps([x-.95,z-.95,x+.95,z+.95],r)))continue;
      if(plan.walls.some(w=>inPolygon(x,z,w)))continue;
      const clearance=Math.min(edgeDistance(x,z,room.polygon),...plan.walls.map(w=>edgeDistance(x,z,w)));
      if(clearance>=1 && (!best || clearance>best.clearance))best={x,z,clearance};
    }
  }
  if(!best)return {plan};
  const [ox,oy,oz]=origin(plan);
  return {
    plan:{...plan,furniture:plan.furniture.filter(f=>!parts.some(r=>overlaps(r,f.rect)))},
    boxing:{x:best.x+ox,y:oy,z:best.z+oz,ceiling:oy+plan.height,room},
  };
}
