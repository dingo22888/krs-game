import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import type {FloorPlan} from '../src/data/house.ts';
import {buildBuilding,addBuildingColliders,climbRegions,floorAtPosition,localPosition} from '../src/game/building.ts';
import {subtractRects,rectanglePoints} from '../src/game/geometry.ts';
import {Player,idleInput,PLAYER} from '../src/game/player.ts';

before(async()=>{await RAPIER.init();});
function levels():FloorPlan[] {
  return ['kg','eg'].map((id,i)=>({id:id as 'kg'|'eg',name:'Synthetic fixture',height:2.8,elevation:i*3,
    footprint:rectanglePoints([0,0,10,10]),walls:[],rooms:[],openings:[],furniture:[],stairZones:[],
    floorHoles:[],ceilingHoles:[],spawn:{x:1.4,z:3.7,yaw:-Math.PI/2}}));
}
function fixture(plans:FloorPlan[]) {
  const world=new RAPIER.World({x:0,y:-18,z:0});addBuildingColliders(world,buildBuilding(plans));return world;
}
function settle(p:Player){for(let i=0;i<60;i++)p.step(idleInput(),0);}
function move(p:Player,x:number,z:number) {
  let best=Infinity,stalled=0;
  for(let i=0;i<1800;i++) {
    const pos=p.body.translation(),dx=x-pos.x,dz=z-pos.z,d=Math.hypot(dx,dz);
    if(d<.1){p.stop();return;}
    if(d<best-.001){best=d;stalled=0;}else stalled++;
    assert.ok(stalled<150,`stuck at ${JSON.stringify(pos)} approaching ${x},${z}`);
    p.step({...idleInput(),forward:Math.min(1,d*3)},Math.atan2(-dx,-dz));
  }
  assert.fail('walking route timed out');
}

test('slab subtraction cuts overlapping openings once and preserves the remaining area',()=>{
  const parts=subtractRects([[0,0,6,5]],[[1,1,3,4],[2,2,4,3]]);
  assert.equal(parts.reduce((sum,[x,z,X,Z])=>sum+(X-x)*(Z-z),0),23);
});

test('a connected staircase is walkable up and down through the ceiling and floor openings',()=>{
  const plans=levels();
  plans[0].ceilingHoles=[[1.7,3,8,4.4]];plans[1].floorHoles=[[1.7,3,8,4.4]];
  plans[0].stairs=[{to:'eg',steps:Array.from({length:18},(_,i)=>({
    polygon:rectanglePoints([2+i/3,3,2+(i+1)/3,4.4]),top:(i+1)/6,
    walkHeights:[i/6,(i+1)/6,(i+1)/6,i/6],
  }))}];
  for(const descending of [false,true]) {
    const w=fixture(plans),p=new Player(w,descending?8.5:1.4,3.7,descending?3:0);settle(p);
    move(p,descending?1.4:8.5,3.7);settle(p);
    assert.ok(Math.abs(p.body.translation().y-(descending?0:3))<.04);
    assert.equal(floorAtPosition(plans,p.body.translation(),descending?'eg':'kg',p.grounded),descending?'kg':'eg');
    w.free();
  }
});

test('a spiral can be walked in both directions without jumping or dropping through the flight',()=>{
  const plans=levels(),cx=5,cz=5,r=.85,n=18;
  const hole:[number,number,number,number]=[cx-.9,cz-.9,cx+.9,cz+.9];
  plans[0].ceilingHoles=[hole];plans[1].floorHoles=[hole];
  plans[0].stairs=[{to:'eg',maxSlope:82,steps:Array.from({length:n},(_,i)=>{
    const a=(110+320*i/n)*Math.PI/180,b=(110+320*(i+1)/n)*Math.PI/180;
    const point=(radius:number,angle:number):[number,number]=>[cx+radius*Math.cos(angle),cz+radius*Math.sin(angle)];
    return {polygon:[point(.05,a),point(r,a),point(r,b),point(.05,b)],top:3*(i+1)/n,walkHeights:[3*i/n,3*i/n,3*(i+1)/n,3*(i+1)/n]};
  })}];
  const route:[[number,number]]=[[cx+.58*Math.cos(110*Math.PI/180),cz+1.2]];
  for(let i=0;i<=64;i++){const a=(110+320*i/64)*Math.PI/180;route.push([cx+.58*Math.cos(a),cz+.58*Math.sin(a)]);}
  route.push([cx+.58*Math.cos(430*Math.PI/180),cz+1.2]);
  for(const descending of [false,true]) {
    const points=descending?[...route].reverse():route;
    const w=fixture(plans),p=new Player(w,...points[0],descending?3:0,climbRegions(plans));settle(p);
    let previous=p.body.translation().y;
    for(const point of points.slice(1)) {
      move(p,...point);const y=p.body.translation().y;
      assert.ok(Math.abs(y-previous)<.45,'skipped or fell through a section of the flight');previous=y;
    }
    settle(p);assert.ok(Math.abs(p.body.translation().y-(descending?0:3))<.04);w.free();
  }
});

test('sloping roof has solid headroom and prevents standing up underneath it',()=>{
  const plan=levels()[0];plan.roofs=[{rect:[0,0,3,10],axis:'x',startHeight:.8,endHeight:2.8}];
  const w=fixture([plan]),p=new Player(w,4,5);settle(p);
  for(let i=0;i<240;i++)p.step({...idleInput(),right:-1},0);
  const standingX=p.body.translation().x;
  for(let i=0;i<240;i++)p.step({...idleInput(),right:-1,crouch:true},0);
  assert.ok(p.body.translation().x<standingX-.6);
  settle(p);assert.equal(p.height,PLAYER.crouchingHeight);
  for(let i=0;i<360;i++)p.step({...idleInput(),right:1,crouch:true},0);
  settle(p);assert.equal(p.height,PLAYER.standingHeight);w.free();
});

test('floor tracking respects elevation and per-floor map offsets, and ignores jumping',()=>{
  const plans=levels();plans[1].offset=[4,-2];
  const p={x:6,y:3.012,z:3};
  assert.deepEqual(localPosition(plans[1],p),{x:2,y:p.y-3,z:5});
  assert.equal(floorAtPosition(plans,p,'kg',false),'kg');
  assert.equal(floorAtPosition(plans,p,'kg',true),'eg');
});


test('stair climbing assistance still stops at a vertical wall',()=>{
  const plan=levels()[0];plan.walls=[rectanglePoints([3,1,3.03,9])];
  const w=fixture([plan]),p=new Player(w,1,5,0,[{x0:0,z0:0,x1:10,z1:10,bottom:0,top:4,maxSlope:82}]);settle(p);
  for(let i=0;i<360;i++)p.step({...idleInput(),right:1,sprint:true},0);
  assert.ok(p.body.translation().x<2.8);assert.ok(p.body.translation().y<.05);w.free();
});
