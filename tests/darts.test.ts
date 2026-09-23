import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Darts,dartScore,DART_NUMBERS} from '../src/game/darts.ts';
import {scoreResult} from '../src/server/score-rules.ts';
test('all twenty sectors and scoring rings agree, with 20 at the top',()=>{
 DART_NUMBERS.forEach((n,i)=>{const a=i*Math.PI/10;
  for(const [r,m] of [[.05,1],[.103,3],[.14,1],[.166,2]])assert.equal(dartScore(Math.sin(a)*r,Math.cos(a)*r).points,n*m);
 });
 assert.equal(dartScore(0,0).points,50);assert.equal(dartScore(.01,0).points,25);
 assert.equal(dartScore(0,.171).points,0);assert.equal(dartScore(NaN,0).points,0);
 assert.equal(dartScore(0,.0989).points,20);assert.equal(dartScore(0,.1071).points,20);
});
test('exactly nine darts finish a round and server derives score from coordinates',()=>{
 const game=new Darts();for(let i=0;i<9;i++)game.throw(0,.103);
 assert.equal(game.score,540);assert.ok(game.finished);assert.equal(game.throw(0,0),undefined);assert.equal(game.hits.length,9);
 assert.equal(scoreResult('darts',{throws:game.hits,score:999999}).score,540);
 assert.throws(()=>scoreResult('darts',{throws:game.hits.slice(1)}));
 assert.throws(()=>scoreResult('darts',{throws:Array(9).fill({x:Infinity,y:0})}));
 game.reset();assert.equal(game.score,0);assert.equal(game.finished,false);
});
