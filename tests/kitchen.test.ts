import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {fitKitchen} from '../src/game/kitchen-layout.ts';
import {kitchenDetails} from '../src/game/kitchen-details.ts';
import {floors} from '../src/data/house.ts';
import {rectanglePoints} from '../src/game/geometry.ts';
import {buildBuilding,addBuildingColliders} from '../src/game/building.ts';
import {Player,idleInput} from '../src/game/player.ts';

before(async()=>{await RAPIER.init();});
const recipe=()=>fitKitchen([.2,.2,4.2,4.4],1.1,2.5,2.35,[]);

test('kitchen has built-in appliances, two stools and one four-shade pendant',()=>{
  const items=recipe();
  for(const kitchen of ['fridge','oven','sink','dishwasher','hob'])assert.equal(items.filter(f=>f.kitchen===kitchen).length,1);
  assert.equal(items.filter(f=>f.kind==='barstool').length,2);
  assert.equal(items.filter(f=>f.kind==='counter'&&f.height===2.2).length,2);
  const pendant=items.find(f=>f.kind==='kitchenPendant')!;
  assert.equal(kitchenDetails(pendant)!.filter(b=>b.shape==='shade').length,4);
  const hob=items.find(f=>f.kitchen==='hob')!;
  assert.equal(hob.facing,'north');
  assert.ok(items.filter(f=>f.kind==='barstool').every(f=>f.rect[1]>hob.rect[3]));
});

test('sink is recessed through the worktop and its cabinet, with an unobstructed basin',()=>{
  const f=recipe().find(f=>f.kitchen==='sink')!,boxes=kitchenDetails(f)!;
  const w=f.rect[2]-f.rect[0],x=f.rect[2]-w*.295,z=f.rect[3]-.34;
  const over=boxes.filter(b=>Math.abs(b.position[0]-x)<b.size[0]/2&&Math.abs(b.position[2]-z)<b.size[2]/2);
  assert.ok(over.length);
  assert.ok(Math.max(...over.map(b=>b.position[1]+b.size[1]/2))<f.height-.15);
});

test('player can walk from the entrance round stools and peninsula into the cooking aisle',()=>{
  const p=structuredClone(floors.eg);
  p.height=2.35;p.footprint=rectanglePoints([0,0,4.4,4.6]);p.walls=[];p.openings=[];p.furniture=recipe();
  const world=new RAPIER.World({x:0,y:-18,z:0});addBuildingColliders(world,buildBuilding([p]));
  const player=new Player(world,.65,4.1);
  const walk=(forward:number,right:number,n:number)=>{for(let i=0;i<n;i++)player.step({...idleInput(),forward,right},0);};
  walk(1,0,50);assert.ok(player.body.translation().z<3.35);
  walk(0,1,114);assert.ok(player.body.translation().x>2.65);
  walk(1,0,115);assert.ok(player.body.translation().z<1.5);
  walk(0,1,100);assert.ok(player.body.translation().x<3.4,'east cabinets stop the player');
  player.dispose();world.free();
});
