import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floors, floorOrder } from '../src/data/house.ts';
import { parseHouseModel } from '../src/data/import-model.ts';

function example() {
  const copy=structuredClone(floors);
  for(const [index,id] of floorOrder.entries()) {
    // Synthetic fixture: add a different tiny column in each level.
    const x=8+index*.1;
    copy[id].walls.push([[x,6.5],[x+.08,6.5],[x+.08,6.6],[x,6.6]]);
  }
  return {format:'krs-house',version:1,floors:copy};
}

test('imports all four distinct levels with metre coordinates',()=>{
  const data=example();const imported=parseHouseModel(JSON.stringify(data));
  for(const id of floorOrder)assert.deepEqual(imported[id].walls,data.floors[id].walls);
  assert.equal(new Set(floorOrder.map(id=>JSON.stringify(imported[id].walls))).size,4);
});
test('rejects missing or duplicated levels instead of displaying the same rooms',()=>{
  assert.throws(()=>parseHouseModel(JSON.stringify({format:'krs-house',version:1,floors})),/identische/);
  const data=example();delete (data.floors as Partial<typeof floors>).dg;
  assert.throws(()=>parseHouseModel(JSON.stringify(data)),/Ungültige/);
});
test('rejects invalid JSON, unbounded geometry and an outside spawn',()=>{
  assert.throws(()=>parseHouseModel('<html>broken</html>'),/Ungültige/);
  const data=example();data.floors.eg.height=999;
  assert.throws(()=>parseHouseModel(JSON.stringify(data)),/Ungültige/);
  data.floors.eg.height=2.6;data.floors.eg.spawn.x=99;
  assert.throws(()=>parseHouseModel(JSON.stringify(data)),/Ungültige/);
});


test('version 2 preserves private elevations, roofs and stair metadata',()=>{
  const data=example();data.version=2;
  for(const [i,id] of floorOrder.entries())Object.assign(data.floors[id],{elevation:i*3,offset:[i*.2,0],floorHoles:[],ceilingHoles:[],stairs:[],roofs:[]});
  data.floors.og.roofs=[{rect:[0,0,2,8],axis:'x',startHeight:1,endHeight:2.6}];
  const result=parseHouseModel(JSON.stringify(data));
  assert.deepEqual(result.og.roofs,data.floors.og.roofs);
  assert.equal(result.dg.elevation,9);
  delete data.floors.dg.elevation;
  assert.throws(()=>parseHouseModel(JSON.stringify(data)),/Ungültige/);
});

test('rejects stairs with broken destinations, oversized risers or missing headroom',()=>{
  const data=example();data.version=2;
  for(const [i,id] of floorOrder.entries())data.floors[id].elevation=i*3;
  data.floors.kg.stairs=[{to:'eg',steps:[{polygon:[[1,1],[2,1],[2,2],[1,2]],top:3}]}];
  assert.throws(()=>parseHouseModel(JSON.stringify(data)),/Ungültige/);
  data.floors.kg.ceilingHoles=[[1,1,2,2]];data.floors.eg.floorHoles=[[1,1,2,2]];
  assert.throws(()=>parseHouseModel(JSON.stringify(data)),/Ungültige/);
});
