import type { FloorPlan } from '../data/house.ts';
import { decomposePolygon, subtractRects } from './geometry.ts';
import type { Rect } from './geometry.ts';
import { wallLayout } from './wall-layout.ts';

export type MaterialKind = 'wall'|'floor'|'ceiling'|'wood'|'fabric'|'metal'|'glass'|'cabinet'|'door'|'interiorDoor'|'windowFrame'|'hardware'|'upholstery'|'rug'|'screen';
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
    if(opening.kind==='window'&&opening.balcony) {
      const r=opening.rect,along=r[2]-r[0]>r[3]-r[1]?0:1,across=1-along;
      const width=Math.min(opening.balcony.width,r[along+2]-r[along]-.3);
      const split=opening.balcony.side==='end'?r[along+2]-width:r[along]+width;
      const door=[...r] as Rect,window=[...r] as Rect;
      if(opening.balcony.side==='end'){door[along]=split;window[along+2]=split;}else{door[along+2]=split;window[along]=split;}
      const sill=opening.sill??.85,center=(r[across]+r[across+2])/2;
      add(window,0,sill,'wall');
      for(const [bay,bottom] of [[door,.025],[window,sill]] as [Rect,number][]) {
        const panel=[...bay] as Rect;
        panel[across]=center-.02;panel[across+2]=center+.02;
        panel[along]+=.05;panel[along+2]-=.05;
        add(panel,bottom+.06,top-.06,'glass');
        const frame=[...bay] as Rect;frame[across]=center-.04;frame[across+2]=center+.04;
        add(frame,bottom,bottom+.06,'windowFrame');add(frame,top-.06,top,'windowFrame');
        for(const end of [bay[along],bay[along+2]-.05]) {
          const upright=[...frame] as Rect;upright[along]=end;upright[along+2]=end+.05;
          add(upright,bottom,top,'windowFrame');
        }
      }
      // Closed balcony leaf: full-height glazing, threshold and a dark handle.
      const handle=[...door] as Rect;
      handle[along]=split+(opening.balcony.side==='end'?.06:-.08);handle[along+2]=handle[along]+.02;
      handle[across]=center+.045;handle[across+2]=center+.08;
      add(handle,1,1.14,'hardware',false);
      add(window,sill-.025,sill+.015,'cabinet');
    } else if (opening.kind === 'window') {
      const r=opening.rect,sill=opening.sill??.85;
      add(r,0,sill,'wall');
      const along=r[2]-r[0]>r[3]-r[1]?0:1,across=1-along,center=(r[across]+r[across+2])/2;
      const frame=[...r] as Rect;frame[across]=center-.04;frame[across+2]=center+.04;
      const rail=Math.min(.055,(r[along+2]-r[along])/5,(top-sill)/5);
      add(frame,sill,sill+rail,'windowFrame');add(frame,top-rail,top,'windowFrame');
      for(const end of [r[along],r[along+2]-rail]) {
        const jamb=[...frame] as Rect;jamb[along]=end;jamb[along+2]=end+rail;
        add(jamb,sill,top,'windowFrame');
      }
      const pane=[...frame] as Rect;pane[along]+=rail;pane[along+2]-=rail;
      pane[across]=center-.018;pane[across+2]=center+.018;
      add(pane,sill+rail,top-rail,'glass');
      if(r[along+2]-r[along]>1.2) {
        const mullion=[...frame] as Rect;const mid=(r[along]+r[along+2])/2;
        mullion[along]=mid-.025;mullion[along+2]=mid+.025;
        add(mullion,sill+rail,top-rail,'windowFrame');
      }
      add(r,sill-.035,sill,'cabinet');
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
      if(opening.leaf.angle===180) {
        leaf[along]=hinge==='end'?pivot:pivot-length;
        leaf[along+2]=leaf[along]+length;
        leaf[across]=side===1?wallFace+.008:wallFace-.053;
        leaf[across+2]=leaf[across]+.045;
      }
      add(leaf,.015,top-.025,'interiorDoor');
      // Narrow jambs and a head frame make the open leaf legible as a door.
      for(const end of [r[along],r[along+2]-.025]) {
        const jamb=[...r] as Rect;jamb[along]=end;jamb[along+2]=end+.025;
        add(jamb,0,top,'cabinet');
      }
      add(r,top-.025,top,'cabinet');
      const handle=[...leaf] as Rect;
      const handleAxis=opening.leaf.angle===180?along:across,normal=1-handleAxis;
      const positiveTip=opening.leaf.angle===180?hinge==='end':side===1;
      const tip=positiveTip?leaf[handleAxis+2]-.12:leaf[handleAxis]+.12;
      handle[handleAxis]=tip-.055;handle[handleAxis+2]=tip+.055;
      handle[normal]-=.025;handle[normal+2]+=.025;
      add(handle,1.01,1.035,'hardware',false);
    }
  }
  for(const support of plan.supports??[])add(support.rect,support.bottom,support.top,'metal');
  for (const f of plan.furniture) {
    const [x0,z0,x1,z1] = f.rect;
    if(f.kind==='rug') {
      add(f.rect,.004,f.height,'rug',false);
    } else if(f.kind==='tv') {
      const bottom=1.03;
      add(f.rect,bottom,bottom+f.height,'hardware');
      const screen:Rect=[x0-.002,z0+.012,x0+.002,z1-.012];
      add(screen,bottom+.012,bottom+f.height-.012,'screen',false);
    } else if(f.kind==='armchair'||(f.kind==='sofa'&&f.facing==='east')) {
      const material='upholstery';
      add(f.rect,.12,Math.min(.39,f.height),material);
      if(f.height>.5) {
        add([x0,z0,x0+.18,z1],.34,f.height,material);
        add([x0,z0,x1,z0+.12],.25,.62,material);
        add([x0,z1-.12,x1,z1],.25,.62,material);
      }
      const count=f.kind==='armchair'?1:Math.max(1,Math.round((z1-z0)/.75));
      for(let i=0;i<count;i++) {
        const za=z0+.13+(z1-z0-.26)*i/count,zb=z0+.13+(z1-z0-.26)*(i+1)/count;
        add([x0+.19,za+.008,x1-.02,zb-.008],.39,.47,material);
      }
    } else if (f.kind === 'table') {
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
