import {test} from 'node:test';
import assert from 'node:assert/strict';
import {floors} from '../src/data/house.ts';
import {prepareBrewCellar,brewDetails} from '../src/game/brew-cellar.ts';
import {rectanglePoints} from '../src/game/geometry.ts';
import {kitchenDetails} from '../src/game/kitchen-details.ts';
import {parseHouseModel} from '../src/data/import-model.ts';

function fixture(){
 const f=structuredClone(floors);for(const [i,p] of Object.values(f).entries())p.walls.push(rectanglePoints([7+i*.1,5,7.05+i*.1,5.1]));f.kg.rooms=[{name:'Braukeller',surface:'concrete',polygon:rectanglePoints([0,0,4,4])}];
 f.kg.furniture=[{kind:'counter',rect:[.2,.4,.7,2.3],height:.9},{kind:'shelf',rect:[6,1,7,2],height:1.7}];return f;
}
test('brew recipe replaces placeholders once, leaves other rooms/structure unchanged and can be reimported',()=>{
 const source=fixture(),before=structuredClone(source),out=prepareBrewCellar(source);
 assert.deepEqual(source,before);assert.deepEqual(prepareBrewCellar(out),out);
 assert.deepEqual(out.eg,source.eg);assert.deepEqual(out.kg.walls,source.kg.walls);assert.deepEqual(out.kg.openings,source.kg.openings);
 assert.ok(out.kg.furniture.some(f=>f.kind==='shelf'&&f.rect[0]===6));
 assert.equal(out.kg.furniture.filter(f=>f.kind==='barstool').length,2);
 assert.equal(out.kg.furniture.filter(f=>f.kind==='brewChair').length,1);
 assert.equal(out.kg.furniture.filter(f=>f.kind==='brewBench').length,2);
 assert.equal(parseHouseModel(JSON.stringify({format:'krs-house',version:1,floors:out})).kg.furniture.length,out.kg.furniture.length);
});
test('furniture geometry is finite and leaves the working aisle and eastern entry open',()=>{
 const plan=prepareBrewCellar(fixture()).kg;
 const solids=plan.furniture.flatMap(f=>brewDetails(f)??kitchenDetails(f)??[]);
 for(const box of solids){assert.ok([...box.position,...box.size].every(Number.isFinite));assert.ok(box.size.every(n=>n>0));}
 // A player's 36 cm diameter fits between kitchen and bar, and past the stools.
 for(const [x,z] of [[1.05,.7],[1.05,1.4],[1.05,2.4],[3.5,.7],[3.5,1.4]]){
  assert.ok(!solids.some(b=>b.collision&&b.position[1]-b.size[1]/2<1.8&&b.position[1]+b.size[1]/2>.1&&Math.abs(x-b.position[0])<b.size[0]/2+.18&&Math.abs(z-b.position[2])<b.size[2]/2+.18),`blocked at ${x},${z}`);
 }
});
