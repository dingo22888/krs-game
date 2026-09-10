import type {FloorId,FloorPlan,Furniture,Room} from '../data/house.ts';
import {inPolygon,rectanglePoints} from './geometry.ts';
import type {Rect} from './geometry.ts';
import {wallLayout} from './wall-layout.ts';

const bounds=(room:Room):Rect=>[Math.min(...room.polygon.map(p=>p[0])),Math.min(...room.polygon.map(p=>p[1])),Math.max(...room.polygon.map(p=>p[0])),Math.max(...room.polygon.map(p=>p[1]))];
const inside=(f:Furniture,r:Room)=>inPolygon((f.rect[0]+f.rect[2])/2,(f.rect[1]+f.rect[3])/2,r.polygon);

/** Photo-based room recipes, placed relative to the privately loaded model.
 * The source file is left intact. Replacement makes saved models repeatable. */
export function prepareUpperInteriors(input:Record<FloorId,FloorPlan>):Record<FloorId,FloorPlan> {
  const result=structuredClone(input),plan=result.og;
  const bath=plan.rooms.find(r=>/^bad$/i.test(r.name));
  if(bath) {
    const [west,north,east,south]=bounds(bath);
    const outer=Math.max(...plan.footprint.map(p=>p[0]));
    const windows=plan.openings.filter(o=>o.kind==='window'&&Math.abs(o.rect[0]-east)<.25&&o.rect[1]>=north-.05&&o.rect[3]<=south+.05).sort((a,b)=>a.rect[1]-b.rect[1]);
    if(windows.length===2&&outer-east>.1&&outer-east<.65&&east-west>2&&south-north>2) {
      // The import omitted the masonry between the two windows. Rebuild the
      // complete confirmed exterior strip; wallLayout cuts ONLY the windows.
      const strip=rectanglePoints([east,north-.06,outer,south+.06]);
      if(!plan.walls.some(w=>JSON.stringify(w)===JSON.stringify(strip)))plan.walls.push(strip);
      const start=north+.12,end=south-.4,pier=.24,width=(end-start-pier)/2;
      windows.forEach((o,i)=>{o.rect=[east,start+i*(width+pier),outer,start+i*(width+pier)+width];o.sill=1.02;o.top=2.08;o.frame='white';});
      const roof=plan.roofs?.find(r=>r.axis==='x'&&r.startHeight>r.endHeight&&r.rect[2]>=east);
      if(roof?.cutouts)for(const cutout of roof.cutouts)if(cutout[1]<north&&cutout[3]>=north)cutout[3]=end+.04;
      bath.surface='stone';
      plan.furniture=plan.furniture.filter(f=>!inside(f,bath));
      const add=(kind:Furniture['kind'],rect:Rect,height:number,facing:Furniture['facing']='south',bottom?:number)=>plan.furniture.push({kind,rect,height,facing,...(bottom===undefined?{}:{bottom})});
      add('bathtub',[east-1.9,north+.025,east-.035,north+.77],.59);
      add('tilePanel',[east-1.94,north+.008,east-.02,north+.024],2.2);
      add('ledge',[east-.24,north+.78,east-.015,south-.05],.8,'west');
      add('radiator',[east-.35,north+.91,east-.25,north+1.65],.63,'west',.12);
      add('toilet',[east-1.05,south-.7,east-.65,south-.025],.45,'north');
      add('vanity',[west+.10,south-.43,west+1.05,south-.025],.85,'north');
      add('mirror',[west+.22,south-.045,west+.94,south-.02],.72,'north',1.13);
    }
  }
  const bedroom=plan.rooms.find(r=>/^(schlafen|schlafzimmer)$/i.test(r.name));
  if(bedroom&&plan.furniture.some(f=>f.kind==='bed'&&inside(f,bedroom))) {
    const [west,north,east,south]=bounds(bedroom),layout=wallLayout(plan);
    if(east-west<3.4||south-north<3.6)return result;
    const wall=layout.walls.filter(w=>Math.abs(w[0]-east)<.2&&w[1]<north+1&&w[3]>north+2).sort((a,b)=>a[0]-b[0])[0];
    const head=(wall?.[0]??east)-.10,cz=north+(south-north)*.51;
    bedroom.surface='carpet';
    plan.furniture=plan.furniture.filter(f=>!inside(f,bedroom));
    const add=(kind:Furniture['kind'],rect:Rect,height:number,facing:Furniture['facing'],bottom?:number)=>plan.furniture.push({kind,rect,height,facing,...(bottom===undefined?{}:{bottom})});
    add('bed',[head-2.05,cz-.90,head,cz+.90],.62,'west');
    for(const z of [cz-1.47,cz+.94])add('nightstand',[head-.50,z,head,z+.50],.55,'west');
    add('wardrobe',[west+.035,north+.08,west+.62,north+1.38],2.12,'east');
    add('dresser',[west+.035,north+1.47,west+.47,north+2.21],1.08,'east');
    add('tv',[west+.035,north+1.4,west+.09,north+2.30],.51,'east',1.27);
    add('dresser',[west+.87,south-.45,west+2.10,south-.035],.8,'north');
    const northWindow=plan.openings.find(o=>o.kind==='window'&&o.rect[0]>west&&o.rect[2]<east&&Math.abs(o.rect[3]-north)<.15);
    if(northWindow)add('radiator',[northWindow.rect[0]+.04,north+.025,northWindow.rect[2]-.04,north+.13],.62,'south',.12);
  }
  return result;
}
