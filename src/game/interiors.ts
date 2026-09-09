import type { FloorId, FloorPlan, Furniture, Room } from '../data/house.ts';
import { inPolygon, rectanglePoints, subtractRects } from './geometry.ts';
import type { Rect } from './geometry.ts';
import { wallLayout } from './wall-layout.ts';

const bounds=(room:Room):Rect=>[Math.min(...room.polygon.map(p=>p[0])),Math.min(...room.polygon.map(p=>p[1])),Math.max(...room.polygon.map(p=>p[0])),Math.max(...room.polygon.map(p=>p[1]))];
const inside=(r:Rect,room:Room)=>inPolygon((r[0]+r[2])/2,(r[1]+r[3])/2,room.polygon);

/** Furnishing rules use only the loaded room geometry. No private coordinates
 * or floor outlines belong in the public bundle. Safe to run again on a saved
 * model: replace the room's generated furniture rather than duplicating it. */
export function prepareInteriors(input:Record<FloorId,FloorPlan>):Record<FloorId,FloorPlan> {
  const plan=input.eg;
  const dining=plan.rooms.find(r=>/^esszimmer$/i.test(r.name));
  const kitchen=plan.rooms.find(r=>/^küche$/i.test(r.name));
  if(!dining||!kitchen)return input;
  const d=bounds(dining),k=bounds(kitchen);
  // This recipe is for adjoining dining/kitchen rooms, with the kitchen east.
  if(k[0]<d[2]-.1||k[0]-d[2]>.65)return input;
  const result=structuredClone(input),eg=result.eg;
  for(const floor of Object.values(result)) {
    if(Math.abs(floor.height-2.3)<.001) {
      floor.height=2.35;
      // Keep the low knee wall and stair elevations; raise the high roof join.
      for(const roof of floor.roofs??[]) {
        if(Math.abs(roof.startHeight-2.3)<.001)roof.startHeight=2.35;
        if(Math.abs(roof.endHeight-2.3)<.001)roof.endHeight=2.35;
      }
    }
  }
  let layout=wallLayout(eg);
  // Complete a small recessed shaft junction at the dining partition's end.
  // Require both a horizontal return and a deeper vertical backing wall; never
  // fill a declared doorway or extrapolate a wall into an unbounded room.
  const endWall=layout.walls.find(w=>w[2]<d[2]&&d[2]-w[2]<.3&&Math.abs(w[1]-d[3])<.3&&w[2]-w[0]>.4&&w[3]-w[1]<.4);
  if(endWall) {
    const backing=layout.walls.find(w=>w[0]>endWall[2]+.001&&w[0]-endWall[2]<=.5&&w[2]-w[0]<.65&&w[1]<endWall[1]&&endWall[3]-w[1]<.8&&w[3]>=endWall[3]-.001);
    if(backing) {
      const fill:Rect=[endWall[2],backing[1],backing[0],endWall[3]];
      const overlapsOpening=layout.openings.some(o=>o.rect[0]<fill[2]&&o.rect[2]>fill[0]&&o.rect[1]<fill[3]&&o.rect[3]>fill[1]);
      if(!overlapsOpening&&subtractRects([fill],layout.walls).length) {
        eg.walls.push(rectanglePoints(fill));layout=wallLayout(eg);
      }
    }
  }
  const connecting=layout.openings.find(o=>o.kind==='passage'&&o.rect[0]>=d[2]-.1&&o.rect[2]<=k[0]+.1&&o.rect[1]>Math.max(d[1],k[1])&&o.rect[3]<Math.min(d[3],k[3]));
  // Match by order-independent overlap with the normalized opening.
  if(connecting) {
    const original=eg.openings.find(o=>o.kind==='passage'&&o.rect[0]<connecting.rect[2]&&o.rect[2]>connecting.rect[0]&&o.rect[1]<connecting.rect[3]&&o.rect[3]>connecting.rect[1]);
    if(original)original.leaf={hinge:'end',side:-1};
  }
  for(const opening of eg.openings) {
    // An exterior opening on the kitchen's north wall is glazing.
    const r=opening.rect;
    if(opening.kind==='door'&&r[0]>=k[0]&&r[2]<=k[2]&&Math.abs(r[3]-k[1])<.15) {
      opening.kind='window';opening.sill=1;delete opening.leaf;
    }
  }
  const table=eg.furniture.find(f=>f.kind==='table'&&inside(f.rect,dining));
  if(table) {
    const cx=(table.rect[0]+table.rect[2])/2,cz=(table.rect[1]+table.rect[3])/2;
    const alongZ=table.rect[3]-table.rect[1]>=table.rect[2]-table.rect[0];
    table.rect=alongZ?[cx-.45,cz-.8,cx+.45,cz+.8]:[cx-.8,cz-.45,cx+.8,cz+.45];
    eg.furniture=eg.furniture.filter(f=>f.kind!=='chair'||!inside(f.rect,dining));
    for(const side of [-1,1])for(const offset of [-.4,.4]) {
      const x=cx+(alongZ?side*.77:offset),z=cz+(alongZ?offset:side*.77);
      eg.furniture.push({kind:'chair',rect:[x-.23,z-.23,x+.23,z+.23],height:.9,facing:alongZ?(side===-1?'east':'west'):(side===-1?'south':'north')});
    }
  }
  // Fit each cabinet run against the actual inner wall face, not the slightly
  // different room-label polygon. Ignore small columns when finding the face.
  const face=(axis:0|1,edge:number,value:number)=>{
    const across=1-axis;
    const candidates=layout.walls.filter(w=>Math.abs(w[edge]-value)<.12&&w[across+2]-w[across]>.4&&w[across]<k[across+2]&&w[across+2]>k[across]);
    return candidates.sort((a,b)=>Math.abs(a[edge]-value)-Math.abs(b[edge]-value))[0]?.[edge]??value;
  };
  const west=face(0,2,k[0]),east=face(0,0,k[2]),north=face(1,3,k[1]),south=face(1,1,k[3]);
  if(east-west<3||south-north<3||!connecting)return result;
  const hall=layout.openings.find(o=>o.kind==='passage'&&o.rect[0]>=west-.1&&o.rect[2]<=east&&Math.abs(o.rect[1]-south)<.15);
  if(!hall)return result;
  eg.furniture=eg.furniture.filter(f=>!inside(f.rect,kitchen));
  const add=(rect:Rect,height:number,facing:Furniture['facing'])=>eg.furniture.push({kind:'counter',rect,height,facing});
  // East run: two full-height cabinets between a northern base unit and the
  // remaining worktop. The south run meets it without overlapping volumes.
  const tallStart=north+.9,tallEnd=tallStart+1.2;
  add([east-.6,north,east,tallStart],.92,'west');
  for(let i=0;i<2;i++)add([east-.6,tallStart+i*.6,east,tallStart+(i+1)*.6],2.2,'west');
  add([east-.6,tallEnd,east,south],.92,'west');
  add([hall.rect[2],south-.6,east-.6,south],.92,'north');
  // A peninsula, attached to the dining partition, with clearance to the door.
  const end=connecting.rect[1]-.25;
  add([west,end-.95,west+1.8,end],.92,'south');
  return result;
}
