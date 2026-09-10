import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {FloorPlan} from '../src/data/house.ts';
import {rectanglePoints} from '../src/game/geometry.ts';
import {prepareDormers} from '../src/game/dormers.ts';
import {buildBuilding} from '../src/game/building.ts';

function fixture():Record<'kg'|'eg'|'og'|'dg',FloorPlan> {
  const make=(id:'kg'|'eg'|'og'|'dg',elevation:number):FloorPlan=>({id,name:id,height:2.35,elevation,
    footprint:rectanglePoints([0,0,10,10]),walls:[rectanglePoints([0,0,10,.2])],rooms:[],openings:[],furniture:[],stairZones:[]});
  const floors={kg:make('kg',0),eg:make('eg',2.6),og:make('og',5.2),dg:make('dg',7.8)};
  floors.og.rooms=[
    {name:'Schlafen',surface:'wood',polygon:rectanglePoints([4,0,8.5,4.5])},
    {name:'Bad',surface:'tile',polygon:rectanglePoints([6,4.5,8.5,7])},
  ];
  floors.og.openings=[
    {kind:'window',rect:[8.3,3.5,8.7,4.45],sill:.85,top:2.1},
    {kind:'window',rect:[8.3,5.9,8.7,6.95],sill:1,top:2.1},
  ];
  floors.og.roofs=[{rect:[7.2,0,8.7,10],axis:'x',startHeight:2.35,endHeight:.85}];
  return floors;
}

test('right bedroom and bathroom glazing receives a raised dormer and two bathroom windows',()=>{
  const source=fixture(),result=prepareDormers(source),og=result.og!,roof=og.roofs![0];
  assert.notEqual(result,source);assert.equal(roof.cutouts?.length,1);
  const cut=roof.cutouts![0];assert.ok(cut[1]<=3.5&&cut[3]>=6.95);
  assert.equal(og.openings.filter(o=>o.kind==='window'&&o.rect[0]>8).length,3);
  assert.equal(og.openings.filter(o=>o.kind==='window'&&o.rect[1]>=4.5).length,2);
  assert.ok(Math.abs(roof.startHeight-og.height)<1e-9);
  assert.ok(Math.abs(roof.startHeight-(roof.endHeight+(roof.rect[2]-roof.rect[0])*(roof.startHeight-roof.endHeight)/(roof.rect[2]-roof.rect[0])))<1e-9);
});

test('dormer preparation is repeatable and roof collision leaves a horizontal ceiling below the cutout',()=>{
  const once=prepareDormers(fixture()),twice=prepareDormers(once);
  assert.deepEqual(twice,once);
  const model=buildBuilding(Object.values(once));
  const ceiling=model.boxes.filter(b=>b.material==='ceiling'&&Math.abs(b.position[1]-once.og.elevation!-once.og.height-.01)<.001);
  assert.ok(ceiling.length>0);
  const roof=model.hulls.filter(h=>h.material==='ceiling');assert.ok(roof.length>0);
});
