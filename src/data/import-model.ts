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
function oneOf<T extends string>(value:unknown,values:readonly T[]):T {if(typeof value!=='string'||!values.includes(value as T))fail();return value as T;}
function spawn(value:unknown):FloorPlan['spawn'] {const p=object(value);return {x:number(p.x),z:number(p.z),yaw:number(p.yaw,-7,7)};}

/** Reads a user-selected file in memory. No upload, fetch, or remote model URL. */
export function parseHouseModel(text:string):Record<FloorId,FloorPlan> {
  if(text.length>MAX_MODEL_BYTES)throw new Error('Die Hausdatei ist zu groß (maximal 512 KB).');
  let parsed:unknown;try{parsed=JSON.parse(text);}catch{fail();}
  const root=object(parsed);if(root.format!=='krs-house'||root.version!==1)fail();
  const raw=object(root.floors);
  const result={} as Record<FloorId,FloorPlan>;
  for(const id of floorOrder) {
    const f=object(raw[id]);if(f.id!==id)fail();
    const plan:FloorPlan={
      id,name:label(f.name),height:number(f.height,1.85,6),
      footprint:polygon(f.footprint),walls:list(f.walls,100,polygon),
      rooms:list(f.rooms,60,v=>{const r=object(v);return {name:label(r.name),polygon:polygon(r.polygon),surface:oneOf<Surface>(r.surface,['wood','tile','concrete'])};}),
      openings:list(f.openings,100,v=>{const o=object(v);return {kind:oneOf<Opening['kind']>(o.kind,['window','door','passage']),rect:rect(o.rect),sill:o.sill===undefined?undefined:number(o.sill,0,5),top:o.top===undefined?undefined:number(o.top,.5,6)};}),
      furniture:list(f.furniture,100,v=>{const item=object(v);return {kind:oneOf<Furniture['kind']>(item.kind,['sofa','table','counter','bed','shelf']),rect:rect(item.rect),height:number(item.height,.15,5)};}),
      stairZones:list(f.stairZones,20,rect),spawn:spawn(f.spawn),
    };
    if(!plan.rooms.length||!plan.walls.length||!inPolygon(plan.spawn.x,plan.spawn.z,plan.footprint))fail();
    if(f.alternateSpawn!==undefined){const s=object(f.alternateSpawn);plan.alternateSpawn={...spawn(s),label:label(s.label)};if(!inPolygon(plan.alternateSpawn.x,plan.alternateSpawn.z,plan.footprint))fail();}
    result[id]=plan;
  }
  if(new Set(floorOrder.map(id=>JSON.stringify(result[id].walls))).size!==4)throw new Error('Die Datei enthält identische Etagen. Bitte das vollständige Hausmodell laden.');
  return result;
}
