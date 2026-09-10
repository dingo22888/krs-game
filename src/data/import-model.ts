import { floorOrder } from './house.ts';
import type { FloorId, FloorPlan, Furniture, Opening, Surface } from './house.ts';
import { inPolygon } from '../game/geometry.ts';
import type { Point2, Rect } from '../game/geometry.ts';

export const MODEL_STORAGE_KEY='krs-game.local-house.v1';
export const MAX_MODEL_BYTES=512_000;
type Obj=Record<string,unknown>;
function fail():never {throw new Error('Ungültige Hausdatei. Bitte die vorbereitete JSON-Datei auswählen.');}
function object(value:unknown):Obj {if(!value||typeof value!=='object'||Array.isArray(value))fail();return value as Obj;}
function number(value:unknown,min=-100,max=100):number {if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail();return value;}
function label(value:unknown):string {if(typeof value!=='string'||!value.trim()||value.length>80)fail();return value;}
function list<T>(value:unknown,max:number,parse:(v:unknown)=>T):T[] {if(!Array.isArray(value)||value.length>max)fail();return value.map(parse);}
function point(value:unknown):Point2 {const a=list(value,2,v=>number(v));if(a.length!==2)fail();return a as Point2;}
function rect(value:unknown):Rect {const a=list(value,4,v=>number(v));if(a.length!==4||a[0]>=a[2]||a[1]>=a[3])fail();return a as Rect;}
function polygon(value:unknown):Point2[] {
  const points=list(value,128,point);if(points.length<3)fail();
  let area=0;
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    // The geometry builder accepts orthogonal outlines, allowing PDF rounding.
    if(Math.abs(a[0]-b[0])>.002&&Math.abs(a[1]-b[1])>.002)fail();
    area+=a[0]*b[1]-b[0]*a[1];
  }
  if(Math.abs(area)<.00001)fail();return points;
}
function convexPolygon(value:unknown):Point2[] {
  const points=list(value,32,point);if(points.length<3)fail();
  let sign=0;
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
    const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
    if(Math.abs(cross)<1e-9)continue;
    if(sign&&Math.sign(cross)!==sign)fail();sign=Math.sign(cross);
  }
  if(!sign)fail();return points;
}
function oneOf<T extends string>(value:unknown,values:readonly T[]):T {if(typeof value!=='string'||!values.includes(value as T))fail();return value as T;}
function spawn(value:unknown):FloorPlan['spawn'] {const p=object(value);return {x:number(p.x),z:number(p.z),yaw:number(p.yaw,-7,7)};}

