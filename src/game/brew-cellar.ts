import type {FloorId,FloorPlan,Furniture} from '../data/house.ts';
import {inPolygon,type Rect} from './geometry.ts';
import {studioFrame} from './studio.ts';
import type {BoxSpec,MaterialKind} from './model.ts';

/** Furniture dimensions only. Absolute positions come from the private room. */
export function prepareBrewCellar(input:Record<FloorId,FloorPlan>){
 const room=input.kg.rooms.find(r=>/^braukeller$/i.test(r.name));
 if(!room)return input;
 const xs=room.polygon.map(p=>p[0]),zs=room.polygon.map(p=>p[1]);
 const west=Math.min(...xs),north=Math.min(...zs),east=Math.max(...xs),south=Math.max(...zs);
 const width=east-west,depth=south-north;
 if(width<3.6||depth<3.6)return input;
 const result=structuredClone(input),plan=result.kg;
 plan.furniture=plan.furniture.filter(f=>!inPolygon((f.rect[0]+f.rect[2])/2,(f.rect[1]+f.rect[3])/2,room.polygon));
 const add=(kind:Furniture['kind'],rect:Rect,height:number,facing:Furniture['facing']='south',bottom=0)=>plan.furniture.push({kind,rect,height,facing,bottom});
 // West: receiver niche behind the fridge, worktop, then a utility rack.
 add('brewReceiver',[west+.05,north+.06,west+.57,north+.42],.65,'east');
 add('brewFridge',[west+.03,north+.48,west+.63,north+1.08],1.90,'east');
 add('brewCabinet',[west+.03,north+1.08,west+.63,south-1.03],.91,'east');
 add('brewRack',[west+.035,south-.96,west+.58,south-.05],1.86,'east');
 // Bar is parallel to the kitchen; its raised customer side faces east.
 const bx=west+1.55,bz=north+.10,length=Math.min(1.72,depth-2.05);
 add('brewBar',[bx,bz,bx+.83,bz+length],1.10,'east');
 for(const z of [bz+.42,bz+length-.36])add('barstool',[bx+1.0,z-.23,bx+1.46,z+.23],1.02,'west');
 // An L-shaped upholstered bench at the south/east corner; two loose chairs.
 add('brewBench',[east-1.95,south-.49,east-.04,south-.025],1.04,'north');
 add('brewBench',[east-.49,south-1.47,east-.025,south-.50],1.04,'west');
 add('brewTable',[east-1.83,south-1.30,east-.61,south-.62],.74);
 add('brewChair',[east-2.34,south-1.25,east-1.92,south-.81],.99,'east');
 add('brewChair',[east-1.47,south-1.80,east-1.05,south-1.36],.99,'south');
 add('brewPanel',[west+.02,south-.02,east-.02,south-.004],Math.min(2.22,plan.height-.08),'north');
 add('brewShelves',[west+.88,north+.025,west+2.30,north+.26],.74,'south',1.28);
 add('tv',[east-1.17,north+.012,east-.27,north+.065],.51,'south',1.57);
 add('brewSign',[west+.90,north+.04,west+1.57,north+.08],.30,'south',.83);
 for(const z of [bz+.40,bz+length-.32])add('brewPendant',[bx+.30,z-.15,bx+.60,z+.15],plan.height-1.69,'south',1.69);
 return result;
}

