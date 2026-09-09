import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {floors} from '../src/data/house.ts';
import {rectanglePoints as polygon} from '../src/game/geometry.ts';
import {prepareInteriors} from '../src/game/interiors.ts';
import {parseHouseModel} from '../src/data/import-model.ts';
import {buildModel} from '../src/game/model.ts';
import {buildBuilding} from '../src/game/building.ts';
import {wallLayout} from '../src/game/wall-layout.ts';
import {Player,idleInput,FIXED_DT} from '../src/game/player.ts';

before(async()=>{await RAPIER.init();});

function fixture() {
  const copy=structuredClone(floors);
  for(const [i,f] of Object.values(copy).entries()) {
    f.height=2.3;f.elevation=i*2.5;
    f.walls.push(polygon([7+i*.1,6,7.05+i*.1,6.1]));
  }
  const eg=copy.eg;
  eg.rooms=[{name:'Esszimmer',surface:'wood',polygon:polygon([.2,.2,4.8,5.8])},{name:'Küche',surface:'tile',polygon:polygon([5,.2,9.8,4.8])}];
  eg.walls=[[0,0,10,.2],[9.8,.2,10,6],[4.8,.2,5,2.7],[4.8,3.6,5,6],[6.2,4.8,9.8,5]].map(r=>polygon(r as [number,number,number,number]));
  eg.openings=[{kind:'passage',rect:[4.8,2.7,5,3.6],top:2.1},{kind:'door',rect:[6,0,7.5,.2],top:2.1},{kind:'passage',rect:[5,4.8,6.2,5]}];
  eg.furniture=[{kind:'table',rect:[2,2,3,4.4],height:.76},{kind:'counter',rect:[6,1,8.5,1.6],height:.92}];
  copy.og.roofs=[{rect:[0,0,2,6],axis:'x',startHeight:1,endHeight:2.3}];
  return copy;
}

test('interiors retain source data, are repeatable, and survive saved model import',()=>{
  const source=fixture(),snapshot=structuredClone(source),result=prepareInteriors(source);
  assert.deepEqual(source,snapshot);
  assert.deepEqual(prepareInteriors(result),result);
  const loaded=parseHouseModel(JSON.stringify({format:'krs-house',version:2,floors:result}));
  assert.equal(loaded.eg.furniture.filter(f=>f.kind==='chair').length,4);
  assert.deepEqual(loaded.eg.openings[0].leaf,{hinge:'end',side:-1,angle:180});
  assert.equal(loaded.eg.furniture.find(f=>f.kind==='chair')?.facing,'east');
  assert.equal(result.og.roofs![0].startHeight,1);assert.equal(result.og.roofs![0].endHeight,2.35);
  for(const id of ['kg','eg','og','dg'] as const) {
    assert.equal(result[id].height,2.35);assert.equal(result[id].elevation,source[id].elevation);
  }
});

test('table is 1.60 by .90 with four inward chairs; door leaf is beside a traversable opening',()=>{
  const eg=prepareInteriors(fixture()).eg;
  const table=eg.furniture.find(f=>f.kind==='table')!;
  assert.ok(Math.abs(table.rect[3]-table.rect[1]-1.6)<1e-9);
  assert.ok(Math.abs(table.rect[2]-table.rect[0]-.9)<1e-9);
  assert.equal(eg.furniture.filter(f=>f.kind==='chair').length,4);
  const boxes=buildModel(eg),door=boxes.find(b=>b.material==='interiorDoor')!;
  assert.ok(door.position[0]+door.size[0]/2<=4.8);
  assert.ok(!boxes.some(b=>b.collision&&Math.abs(b.position[0]-4.9)<b.size[0]/2&&Math.abs(b.position[2]-3.15)<b.size[2]/2&&Math.abs(b.position[1]-1)<b.size[1]/2));
  const glass=boxes.find(b=>b.material==='glass')!;
  assert.ok(glass.collision);assert.ok(Math.abs(glass.position[1]-glass.size[1]/2-1)<1e-9);
});

test('kitchen runs meet walls, keep the hall entrance open and have two 2.2m cabinets',()=>{
  const eg=prepareInteriors(fixture()).eg;
  const cabinets=eg.furniture.filter(f=>f.kind==='counter');
  assert.equal(cabinets.filter(f=>f.height===2.2).length,2);
  assert.ok(cabinets.filter(f=>f.facing==='west').every(f=>f.rect[2]===9.8));
  assert.equal(cabinets.find(f=>f.facing==='north')!.rect[3],4.8);
  assert.equal(cabinets.find(f=>f.facing==='north')!.rect[0],6.2);
  const peninsula=cabinets.find(f=>f.facing==='south')!;
  assert.equal(peninsula.rect[0],5);assert.ok(peninsula.rect[3]<2.7);
  for(const a of cabinets)for(const b of cabinets)if(a!==b) {
    assert.ok(Math.min(a.rect[2],b.rect[2])-Math.max(a.rect[0],b.rect[0])<1e-8||Math.min(a.rect[3],b.rect[3])-Math.max(a.rect[1],b.rect[1])<1e-8);
  }
});

