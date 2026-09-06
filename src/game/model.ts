import type { FloorPlan } from '../data/house.ts';
import { decomposePolygon } from './geometry.ts';
import type { Rect } from './geometry.ts';

export type MaterialKind = 'wall'|'floor'|'ceiling'|'wood'|'fabric'|'metal'|'glass'|'cabinet'|'door';
export interface BoxSpec {
  position:[number,number,number];
  size:[number,number,number];
  material:MaterialKind;
  collision:boolean;
}

/** One geometry description drives the visible model AND the collision world. */
export function buildModel(plan:FloorPlan):BoxSpec[] {
  const boxes:BoxSpec[] = [];
  const add = (r:Rect,bottom:number,top:number,material:MaterialKind,collision=true) => {
    const [x0,z0,x1,z1] = r;
    if (x1-x0 < .0001 || z1-z0 < .0001 || top-bottom < .0001) return;
    boxes.push({position:[(x0+x1)/2,(bottom+top)/2,(z0+z1)/2],size:[x1-x0,top-bottom,z1-z0],material,collision});
  };
  for (const rect of decomposePolygon(plan.footprint)) {
    add(rect,-.18,0,'floor');
    add(rect,plan.height,plan.height+.15,'ceiling');
  }
  for (const poly of plan.walls) for (const rect of decomposePolygon(poly)) add(rect,0,plan.height,'wall');
  for (const opening of plan.openings) {
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
  }
  for (const f of plan.furniture) {
    const [x0,z0,x1,z1] = f.rect;
    if (f.kind === 'table') {
      add(f.rect,f.height-.06,f.height,'wood');
      const leg = .065, inset = .09;
      for (const x of [x0+inset,x1-inset-leg]) for (const z of [z0+inset,z1-inset-leg]) add([x,z,x+leg,z+leg],0,f.height-.06,'metal');
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
    }
  }
  return boxes;
}