export function brewDetails(f:Furniture):BoxSpec[]|undefined{
 if(!f.kind.startsWith('brew'))return;
 const {w,d,point}=studioFrame(f),h=f.height,b=f.bottom??0,out:BoxSpec[]=[];
 const add=(u:number,v:number,uw:number,dv:number,y:number,hh:number,material:MaterialKind,collision=true,shape?:BoxSpec['shape'])=>{
  if(uw<=0||dv<=0||hh<=0)return;const a=point(u,v),c=point(u+uw,v+dv);
  out.push({position:[(a[0]+c[0])/2,b+y+hh/2,(a[1]+c[1])/2],size:[Math.abs(c[0]-a[0]),hh,Math.abs(c[1]-a[1])],material,collision,...(shape?{shape}:{})});
 };
 const cyl=(u:number,v:number,r:number,y:number,hh:number,mat:MaterialKind,collision=false)=>add(u-r,v-r,r*2,r*2,y,hh,mat,collision,'ovalY');
 const knob=(u:number,y:number)=>add(u-.08,d+.018,.16,.025,y,.028,'brewWood',false);
 const keg=(u:number,v:number,y:number,r=.13)=>{
  cyl(u,v,r,y,.35,'steel');for(const yy of [y,y+.31])cyl(u,v,r+.008,yy,.04,'hardware');
  cyl(u,v,.035,y+.35,.018,'steel');
 };
 const bucket=(u:number,v:number,y:number)=>{
  cyl(u,v,.145,y,.30,'cabinet');cyl(u,v,.157,y+.30,.024,'cabinet');
  add(u-.025,v+.12,.05,.05,y+.04,.03,'cabinet',false);
 };
 if(f.kind==='brewFridge'||f.kind==='brewCabinet'){
  add(.01,.01,w-.02,d-.02,.08,h-.08,'brewWood');
  const fridge=f.kind==='brewFridge',count=fridge?1:Math.max(1,Math.round(w/.6)),top=fridge?h:h-.036;
  for(let i=0;i<count;i++){
   const u=i*w/count,ww=w/count;
   for(const [y,hh] of (fridge?[[.10,.56],[.674,top-.69]]:[[.10,top-.30],[top-.19,.17]])){
    add(u+.009,d-.018,ww-.018,.032,y,hh,'cabinet');knob(u+ww*.72,y+hh-.065);
   }
  }
  if(!fridge){
   add(-.007,0,w+.014,d+.028,h-.036,.036,'brewWood');
   // Black mash kettle and a white fermenter, neatly stowed on the worktop.
   cyl(w*.27,d*.49,.20,h,.34,'hardware',true);cyl(w*.27,d*.49,.19,h+.34,.025,'steel');
   cyl(w*.27,d*.49,.043,h+.365,.035,'hardware');
   for(const u of [w*.27-.24,w*.27+.2])add(u,d*.49-.045,.04,.09,h+.21,.05,'hardware',false);
   if(w>1.0)bucket(w*.77,d*.48,h);
   // Shallow extraction hood above the kettle.
   add(w*.27-.28,.015,.56,.37,1.72,.10,'cabinet');add(w*.27-.22,.02,.44,.24,1.70,.02,'steel',false);
  }
 }else if(f.kind==='brewBar'){
  // Low kitchen units behind the raised wooden bar, no solid slab in the sink.
  add(.015,.015,w-.03,.57,.09,.65,'cabinet');
  for(let i=0;i<3;i++){
   add(i*w/3+.015,-.015,w/3-.03,.03,.12,.69,'cabinet');
   add(i*w/3+.09,-.045,.18,.03,.73,.025,'brewWood',false);
  }
  const sinkU=w*.38,sw=.43,sv=.10,sd=.34,y=.89;
  add(0,0,sinkU-sw/2,.62,y,.035,'brewWood');add(sinkU+sw/2,0,w-sinkU-sw/2,.62,y,.035,'brewWood');
  add(sinkU-sw/2,0,sw,sv,y,.035,'brewWood');add(sinkU-sw/2,sv+sd,sw,.62-sv-sd,y,.035,'brewWood');
  add(sinkU-sw/2,sv,sw,sd,.76,.012,'steel');
  for(const v of [sv,sv+sd-.012])add(sinkU-sw/2,v,sw,.012,.76,.15,'steel');
  for(const u of [sinkU-sw/2,sinkU+sw/2-.012])add(u,sv,.012,sd,.76,.15,'steel');
  cyl(sinkU,.49,.016,.91,.22,'steel');add(sinkU-.016,.32,.032,.18,1.10,.03,'steel',false);
  // Tap on the right of the sink from the working side, plus a drip tray.
  const tap=w*.78;cyl(tap,.24,.038,.925,.25,'steel');
  add(tap-.035,.10,.07,.16,1.12,.045,'steel',false);cyl(tap,.20,.018,1.16,.12,'hardware');
  add(tap-.14,.015,.28,.15,.926,.015,'steel',false);
  for(let i=0;i<6;i++)add(tap-.12+i*.045,.035,.012,.1,.942,.002,'hardware',false);
  add(0,.60,w,.045,.03,1.0,'brewWood');
  for(const u of [.045,w-.09])add(u,.62,.045,.05,.05,h-.05,'brewWood');
  add(-.015,.56,w+.03,d-.53,h-.05,.05,'brewWood');
  add(.07,d-.045,w-.14,.03,.18,.025,'steel',false);
 }else if(f.kind==='brewRack'){
  for(const u of [0,w-.035])for(const v of [0,d-.035])add(u,v,.035,.035,0,h,'steel');
  for(const y of [.08,.52,1.0,1.48])add(0,0,w,d,y,.028,'wood');
  keg(w*.26,d*.53,.11);keg(w*.27,d*.53,.11);
  keg(w*.28,d*.52,.55);bucket(w*.74,d*.52,.55);
  bucket(w*.25,d*.52,1.03);
  add(w*.52,.08,w*.4,d-.13,1.03,.29,'metal',false);
  cyl(w*.37,d*.52,.17,1.51,.19,'steel');cyl(w*.37,d*.52,.12,1.70,.015,'steel');
 }else if(f.kind==='brewBench'||f.kind==='brewChair'){
  for(const u of [.035,w-.065])for(const v of [.035,d-.065]){
   cyl(u+.015,v+.015,.022,.02,v<.1?h-.04:.42,'brewWood',true);
  }
  add(0,.015,w,d-.03,.36,.045,'brewWood');add(.016,.03,w-.032,d-.06,.405,.07,'brewFabric');
  add(.014,.015,w-.028,.055,.47,h-.50,'brewWood');add(.035,.071,w-.07,.033,.50,h-.56,'brewFabric');
  add(0,.006,w,.073,h-.05,.04,'brewWood');
  if(f.kind==='brewBench')for(let u=.6;u<w;u+=.6)add(u,.074,.012,.035,.50,h-.57,'brewWood',false);
 }else if(f.kind==='brewPanel'){
  add(0,0,w,d,0,h,'brewWood',false);
  for(let u=.20;u<w;u+=.20)add(u,d,.006,.002,0,h,'wood',false);
  // Two rows of sleeves and actual vinyl discs on the south wood panelling.
  const count=Math.max(1,Math.floor((w-.2)/.42));
  for(let row=0;row<2;row++)for(let i=0;i<count;i++){
   const u=.10+i*.42,y=1.19+row*.43;
   if(y+.34>h)continue;
   if((i+row)%3===0){
    const shape=f.facing==='east'||f.facing==='west'?'ovalX':'ovalZ';
    add(u,d+.006,.32,.008,y,.32,'hardware',false,shape);
    add(u+.12,d+.015,.08,.004,y+.12,.08,row?'copper':'cabinet',false,shape);
   }else{
    add(u,d+.006,.33,.014,y,.33,'hardware',false);
    add(u+.008,d+.021,.314,.003,y+.008,.314,'brewAlbum',false);
   }
  }
 }else if(f.kind==='brewShelves'){
  for(const u of [.03,w-.08])add(u,0,.05,.04,0,h,'brewWood',false);
  for(const yy of [.02,.38]){
   add(0,0,w,d,yy,.04,'brewWood',false);
   for(let i=0;i<9;i++){
    const u=.09+i*(w-.18)/8,r=.025+(i%3)*.005,base=yy+.04;
    cyl(u,d*.55,r,base,.16+(i%3)*.024,i%2?'leaf':'brewWood');
    cyl(u,d*.55,r*.4,base+.17+(i%3)*.024,.06,'hardware');
    add(u-r,d*.55+r,r*2,.003,base+.05,.07,'linen',false);
   }
  }
 }else if(f.kind==='brewTable'){
  add(0,0,w,d,h-.045,.045,'brewWood');
  for(const u of [.10,w-.10])for(const v of [.10,d-.10]){
   cyl(u,v,.043,.02,h-.065,'brewWood',true);
   for(const y of [.10,.20,.48])cyl(u,v,.052,y,.055,'brewWood');
  }
  add(.06,.06,w-.12,.045,h-.14,.095,'brewWood');add(.06,d-.105,w-.12,.045,h-.14,.095,'brewWood');
 }else if(f.kind==='brewPendant'){
  cyl(w/2,d/2,.052,h-.045,.045,'hardware');cyl(w/2,d/2,.009,.20,h-.23,'hardware');
  cyl(w/2,d/2,.033,.145,.055,'copper');
  add(0,0,w,d,.015,.14,'hardware',false,'shade');
  cyl(w/2,d/2,w*.43,.015,.008,'copper');cyl(w/2,d/2,.026,0,.045,'lampGlow');
 }else if(f.kind==='brewReceiver'){
  add(0,0,w,d,.02,.46,'brewWood');add(.025,.01,w-.05,d-.03,.48,.14,'hardware');
  add(.08,d-.012,w*.43,.02,.51,.07,'screen',false);knob(w*.80,.54);
  for(let i=0;i<8;i++)add(.04+i*.05,.03,.015,d-.09,.621,.002,'steel',false);
 }else if(f.kind==='brewSign')add(0,0,w,d,0,h,'hardware',false);
 return out;
}
