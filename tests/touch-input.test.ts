import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TouchInput,joystick,useTouch} from '../src/game/touch-input.ts';

test('joystick has a dead zone, analog speed, capped diagonals and outer sprint',()=>{
  assert.equal(joystick(2,2,50).forward,0);
  const partial=joystick(0,-25,50);assert.ok(partial.forward>0&&partial.forward<1);assert.equal(partial.sprint,false);
  const full=joystick(80,-80,50);assert.ok(Math.abs(Math.hypot(full.right,full.forward)-1)<1e-10);assert.equal(full.sprint,true);
  assert.ok(full.right>0&&full.forward>0);
});
test('three fingers can move, look and jump independently without role stealing',()=>{
  const state=new TouchInput(),looks:number[][]=[];state.onLook=(x,y)=>looks.push([x,y]);
  assert.ok(state.begin(1,'move',100,100,50));state.move(1,100,65);
  assert.ok(state.begin(2,'look',500,200));state.move(2,530,190);
  assert.ok(state.begin(3,'jump',0,0));assert.equal(state.begin(4,'move',0,0),false);assert.equal(state.begin(1,'look',0,0),false);
  const input=state.sample();assert.ok(input.forward>.5);assert.equal(input.jump,true);assert.deepEqual(looks,[[30,-10]]);
  state.end(2);state.move(2,900,900);assert.equal(looks.length,1);assert.ok(state.sample().forward>.5);
  state.end(1);assert.equal(state.sample().forward,0);assert.equal(state.sample().jump,true);
});
test('a quick jump tap reaches one physics step; holding does not queue repeated jumps',()=>{
  const state=new TouchInput();state.begin(1,'jump',0,0);state.end(1);
  assert.equal(state.sample().jump,true);assert.equal(state.sample().jump,false);
  state.begin(2,'jump',0,0);assert.equal(state.sample().jump,true);assert.equal(state.sample().jump,true);state.end(2);assert.equal(state.sample().jump,false);
  state.begin(3,'jump',0,0);state.end(3,true);assert.equal(state.sample().jump,false);
});
test('crouch toggles and each fist fires once per press, regardless of move events',()=>{
  const state=new TouchInput(),hits:string[]=[];state.onPunch=h=>hits.push(h);
  state.begin(1,'crouch',0,0);state.end(1);assert.equal(state.sample().crouch,true);
  state.begin(2,'crouch',0,0);state.end(2);assert.equal(state.sample().crouch,false);
  state.begin(3,'left',0,0);state.move(3,100,50);state.begin(4,'left',0,0);state.begin(5,'right',0,0);
  assert.deepEqual(hits,['left','right']);
});
test('reset clears held pointers, queued jumps, crouch and sprint before resuming',()=>{
  const state=new TouchInput();state.begin(1,'move',0,0,40);state.move(1,0,-80);state.begin(2,'jump',0,0);state.begin(3,'crouch',0,0);
  state.reset();state.move(1,0,-100);
  assert.deepEqual(state.sample(),{forward:0,right:0,sprint:false,crouch:false,jump:false});
  assert.ok(state.begin(1,'move',0,0,40));
});
test('automatic mode supports touch-only browsers while explicit modes support hybrid devices',()=>{
  assert.equal(useTouch('auto',true,false),true);assert.equal(useTouch('auto',false,false),true);
  assert.equal(useTouch('auto',false,true),false);assert.equal(useTouch('touch',false,true),true);assert.equal(useTouch('mouse',true,true),false);
});
