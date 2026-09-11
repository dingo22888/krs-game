import type {Furniture,Opening} from '../data/house.ts';
import type {Rect} from './geometry.ts';

/** Cabinet widths and clearances are fitted to the loaded inner wall faces.
 * The recipe contains no private room coordinates or countertop clutter. */
export function fitKitchen(room:Rect,entryEnd:number,diningDoorStart:number,ceiling:number,openings:Opening[]):Furniture[] {
  const [west,north,east,south]=room,result:Furniture[]=[];
  const add=(kind:Furniture['kind'],rect:Rect,height:number,facing:Furniture['facing']='south',bottom?:number,kitchen?:Furniture['kitchen'])=>result.push({kind,rect,height,facing,...(bottom===undefined?{}:{bottom}),...(kitchen?{kitchen}:{})});
  const counter=(rect:Rect,height:number,facing:Furniture['facing'],kitchen:Furniture['kitchen'])=>add('counter',rect,height,facing,undefined,kitchen);
  // Work backwards from the corner: two 60 cm base units and two tall units.
  // The remaining northern bay is the approximately 1 m wide pantry.
  const runEnd=south-.6,tallEnd=runEnd-1.2,tallStart=tallEnd-1.2;
  add('pantryDoor',[east-.6,north,east,tallStart],ceiling,'west');
  counter([east-.6,tallStart,east,tallStart+.6],2.2,'west','fridge');
  counter([east-.6,tallStart+.6,east,tallEnd],2.2,'west','oven');
  for(let i=0;i<2;i++)counter([east-.6,tallEnd+i*.6,east,tallEnd+(i+1)*.6],.92,'west','drawers');
  counter([east-.6,runEnd,east,south],.92,'west','corner');
  const returnEnd=east-.6,returnStart=returnEnd-1.8;
  if(returnStart<entryEnd)throw new Error('Die drei 60-cm-Küchenschränke passen nicht neben den Eingang.');
  counter([returnStart,south-.6,returnStart+.6,south],.92,'north','drawers');
  counter([returnStart+.6,south-.6,returnStart+1.2,south],.92,'north','dishwasher');
  counter([returnStart+1.2,south-.6,returnEnd,south],.92,'north','sink');
  add('kitchenSplash',[returnStart,south-.018,east-.6,south],.65,'north',.92);
  // Stop the east backsplash below the existing window sill.
  const eastWindow=openings.find(o=>o.kind==='window'&&Math.abs(o.rect[0]-east)<.15&&o.rect[1]>north&&o.rect[3]<=south+.05);
  if(eastWindow){
    const sill=eastWindow.sill??1;
    if(sill>.94)add('kitchenSplash',[east-.018,eastWindow.rect[1],east,south],sill-.92,'west',.92);
  }
  const end=diningDoorStart-.25,length=Math.min(2.15,east-west-1.6);
  counter([west,end-.95,west+length,end],.92,'north','hob');
  for(const t of [.28,.76]){
    const x=west+length*t,z=end+.26;
    add('barstool',[x-.24,z-.24,x+.24,z+.24],1.02,'north');
  }
  add('kitchenPendant',[west+.22,end-.66,west+length-.18,end-.35],ceiling-1.52,'south',1.52);
  const northWindow=openings.find(o=>o.kind==='window'&&Math.abs(o.rect[3]-north)<.15&&o.rect[0]>=west&&o.rect[2]<=east);
  if(northWindow){
    const r=northWindow.rect;
    add('radiator',[r[0]+.06,north+.015,r[2]-.06,north+.12],.6,'south',.13);
    add('windowBlind',[r[0]+.06,north+.008,r[2]-.06,north+.018],.55,'south',(northWindow.top??2.1)-.57);

  }
  add('wallClock',[east-.035,tallEnd+.18,east-.012,tallEnd+.47],.29,'west',1.86);
  for(const x of [west+.32,east-.85])for(const z of [north+.38,(north+south)/2,south-.35])add('ceilingSpot',[x-.045,z-.045,x+.045,z+.045],.025,'south',ceiling-.025);
  return result;
}
