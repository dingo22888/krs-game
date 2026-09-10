import type {FloorId,FloorPlan} from '../data/house.ts';
import type {Rect} from './geometry.ts';

const bounds=(points:number[][]):Rect=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];

/** Correct the east dormer from the loaded rooms. Ratios follow the annotated
 * plan; the drawing's dashed contour denotes 2 m headroom, not the roof join.
 * No private absolute room coordinates are bundled here. */
export function prepareDormers(input:Record<FloorId,FloorPlan>):Record<FloorId,FloorPlan> {
  const plan=input.og;
  const bedroom=plan.rooms.find(r=>/^(schlafen|schlafzimmer)$/i.test(r.name));
  const bathroom=plan.rooms.find(r=>/^bad$/i.test(r.name));
  if(!bedroom||!bathroom)return input;
  const bed=bounds(bedroom.polygon),bath=bounds(bathroom.polygon);
  if(Math.abs(bed[2]-bath[2])>.2||bath[1]<bed[3]||bath[1]-bed[3]>.5)return input;
  const eastWindow=plan.openings.find(o=>o.kind==='window'&&Math.abs(o.rect[0]-bed[2])<.25&&o.rect[1]>bed[1]&&o.rect[3]<=bed[3]+.05);
  const bathWindows=plan.openings.filter(o=>o.kind==='window'&&Math.abs(o.rect[0]-bath[2])<.25&&o.rect[1]>=bath[1]-.05&&o.rect[3]<=bath[3]+.05);
  const roofIndex=plan.roofs?.findIndex(r=>r.axis==='x'&&r.startHeight>r.endHeight&&r.rect[0]<bed[2]&&r.rect[2]>=bed[2]-.05)??-1;
  if(!eastWindow||!bathWindows.length||roofIndex<0)return input;
  const result=structuredClone(input),og=result.og,roof=og.roofs![roofIndex];
  // The dashed line lies about one fifth of the bedroom width from the east
  // inner face. Retain the imported pitch, and anchor its height at exactly 2 m.
  const pitch=(roof.startHeight-roof.endHeight)/(roof.rect[2]-roof.rect[0]);
  const heightLine=bed[2]-(bed[2]-bed[0])*.2;
  if(Math.abs(roof.startHeight-pitch*(heightLine-roof.rect[0])-2)>1e-8) {
    roof.rect[0]=heightLine-(og.height-2)/pitch;
    roof.startHeight=og.height;
    roof.endHeight=2-(roof.rect[2]-heightLine)*pitch;
  }
  // The dormer starts at the bedroom side window and continues across both
  // bathroom windows to the room's south wall. A horizontal ceiling remains
  // above the cutout.
  const start=eastWindow.rect[1],end=bath[3];
  const cutout:Rect=[roof.rect[0],start,roof.rect[2],end];
  roof.cutouts=[...(roof.cutouts??[]).filter(r=>!(Math.abs(r[1]-start)<1e-8&&r[3]>bath[1])),cutout];
  // The earlier import contains the lower bathroom window. Add the matching
  // upper sash shown on the plan once; on later passes the pair is retained.
  if(bathWindows.length===1) {
    const source=bathWindows[0],upperEnd=Math.min(end,bath[1]+(source.rect[3]-source.rect[1]));
    og.openings.push({kind:'window',rect:[source.rect[0],bath[1],source.rect[2],upperEnd],sill:source.sill??1,top:source.top??2.1});
  }
  return result;
}