test('short T junction closes but a declared opening and parallel wall gap remain open',()=>{
  const f=structuredClone(floors.eg);
  f.walls=[[0,0,2,.2],[2.12,-.5,2.32,1]].map(r=>polygon(r as [number,number,number,number]));f.openings=[];
  assert.ok(wallLayout(f).walls.some(r=>r[0]<=2.06&&r[2]>=2.06&&r[1]<=.1&&r[3]>=.1));
  f.openings=[{kind:'passage',rect:[2,0,2.12,.2]}];
  assert.ok(!wallLayout(f).walls.some(r=>r[0]<2.06&&r[2]>2.06&&r[1]<.1&&r[3]>.1));
  f.openings=[];f.walls=[polygon([0,0,2,.2]),polygon([2.12,0,4,.2])];
  assert.ok(!wallLayout(f).walls.some(r=>r[0]<2.06&&r[2]>2.06));
});

test('upper slab does not intrude below the raised ceiling',()=>{
  const plans=Object.values(prepareInteriors(fixture()));
  const model=buildBuilding(plans);
  const upperSlabs=model.boxes.filter(b=>b.material==='floor'&&Math.abs(b.position[1]+b.size[1]/2-2.5)<1e-9);
  assert.ok(upperSlabs.length>0);
  assert.ok(upperSlabs.every(b=>b.position[1]-b.size[1]/2>=2.37-1e-9));
});

test('bounded shaft recess is completed once and declared openings are protected',()=>{
  const source=fixture();
  source.eg.walls.push(polygon([3,5.6,4.6,5.85]),polygon([4.95,5.25,5,5.85]));
  const result=prepareInteriors(source);
  const solid=(p:typeof source)=>wallLayout(p.eg).walls.some(r=>r[0]<4.7&&r[2]>4.7&&r[1]<5.4&&r[3]>5.4);
  assert.ok(solid(result));assert.deepEqual(prepareInteriors(result),result);
  source.eg.openings.push({kind:'window',rect:[4.6,5.3,4.8,5.5]});
  assert.ok(!solid(prepareInteriors(source)));
});

test('180 degree leaf leaves the wall-side aisle and both directions through the doorway walkable',()=>{
  const eg=prepareInteriors(fixture()).eg;
  for(const route of [{x:4.3,z:2,yaw:Math.PI,axis:'z',target:4},{x:4.3,z:3.15,yaw:-Math.PI/2,axis:'x',target:5.5},{x:5.7,z:3.15,yaw:Math.PI/2,axis:'x',target:4.5}]) {
    const world=new RAPIER.World({x:0,y:-18,z:0});
    try {
      for(const b of buildModel(eg))if(b.collision)world.createCollider(RAPIER.ColliderDesc.cuboid(b.size[0]/2,b.size[1]/2,b.size[2]/2).setTranslation(...b.position));
      const player=new Player(world,route.x,route.z);
      for(let i=0;i<Math.ceil(1.05/FIXED_DT);i++)player.step({...idleInput(),forward:1},route.yaw);
      const pos=player.body.translation(),coordinate=route.axis==='x'?pos.x:pos.z;
      assert.ok(route.yaw===Math.PI/2?coordinate<route.target:coordinate>route.target,`blocked route ${JSON.stringify(route)} at ${coordinate}`);
    }finally{world.free();}
  }
});

test('balcony bay has floor-height glass and dark frames while the adjacent window keeps its sill',()=>{
  const source=fixture();source.eg.openings.push({kind:'window',rect:[0,1,.2,4],sill:.8,top:2.1});
  const prepared=prepareInteriors(source);
  const loaded=parseHouseModel(JSON.stringify({format:'krs-house',version:2,floors:prepared}));
  assert.deepEqual(loaded.eg.openings.at(-1)!.balcony,{side:'end',width:.9});
  assert.deepEqual(prepareInteriors(prepared),prepared);
  const boxes=buildModel(loaded.eg);
  const covers=(b:typeof boxes[number],x:number,y:number,z:number)=>b.collision&&Math.abs(b.position[0]-x)<b.size[0]/2&&Math.abs(b.position[1]-y)<b.size[1]/2&&Math.abs(b.position[2]-z)<b.size[2]/2;
  assert.ok(boxes.some(b=>b.material==='glass'&&covers(b,.1,.4,3.6)));
  assert.ok(!boxes.some(b=>b.material==='wall'&&covers(b,.1,.4,3.6)));
  assert.ok(boxes.some(b=>b.material==='wall'&&covers(b,.1,.4,2)));
  assert.ok(boxes.some(b=>b.material==='windowFrame'&&b.position[1]<.1));
  assert.ok(boxes.some(b=>b.material==='hardware'));
  const broken=structuredClone(loaded);broken.eg.openings.at(-1)!.balcony!.width=9;
  assert.throws(()=>parseHouseModel(JSON.stringify({format:'krs-house',version:2,floors:broken})),/Ungültige/);
});
