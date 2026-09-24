import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Racing} from '../src/game/racing.ts';
import {scoreResult} from '../src/server/score-rules.ts';
test('race ends at 60 seconds, stays bounded and cannot score after completion',()=>{
 const game=new Racing();for(let i=0;i<4000;i++)game.step(1/60,0);
 assert.equal(game.time,60);assert.ok(game.finished);assert.ok(game.collisions>0);assert.ok(game.distance>100&&game.distance<2400);
 const result=game.result();game.step(.25,1);assert.deepEqual(game.result(),result);
 assert.equal(scoreResult('racing',result).score,result.distance);
 game.reset();assert.equal(game.time,0);assert.equal(game.collisions,0);assert.equal(game.cars.length,0);
});
test('steering clamps at the verge; collisions and grass reduce speed',()=>{
 const g=new Racing();for(let i=0;i<240;i++)g.step(1/60,1);
 assert.equal(g.x,1.12);assert.ok(g.speed<12);
 g.reset();g.speed=40;g.cars=[{x:0,y:.80,passed:false}];g.step(1/60,0);
 assert.equal(g.collisions,1);assert.ok(g.speed<12);g.step(1/60,0);assert.equal(g.collisions,1);
 for(const bad of [{distance:2401,collisions:0},{distance:-1,collisions:0},{distance:100,collisions:61},{distance:NaN,collisions:0}])assert.throws(()=>scoreResult('racing',bad));
});
