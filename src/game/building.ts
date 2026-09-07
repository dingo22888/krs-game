import RAPIER from '@dimforge/rapier3d-compat';
import type { FloorId, FloorPlan } from '../data/house.ts';
import { buildModel } from './model.ts';
import type { BoxSpec, MaterialKind } from './model.ts';
import { inPolygon, rectanglePoints, subtractRects } from './geometry.ts';
import type { Point2 } from './geometry.ts';
import type { ClimbRegion } from './player.ts';

export interface HullSpec { vertices:number[]; material:MaterialKind; visible:boolean; collision:boolean }
export const origin=(plan:FloorPlan):[number,number,number]=>[plan.offset?.[0]??0,plan.elevation??0,plan.offset?.[1]??0];
export function localPosition(plan:FloorPlan,p:{x:number;y:number;z:number}) {
  const [x,y,z]=origin(plan);return {x:p.x-x,y:p.y-y,z:p.z-z};
}
export function connectedBuilding(floors:Record<FloorId,FloorPlan>) {
  return Object.values(floors).every(p=>p.elevation!==undefined);
}
export function climbRegions(plans:FloorPlan[]):ClimbRegion[] {
  return plans.flatMap(plan=>{
    const [x,y,z]=origin(plan);
    return (plan.stairs??[]).filter(s=>s.maxSlope).map(stair=>{
      const points=stair.steps.flatMap(s=>s.polygon);
      return {x0:x+Math.min(...points.map(p=>p[0]))-.25,x1:x+Math.max(...points.map(p=>p[0]))+.25,
        z0:z+Math.min(...points.map(p=>p[1]))-.25,z1:z+Math.max(...points.map(p=>p[1]))+.25,
        bottom:y-.1,top:y+stair.steps.at(-1)!.top+.25,maxSlope:stair.maxSlope!};
    });
  });
}
/** Only change the floor indicator at a storey landing, not during a jump. */
export function floorAtPosition(plans:FloorPlan[],p:{x:number;y:number;z:number},current:FloorId,grounded:boolean):FloorId {
  if(!grounded)return current;
  const candidates=plans.filter(plan=>{
    const q=localPosition(plan,p);
    return q.y>=-.08&&q.y<.22&&inPolygon(q.x,q.z,plan.footprint);
  });
  return candidates.sort((a,b)=>(b.elevation??0)-(a.elevation??0))[0]?.id??current;
}
export function buildBuilding(plans:FloorPlan[]):{boxes:BoxSpec[];hulls:HullSpec[]} {
  const boxes:BoxSpec[]=[],hulls:HullSpec[]=[];
  for(const plan of plans) {
    const [ox,oy,oz]=origin(plan);
    boxes.push(...buildModel(plan).map(b=>({...b,position:[b.position[0]+ox,b.position[1]+oy,b.position[2]+oz] as [number,number,number]})));
    const prism=(points:Point2[],bottom:(p:Point2,i:number)=>number,top:(p:Point2,i:number)=>number,material:MaterialKind,visible=true,collision=true)=>{
      const vertices=[...points.map((p,i)=>[p[0]+ox,bottom(p,i)+oy,p[1]+oz]),...points.map((p,i)=>[p[0]+ox,top(p,i)+oy,p[1]+oz])].flat();
      hulls.push({vertices,material,visible,collision});
    };
    for(const stair of plan.stairs??[])for(const step of stair.steps) {
      prism(step.polygon,()=>step.top-.14,()=>step.top,'wood',true,!step.walkHeights);
      // A continuous walking surface avoids snagging a capsule on narrow winders.
      // The optional vertex heights follow this tread's rise; headroom stays solid.
      if(step.walkHeights)prism(step.polygon,(_,i)=>step.walkHeights![i]-.14,(_,i)=>step.walkHeights![i],'wood',false,true);
    }
    for(const roof of plan.roofs??[]) {
      const axis=roof.axis==='x'?0:1;
      const underside=(p:Point2)=>roof.startHeight+(roof.endHeight-roof.startHeight)*(p[axis]-roof.rect[axis])/(roof.rect[axis+2]-roof.rect[axis]);
      for(const rect of subtractRects([roof.rect],plan.ceilingHoles??[])) {
        prism(rectanglePoints(rect),underside,()=>plan.height+.02,'ceiling');
      }
    }
  }
  return {boxes,hulls};
}
/** Build solid walls, roof undersides and the declared stair walking surfaces. */
export function addBuildingColliders(world:RAPIER.World,model:ReturnType<typeof buildBuilding>) {
  for(const b of model.boxes)if(b.collision)world.createCollider(RAPIER.ColliderDesc.cuboid(b.size[0]/2,b.size[1]/2,b.size[2]/2).setTranslation(...b.position));
  for(const hull of model.hulls)if(hull.collision) {
    const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(hull.vertices));
    if(!desc)throw new Error('Die Hausdatei enthält eine ungültige Treppen- oder Dachfläche.');
    world.createCollider(desc);
  }
}
