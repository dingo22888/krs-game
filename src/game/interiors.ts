import type { FloorId, FloorPlan, Room } from '../data/house.ts';
import { inPolygon, rectanglePoints, subtractRects } from './geometry.ts';
import type { Rect } from './geometry.ts';
import { prepareDormers } from './dormers.ts';
import { prepareUpperInteriors } from './upper-interiors.ts';
import { wallLayout } from './wall-layout.ts';
import { fitKitchen } from './kitchen-layout.ts';

const bounds=(room:Room):Rect=>[Math.min(...room.polygon.map(p=>p[0])),Math.min(...room.polygon.map(p=>p[1])),Math.max(...room.polygon.map(p=>p[0])),Math.max(...room.polygon.map(p=>p[1]))];
const inside=(r:Rect,room:Room)=>inPolygon((r[0]+r[2])/2,(r[1]+r[3])/2,room.polygon);

/** Furnishing rules use only the loaded room geometry. No private coordinates
 * or floor outlines belong in the public bundle. Safe to run again on a saved
 * model: replace the room's generated furniture rather than duplicating it. */
export function prepareInteriors(input:Record<FloorId,FloorPlan>):Record<FloorId,FloorPlan> {
  return prepareUpperInteriors(prepareDormers(prepareBaseInteriors(input)));
}
function prepareBaseInteriors(input:Record<FloorId,FloorPlan>):Record<FloorId,FloorPlan> {
  input=prepareLivingRoom(input);
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
    if(original)original.leaf={hinge:'end',side:-1,angle:180};
  }
  for(const opening of eg.openings) {
    // An exterior opening on the kitchen's north wall is glazing.
    const r=opening.rect;
    // Looking out through the dining room's west wall, the left-hand bay is
    // the south/end portion. Preserve the entire original opening and its sill
    // metadata; the renderer splits only the glazing and the lower masonry.
    if(opening.kind==='window'&&Math.abs(r[2]-d[0])<.15&&r[1]>d[1]&&r[3]<d[3]&&r[3]-r[1]>1.8) {
      opening.balcony={side:'end',width:.9};
    }
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
  if(!hall||south-north<3.7||east-.6-1.8<hall.rect[2])return result;
  eg.furniture=eg.furniture.filter(f=>!inside(f.rect,kitchen));
  eg.rooms.find(r=>r.name===kitchen.name)!.surface='oak';
  eg.furniture.push(...fitKitchen([west,north,east,south],hall.rect[2],connecting.rect[1],eg.height,wallLayout(eg).openings));
  return result;
}

/** Locate the lounge from its imported sofa and room, keeping private dimensions out of source. */
function prepareLivingRoom(input:Record<FloorId,FloorPlan>):Record<FloorId,FloorPlan> {
  const room=input.eg.rooms.find(r=>/^wohnzimmer$/i.test(r.name));
  if(!room)return input;
  const sofas=input.eg.furniture.filter(f=>f.kind==='sofa'&&inside(f.rect,room));
  if(!sofas.length)return input;
  const r=bounds(room),main=sofas.reduce((a,b)=>a.height>b.height?a:b);
  // Existing lounge layout: sofa against the west wall, facing the east wall.
  if(main.rect[0]-r[0]>.65||r[2]-r[0]<3)return input;
  const result=structuredClone(input),plan=result.eg;
  plan.furniture=plan.furniture.filter(f=>!(['rug','armchair','tv'].includes(f.kind)&&inside(f.rect,room)));
  for(const sofa of plan.furniture.filter(f=>f.kind==='sofa'&&inside(f.rect,room)))sofa.facing='east';
  const north=Math.min(...sofas.map(f=>f.rect[1])),south=Math.max(...sofas.map(f=>f.rect[3]));
  const west=Math.min(...sofas.map(f=>f.rect[0])),east=Math.max(...sofas.map(f=>f.rect[2]));
  plan.furniture.push({kind:'rug',rect:[Math.max(r[0]+.06,west-.12),Math.max(r[1]+.1,north-.18),Math.min(r[2]-.8,east+.65),Math.min(r[3]-.06,south+.12)],height:.016});
  // Right of the sofa when facing the window (north in the imported plan).
  const chair:Rect=[west,Math.max(r[1]+.15,north-1.18),west+.88,north-.2];
  const clear=(rect:Rect)=>rect[3]-rect[1]>.7&&[...rectanglePoints(rect),[(rect[0]+rect[2])/2,(rect[1]+rect[3])/2]].every(p=>inPolygon(p[0],p[1],room.polygon));
  if(clear(chair))plan.furniture.push({kind:'armchair',rect:chair,height:.94,facing:'east'});
  // 65-inch 16:9 panel: physical width/height derived from its diagonal.
  const diagonal=65*.0254,width=diagonal*16/Math.hypot(16,9),height=diagonal*9/Math.hypot(16,9);
  const cz=(main.rect[1]+main.rect[3])/2;
  const wall=wallLayout(plan).walls.filter(w=>Math.abs(w[0]-r[2])<.15&&w[1]<=cz-width/2&&w[3]>=cz+width/2).sort((a,b)=>Math.abs(a[0]-r[2])-Math.abs(b[0]-r[2]))[0];
  if(wall)plan.furniture.push({kind:'tv',rect:[wall[0]-.065,cz-width/2,wall[0]-.015,cz+width/2],height,facing:'west'});
  return result;
}
