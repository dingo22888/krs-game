import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {floors} from '../src/data/house.ts';
import {rectanglePoints} from '../src/game/geometry.ts';
import {prepareInteriors} from '../src/game/interiors.ts';
import {parseHouseModel} from '../src/data/import-model.ts';
import {buildModel} from '../src/game/model.ts';
import {buildBuilding,addBuildingColliders} from '../src/game/building.ts';
import {Player,idleInput,FIXED_DT} from '../src/game/player.ts';

before(async()=>{await RAPIER.init();});
// Synthetic rooms with a deliberately missing outer wall between two sashes.
function fixture(){
  const copy=structuredClone(floors),p=copy.og;
  for(const [i,f] of Object.values(copy).entries())f.walls.push(rectanglePoints([2+i*.1,2,2.05+i*.1,2.1]));
  p.height=2.35;p.footprint=rectanglePoints([0,0,8.7,10]);p.spawn={x:5,z:3.9,yaw:0};
  p.rooms=[{name:'Schlafen',surface:'wood',polygon:rectanglePoints([4.5,.3,8.45,4.5])},{name:'Bad',surface:'tile',polygon:rectanglePoints([5.9,4.7,8.45,7.1])}];
  p.walls=[[4.3,.1,8.7,.3],[8.45,.3,8.7,4.5],[4.3,.3,4.5,3.65],[4.3,4.45,4.5,4.7],[4.5,4.5,8.7,4.7],[5.7,4.7,5.9,6.1],[5.7,7,5.9,7.25],[5.9,7.1,8.7,7.25],[8.45,6.65,8.7,7.1]].map(r=>rectanglePoints(r as [number,number,number,number]));
  p.openings=[{kind:'window',rect:[8.45,3.55,8.7,4.45],sill:.85,top:2.1},{kind:'window',rect:[8.45,6.1,8.7,7.05],sill:1,top:2.1},{kind:'window',rect:[5.1,.1,6.3,.3],sill:.85,top:2.1},{kind:'passage',rect:[5.7,6.1,5.9,7],top:2.1},{kind:'passage',rect:[4.3,3.65,4.5,4.45],top:2.1}];
  p.furniture=[{kind:'bed',rect:[6,.8,8.2,2.6],height:.55},{kind:'shelf',rect:[4.6,.4,5.1,2],height:1.9}];
  p.roofs=[{rect:[7.25,0,8.7,10],axis:'x',startHeight:2.35,endHeight:.9}];
  return copy;
}

test('photo furniture and window corrections survive repeated preparation and JSON import',()=>{
  const source=fixture(),snapshot=structuredClone(source),a=prepareInteriors(source);
  assert.deepEqual(source,snapshot);
  assert.deepEqual(prepareInteriors(a),a);
  const imported=parseHouseModel(JSON.stringify({format:'krs-house',version:1,floors:a}));
  assert.deepEqual(JSON.parse(JSON.stringify(prepareInteriors(imported).og)),JSON.parse(JSON.stringify(a.og)));
  for(const kind of ['bathtub','vanity','toilet','wardrobe','tv'])assert.equal(a.og.furniture.filter(f=>f.kind===kind).length,1);
  assert.equal(a.og.furniture.filter(f=>f.kind==='nightstand').length,2);
});

test('bath facade is solid across both windows, central pier, sill and lintel',()=>{
  const plan=prepareInteriors(fixture()).og;
  const world=new RAPIER.World({x:0,y:0,z:0});
  addBuildingColliders(world,buildBuilding([{...plan,furniture:[],roofs:[]}]));world.step();
  for(let z=4.72;z<7.09;z+=.025)for(const y of [.15,.8,1.25,1.75,2.25]) {
    const hit=world.castRay(new RAPIER.Ray({x:8.2,y,z},{x:1,y:0,z:0}),.6,true);
    assert.ok(hit,`exterior leak at z=${z}, y=${y}`);
  }
  const pier=buildModel(plan).find(b=>b.material==='wall'&&b.size[1]>2&&b.position[0]>8.4&&b.position[2]>5.5&&b.position[2]<6.2);
  assert.ok(pier,'central masonry extends to ceiling');world.free();
});

test('bath entrance and central aisle are walkable while outer wall stops the player',()=>{
  const plan=prepareInteriors(fixture()).og,world=new RAPIER.World({x:0,y:-18,z:0});
  addBuildingColliders(world,buildBuilding([plan]));
  const player=new Player(world,5.3,6.38);
  const input={...idleInput(),right:1};
  for(let i=0;i<180;i++)player.step(input,0,FIXED_DT);
  assert.ok(player.body.translation().x>7.1,'walk through doorway into central aisle');
  assert.ok(player.body.translation().x<8.3,'cannot leave the building');
  world.free();
});

test('bed headboard and TV screen face each other across the bedroom',()=>{
  const plan=prepareInteriors(fixture()).og,bed=plan.furniture.find(f=>f.kind==='bed')!,tv=plan.furniture.find(f=>f.kind==='tv')!;
  assert.equal(bed.facing,'west');assert.equal(tv.facing,'east');
  const bedParts=buildModel({...plan,walls:[],openings:[],furniture:[bed]});
  const head=bedParts.find(b=>b.material==='upholstery'&&b.position[1]>.7)!;
  assert.ok(head.position[0]>bed.rect[2]-.15);
  const tvParts=buildModel({...plan,walls:[],openings:[],furniture:[tv]});
  assert.ok(tvParts.find(b=>b.material==='screen')!.position[0]>tv.rect[2]);
});