/** Reads a user-selected file in memory. No upload, fetch, or remote model URL. */
export function parseHouseModel(text:string):Record<FloorId,FloorPlan> {
  if(text.length>MAX_MODEL_BYTES)throw new Error('Die Hausdatei ist zu groß (maximal 512 KB).');
  let parsed:unknown;try{parsed=JSON.parse(text);}catch{fail();}
  const root=object(parsed);if(root.format!=='krs-house'||![1,2].includes(root.version as number))fail();
  const raw=object(root.floors);
  const result={} as Record<FloorId,FloorPlan>;
  for(const id of floorOrder) {
    const f=object(raw[id]);if(f.id!==id)fail();
    const plan:FloorPlan={
      id,name:label(f.name),height:number(f.height,1.85,6),
      footprint:polygon(f.footprint),walls:list(f.walls,100,polygon),
      rooms:list(f.rooms,60,v=>{const r=object(v);return {name:label(r.name),polygon:polygon(r.polygon),surface:oneOf<Surface>(r.surface,['wood','tile','concrete'])};}),
      openings:list(f.openings,100,v=>{
        const o=object(v);const opening:Opening={kind:oneOf<Opening['kind']>(o.kind,['window','door','passage']),rect:rect(o.rect),sill:o.sill===undefined?undefined:number(o.sill,0,5),top:o.top===undefined?undefined:number(o.top,.5,6)};
        if(o.leaf!==undefined){const leaf=object(o.leaf);if(leaf.side!==-1&&leaf.side!==1)fail();opening.leaf={hinge:oneOf(leaf.hinge,['start','end']),side:leaf.side};if(leaf.angle!==undefined){if(leaf.angle!==90&&leaf.angle!==180)fail();opening.leaf.angle=leaf.angle;}}
        if(o.balcony!==undefined){const b=object(o.balcony);if(opening.kind!=='window')fail();const width=number(b.width,.5,2);if(width>=Math.max(opening.rect[2]-opening.rect[0],opening.rect[3]-opening.rect[1])-.3)fail();opening.balcony={side:oneOf(b.side,['start','end']),width};}
        return opening;
      }),
      furniture:list(f.furniture,100,v=>{const item=object(v);return {kind:oneOf<Furniture['kind']>(item.kind,['sofa','table','counter','bed','shelf','chair','rug','armchair','tv']),rect:rect(item.rect),height:number(item.height,item.kind==='rug'?.005:.15,5),facing:item.facing===undefined?undefined:oneOf<Furniture['facing'] & string>(item.facing,['north','south','east','west'])};}),
      stairZones:list(f.stairZones,20,rect),spawn:spawn(f.spawn),
    };
    if(!plan.rooms.length||!plan.walls.length||!inPolygon(plan.spawn.x,plan.spawn.z,plan.footprint))fail();
    if(f.alternateSpawn!==undefined){const s=object(f.alternateSpawn);plan.alternateSpawn={...spawn(s),label:label(s.label)};if(!inPolygon(plan.alternateSpawn.x,plan.alternateSpawn.z,plan.footprint))fail();}
    if(f.elevation!==undefined)plan.elevation=number(f.elevation,-20,30);
    if(f.offset!==undefined)plan.offset=point(f.offset);
    if(f.floorHoles!==undefined)plan.floorHoles=list(f.floorHoles,20,rect);
    if(f.ceilingHoles!==undefined)plan.ceilingHoles=list(f.ceilingHoles,20,rect);
    if(f.stairs!==undefined)plan.stairs=list(f.stairs,4,v=>{
      const s=object(v);const steps=list(s.steps,80,v=>{const t=object(v),polygon=convexPolygon(t.polygon),top=number(t.top,.05,6);const walkHeights=t.walkHeights===undefined?undefined:list(t.walkHeights,32,v=>number(v,Math.max(0,top-.42),top));if(walkHeights&&walkHeights.length!==polygon.length)fail();return {polygon,top,walkHeights};});
      if(!steps.length)fail();return {to:oneOf(s.to,floorOrder),maxSlope:s.maxSlope===undefined?undefined:number(s.maxSlope,30,82),steps};
    });
    if(f.supports!==undefined)plan.supports=list(f.supports,100,v=>{const s=object(v),bottom=number(s.bottom,-.2,6),top=number(s.top,.1,6);if(top<=bottom)fail();return {rect:rect(s.rect),bottom,top};});
    if(f.roofs!==undefined)plan.roofs=list(f.roofs,12,v=>{const r=object(v);return {rect:rect(r.rect),axis:oneOf(r.axis,['x','z'] as const),startHeight:number(r.startHeight,.3,plan.height),endHeight:number(r.endHeight,.3,plan.height),...(r.cutouts===undefined?{}:{cutouts:list(r.cutouts,20,rect)})};});
    if(root.version===2&&plan.elevation===undefined)fail();
    result[id]=plan;
  }
  if(new Set(floorOrder.map(id=>JSON.stringify(result[id].walls))).size!==4)throw new Error('Die Datei enthält identische Etagen. Bitte das vollständige Hausmodell laden.');
  const elevated=floorOrder.filter(id=>result[id].elevation!==undefined);
  if(elevated.length&&elevated.length!==4)fail();
  for(const [i,id] of floorOrder.entries()) {
    const plan=result[id];
    if(i&&elevated.length&&(plan.elevation!-result[floorOrder[i-1]].elevation!)<result[floorOrder[i-1]].height)fail();
    for(const stair of plan.stairs??[]) {
      if(stair.to!==floorOrder[i+1]||plan.elevation===undefined)fail();
      const rise=result[stair.to].elevation!-plan.elevation;
      if(Math.abs(stair.steps.at(-1)!.top-rise)>.02)fail();
      if(!plan.ceilingHoles?.length||!result[stair.to].floorHoles?.length)fail();
      let previous=0;
      for(const step of stair.steps){if(step.top<previous||step.top-previous>.21)fail();previous=step.top;}
    }
  }
  return result;
}
