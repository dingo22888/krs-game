import {test} from 'node:test';
import assert from 'node:assert/strict';
import {floors} from '../src/data/house.ts';
import {prepareLivingRoom,livingDetails} from '../src/game/living-room.ts';
import {rectanglePoints} from '../src/game/geometry.ts';
test('living room is repeatable, preserves architecture and leaves the entry route open',()=>{
 const source=structuredClone(floors);source.eg.rooms=[{name:'Wohnzimmer',surface:'wood',polygon:rectanglePoints([0,0,4.2,4.1])}];
 const original=structuredClone(source),out=prepareLivingRoom(source);assert.deepEqual(source,original);assert.deepEqual(prepareLivingRoom(out),out);
 assert.deepEqual(out.eg.walls,source.eg.walls);assert.deepEqual(out.eg.openings,source.eg.openings);
 assert.equal(out.eg.furniture.filter(f=>f.kind==='livingCoffee').length,2);assert.equal(out.eg.furniture.filter(f=>f.kind==='tv').length,1);
 const solids=out.eg.furniture.flatMap(f=>livingDetails(f)??[]);
 for(const b of solids){assert.ok([...b.position,...b.size].every(Number.isFinite));assert.ok(b.size.every(n=>n>0));}
 for(const [x,z] of [[2,.3],[2.8,.4],[3.4,.8],[3.35,2]])assert.ok(!solids.some(b=>b.collision&&b.position[1]-b.size[1]/2<1.8&&Math.abs(x-b.position[0])<b.size[0]/2+.18&&Math.abs(z-b.position[2])<b.size[2]/2+.18));
});
