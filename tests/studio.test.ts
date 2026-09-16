import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {floors} from '../src/data/house.ts';
import {prepareStudio,monitorSize} from '../src/game/studio.ts';
import {rectanglePoints,type Rect} from '../src/game/geometry.ts';
import {buildBuilding,addBuildingColliders} from '../src/game/building.ts';
import {parseHouseModel} from '../src/data/import-model.ts';
import {Pong} from '../src/game/pong.ts';
before(async()=>RAPIER.init());
function fixture(){
 const copy=structuredClone(floors),o=copy.og,d=copy.dg;
 copy.kg.walls.push(rectanglePoints([3,1,3.2,1.4]));
 o.rooms=[{name:'Schlafen',surface:'wood',polygon:rectanglePoints([5,0,9,5])},{name:'Kinderflur',surface:'wood',polygon:rectanglePoints([3,2,4.8,5])}];
 o.walls=[rectanglePoints([4.8,0,5,5])];o.openings=[{kind:'passage',rect:[4.8,3,5,4]},{kind:'passage',rect:[5,5,6,5.2]}];o.furniture=[];
 d.height=2.35;d.footprint=rectanglePoints([0,0,4.4,10.5]);d.rooms=[{name:'Dachstudio',surface:'wood',polygon:rectanglePoints([.2,.2,4.2,10.3])}];
 d.walls=([[0,0,.2,10.5],[4.2,0,4.4,10.5],[.2,0,4.2,.2],[.2,10.3,4.2,10.5],[2.0,2.8,2.15,4.6],[2,5.2,2.15,5.4],[2,6.3,2.15,6.6]] as Rect[]).map(rectanglePoints);
 d.openings=[{kind:'passage',rect:[2,5.4,2.15,6.3]}];d.furniture=[];return copy;
}
test('confirmed false bedroom opening closes; actual bedroom entry stays',()=>{
 const source=fixture(),p=prepareStudio(source).og;assert.equal(p.openings.length,1);assert.equal(source.og.openings.length,2);
 const world=new RAPIER.World({x:0,y:0,z:0});addBuildingColliders(world,buildBuilding([p]));world.step();
 assert.ok(world.castRay(new RAPIER.Ray({x:5.5,y:1,z:3.5},{x:-1,y:0,z:0}),1,true));world.free();
});
test('attic closes only the undeclared gap and retains a traversable door',()=>{
 const p=prepareStudio(fixture()).dg,world=new RAPIER.World({x:0,y:0,z:0});addBuildingColliders(world,buildBuilding([p]));world.step();
 for(const z of [4.65,4.9,5.15])assert.ok(world.castRay(new RAPIER.Ray({x:2.5,y:1,z},{x:-1,y:0,z:0}),.8,true));
 assert.equal(world.castRay(new RAPIER.Ray({x:2.5,y:1,z:5.8},{x:-1,y:0,z:0}),.8,true),null);world.free();
});
test('studio rebuild and JSON round trip are repeatable with a real 49-inch screen',()=>{
 const original=fixture(),snapshot=structuredClone(original),p=prepareStudio(original);assert.deepEqual(original,snapshot);assert.deepEqual(prepareStudio(p),p);
 const imported=parseHouseModel(JSON.stringify({format:'krs-house',version:1,floors:p}));
 assert.deepEqual(JSON.parse(JSON.stringify(prepareStudio(imported).dg)),JSON.parse(JSON.stringify(p.dg)));
 const wide=p.dg.furniture.find(f=>f.workstation==='wide')!;const size=monitorSize(wide);assert.ok(Math.abs(Math.hypot(size.width,size.height)-49*.0254)<1e-8);
 assert.equal(p.dg.furniture.filter(f=>f.kind==='studioChair').length,2);
});
test('Pong rebounds off paddles and walls even at low render frame rates',()=>{
 const g=new Pong();g.serve=0;g.ball={x:.065,y:.5,vx:-1.3,vy:0};g.step(.1,.5);assert.ok(g.ball.vx>0);assert.equal(g.hits,1);
 g.ball={x:.5,y:.021,vx:.6,vy:-.8};g.step(.1,.5);assert.ok(g.ball.vy>0);assert.ok(g.ball.y>=.02);
});
test('Pong awards a missed ball once, ends at five and resets',()=>{
 const g=new Pong();g.scores=[4,1];g.serve=0;g.ball={x:1.02,y:.05,vx:1,vy:0};g.step(.1,.5);assert.deepEqual(g.scores,[5,1]);assert.equal(g.winner,'Du gewinnst!');g.step(.1,.5);assert.deepEqual(g.scores,[5,1]);g.reset();assert.deepEqual(g.scores,[0,0]);assert.equal(g.winner,'');assert.equal(g.serve,1);
});
