import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wallLayout, WALL_JOIN_TOLERANCE} from '../src/game/wall-layout.ts';
import {boxSurfacePositions} from '../src/game/box-surfaces.ts';
import {rectanglePoints} from '../src/game/geometry.ts';
import {buildModel} from '../src/game/model.ts';
import type {BoxSpec} from '../src/game/model.ts';
import type {FloorPlan} from '../src/data/house.ts';

function fixture(): FloorPlan {
  return {id:'eg',name:'Synthetic alignment fixture',height:2.5,footprint:rectanglePoints([0,0,8,6]),
    walls:[[0,0,3,.3],[4.02,.014,8,.31]].map(rectanglePoints),
    openings:[{kind:'passage',rect:[3.02,-.025,4,.32],top:2.1}],
    rooms:[],furniture:[],stairZones:[],spawn:{x:3.5,z:2,yaw:0}};
}
test('offset opening joins both jambs and aligns its lintel with host wall faces',()=>{
  const plan=fixture(), saved=JSON.stringify(plan), layout=wallLayout(plan);
  assert.deepEqual(layout.openings[0].rect,[3,.014,4.02,.31]);
  assert.equal(JSON.stringify(plan),saved,'private source must not be mutated');
  const lintel=buildModel(plan).find(b=>b.material==='wall'&&b.position[1]>2.1)!;
  assert.ok(Math.abs(lintel.size[2]-.296)<1e-6);
  assert.ok(layout.walls.every(r=>r[2]<=3||r[0]>=4.02),'passage remains unobstructed');
});
test('declared window is cut out of a filled contour and keeps sill, header and solid glass',()=>{
  const plan=fixture();plan.walls=[rectanglePoints([0,0,8,.3])];
  plan.openings=[{kind:'window',rect:[3,-.01,4,.32],sill:.9,top:2.1}];
  const boxes=buildModel(plan);
  const at=(x:number,y:number,z:number,material:string)=>boxes.filter(b=>b.material===material&&[x,y,z].every((v,a)=>Math.abs(v-b.position[a])<b.size[a]/2-1e-6));
  assert.equal(at(3.5,1.5,.15,'wall').length,0);
  assert.ok(at(3.5,.5,.15,'wall').length);
  assert.ok(at(3.5,2.3,.15,'wall').length);
  const glass=at(3.5,1.5,.15,'glass');
  assert.ok(glass.length>0 && glass.every(b=>b.collision));
});
test('snapping closes small wall seams, never deletes thin solids or chains across large distances',()=>{
  const plan=fixture();plan.openings=[];
  plan.walls=[[0,0,2,.3],[2.025,.02,4,.31],[5,0,5.03,5],[6,0,6.2,5],[6.25,0,6.45,5],[6.5,0,6.7,5]].map(rectanglePoints);
  const result=wallLayout(plan).walls;
  assert.equal(result[0][2],result[1][0]);
  assert.ok(result.some(r=>r[0]===5&&Math.abs(r[2]-5.03)<1e-6));
  plan.walls.forEach((p,i)=>p[0].forEach((v,axis)=>assert.ok(Math.abs(result[i][axis]-v)<=WALL_JOIN_TOLERANCE+1e-6)));
});
test('origins and stair geometry are not snapped between storeys',()=>{
  const plan=fixture();plan.offset=[.12,-.14];plan.elevation=2.7;
  plan.floorHoles=[[1,1,2,3]];plan.ceilingHoles=[[1.03,1.01,2.04,3.02]];
  plan.supports=[{rect:[1,1,1.03,1.03],bottom:0,top:2.5}];
  const before=JSON.stringify(plan);wallLayout(plan);assert.equal(JSON.stringify(plan),before);
});
test('stale passage annotation over a solid wall end cannot create a projecting lintel or a new exit',()=>{
  const plan=fixture();plan.walls=[rectanglePoints([0,0,3,.3])];
  plan.openings=[{kind:'passage',rect:[2,-.02,3.07,.32],top:2.1}];
  const layout=wallLayout(plan);
  assert.equal(layout.openings.length,0);
  assert.deepEqual(layout.walls,[[0,0,3,.3]]);
});
function box(x:number,width:number): BoxSpec { return {position:[x,0,0],size:[width,1,1],material:'fabric',collision:true}; }
function area(data:Float32Array) {
  let total=0;
  for(let i=0;i<data.length;i+=9) {
    const u=[data[i+3]-data[i],data[i+4]-data[i+1],data[i+5]-data[i+2]];
    const v=[data[i+6]-data[i],data[i+7]-data[i+1],data[i+8]-data[i+2]];
    total+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
  }
  return total;
}
test('surface union removes duplicate, internal and overlapping sofa faces with outward winding',()=>{
  assert.equal(area(boxSurfacePositions([box(0,1),box(0,1)])),6);
  assert.equal(area(boxSurfacePositions([box(0,1),box(1,1)])),10);
  const data=boxSurfacePositions([box(0,2),box(.5,2)]);
  assert.equal(area(data),12);
  for(let i=0;i<data.length;i+=9) {
    const a=Array.from(data.slice(i,i+3)), b=Array.from(data.slice(i+3,i+6)), c=Array.from(data.slice(i+6,i+9));
    const u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const center=a.map((v,j)=>(v+b[j]+c[j])/3-([.25,0,0][j]));
    assert.ok(normal.reduce((sum,n,j)=>sum+n*center[j],0)>0);
  }
});
