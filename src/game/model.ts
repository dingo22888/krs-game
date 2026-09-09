import type { FloorPlan } from '../data/house.ts';
import { decomposePolygon, subtractRects } from './geometry.ts';
import type { Rect } from './geometry.ts';
import { wallLayout } from './wall-layout.ts';

export type MaterialKind = 'wall'|'floor'|'ceiling'|'wood'|'fabric'|'metal'|'glass'|'cabinet'|'door';
export interface BoxSpec {
  position:[number,number,number];
  size:[number,number,number];
  material:MaterialKind;
  collision:boolean;
}

/** One geometry description drives the visible model AND the collision world. */
export function buildModel(plan:FloorPlan,slabThickness=.18):BoxSpec[] {
  const boxes:BoxSpec[] = [];
  const add = (r:Rect,bottom:number,top:number,material:MaterialKind,collision=true) => {
    const [x0,z0,x1,z1] = r;
    if (x1-x0 < .0001 || z1-z0 < .0001 || top-bottom < .0001) return;
    boxes.push({position:[(x0+x1)/2,(bottom+top)/2,(z0+z1)/2],size:[x1-x0,top-bottom,z1-z0],material,collision});
  };
  const slabs=decomposePolygon(plan.footprint);
  for (const rect of subtractRects(slabs,plan.floorHoles??[])) add(rect,-slabThickness,0,'floor');
  for (const rect of subtractRects(slabs,plan.ceilingHoles??[])) add(rect,plan.height,plan.height+.02,'ceiling');
  const layout = wallLayout(plan);
  for (const rect of layout.walls) add(rect,0,plan.height,'wall');
  for (const opening of layout.openings) {
    const top = Math.min(opening.top ?? 2.1,plan.height);
    add(opening.rect,top,plan.height,'wall');
    if (opening.kind === 'window') {
      add(opening.rect,0,opening.sill ?? .85,'wall');
      const [x0,z0,x1,z1] = opening.rect;
      const horizontal = x1-x0 > z1-z0;
      const glassRect:Rect = horizontal ? [x0,(z0+z1)/2-.018,x1,(z0+z1)/2+.018] : [(x0+x1)/2-.018,z0,(x0+x1)/2+.018,z1];
      add(glassRect,opening.sill ?? .85,top,'glass');
      // Frames remain inside the visible opening; glass is a solid barrier.
      if (horizontal) {
        add([x0,z0,x0+.035,z1],opening.sill ?? .85,top,'cabinet');
        add([x1-.035,z0,x1,z1],opening.sill ?? .85,top,'cabinet');
      } else {
        add([x0,z0,x1,z0+.035],opening.sill ?? .85,top,'cabinet');
        add([x0,z1-.035,x1,z1],opening.sill ?? .85,top,'cabinet');
      }
      add(opening.rect,(opening.sill ?? .85)-.035,(opening.sill ?? .85)+.015,'cabinet');
    } else if (opening.kind === 'door') add(opening.rect,0,top,'door');
    else if(opening.leaf) {
      const r=opening.rect,along=r[2]-r[0]>r[3]-r[1]?0:1,across=1-along;
      const {side,hinge}=opening.leaf;
      const length=r[along+2]-r[along]-.04;
      const pivot=r[along+(hinge==='end'?2:0)],wallFace=r[across+(side===1?2:0)];
      const leaf=[...r] as Rect;
      leaf[along]=hinge==='end'?pivot-.045:pivot;
      leaf[along+2]=leaf[along]+.045;
      leaf[across]=side===1?wallFace:wallFace-length;
      leaf[across+2]=side===1?wallFace+length:wallFace;
      add(leaf,.015,top-.025,'door');
      // Narrow jambs and a head frame make the open leaf legible as a door.
      for(const end of [r[along],r[along+2]-.025]) {
        const jamb=[...r] as Rect;jamb[along]=end;jamb[along+2]=end+.025;
        add(jamb,0,top,'cabinet');
      }
      add(r,top-.025,top,'cabinet');
      const handle=[...leaf] as Rect;
      const tip=side===1?leaf[across+2]-.12:leaf[across]+.12;
      handle[across]=tip-.055;handle[across+2]=tip+.055;
      handle[along]-=.025;handle[along+2]+=.025;
      add(handle,1.01,1.035,'metal',false);
    }
  }
  for(const support of plan.supports??[])add(support.rect,support.bottom,support.top,'metal');
  for (const f of plan.furniture) {
    const [x0,z0,x1,z1] = f.rect;
    if (f.kind === 'table') {
      add(f.rect,f.height-.06,f.height,'wood');
      const leg = .065, inset = .09;
      for (const x of [x0+inset,x1-inset-leg]) for (const z of [z0+inset,z1-inset-leg]) add([x,z,x+leg,z+leg],0,f.height-.06,'metal');
    } else if(f.kind==='chair') {
      add(f.rect,.43,.48,'fabric');
      const back:Rect=f.facing==='east'?[x0,z0,x0+.055,z1]:f.facing==='west'?[x1-.055,z0,x1,z1]:f.facing==='south'?[x0,z0,x1,z0+.055]:[x0,z1-.055,x1,z1];
      add(back,.48,f.height,'fabric');
      for(const x of [x0+.035,x1-.075])for(const z of [z0+.035,z1-.075])add([x,z,x+.04,z+.04],0,.43,'wood');
    } else if (f.kind === 'bed') {
      add(f.rect,.08,f.height-.13,'wood');
      add([x0+.025,z0+.025,x1-.025,z1-.025],f.height-.13,f.height,'fabric');
      add([x0,z0,x1,z0+.07],.05,.88,'wood');
    } else if (f.kind === 'sofa') {
      add(f.rect,.08,Math.min(.43,f.height),'fabric');
      add([x0,z0,x0+.14,z1],.15,f.height,'fabric');
      add([x0,z0,x1,z0+.12],.15,Math.min(.58,f.height),'fabric');
      add([x0,z1-.12,x1,z1],.15,Math.min(.58,f.height),'fabric');
    } else {
      add(f.rect,.04,f.height-.04,f.kind === 'counter' ? 'cabinet' : 'wood');
      add(f.rect,f.height-.04,f.height,f.kind === 'counter' ? 'floor' : 'wood');
      if(f.kind==='counter'&&f.facing) {
        const along=f.facing==='east'||f.facing==='west'?1:0,across=1-along;
        const side=f.facing==='east'||f.facing==='south'?1:-1;
        const face=f.rect[across+(side===1?2:0)],length=f.rect[along+2]-f.rect[along];
        const count=Math.max(1,Math.round(length/.6)),width=length/count;
        for(let i=0;i<count;i++) {
          const panel=[...f.rect] as Rect;
          panel[along]=f.rect[along]+i*width+.008;panel[along+2]=f.rect[along]+(i+1)*width-.008;
          panel[across]=side===1?face:face-.018;panel[across+2]=side===1?face+.018:face;
          add(panel,.12,f.height-.07,'cabinet');
          const handle=[...panel] as Rect,center=(panel[along]+panel[along+2])/2;
          handle[along]=center-.07;handle[along+2]=center+.07;
          handle[across]+=side*.025;handle[across+2]+=side*.025;
          const h=f.height>1.5?1.1:f.height-.15;
          add(handle,h,h+.018,'metal',false);
        }
      }
    }
  }
  return boxes;
}
