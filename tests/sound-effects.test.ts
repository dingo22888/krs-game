import {test} from 'node:test';
import assert from 'node:assert/strict';
import {synthesize,HitSoundRules} from '../src/game/sound-effects.ts';
import type {SoundEffect} from '../src/game/sound-effects.ts';

test('all generated effects are finite, audible, bounded and faded at their edges',()=>{
  for(const kind of ['impact','effort','cheer','horn'] as SoundEffect[]) {
    const samples=synthesize(kind,1);let peak=0,energy=0;
    for(const sample of samples){assert.ok(Number.isFinite(sample));peak=Math.max(peak,Math.abs(sample));energy+=sample*sample;}
    assert.ok(peak>.1 && peak<.81,`${kind} peak ${peak}`);
    assert.ok(energy/samples.length>.0005,`${kind} is nearly silent`);
    assert.equal(Math.abs(samples[0]),0);assert.ok(Math.abs(samples.at(-1)!)<1e-7);
    assert.deepEqual(samples,synthesize(kind,1));
  }
});

test('impact on every hit, effort after four quick hits, cheers at 5 and horns at 10',()=>{
  const rules=new HitSoundRules();
  const effects=Array.from({length:20},(_,i)=>rules.hit({combo:i+1,time:(i+1)*.3}));
  assert.ok(effects.every(e=>e[0]==='impact'));
  assert.deepEqual(effects[3],['impact','effort']);
  assert.deepEqual(effects[4],['impact','cheer']);
  assert.deepEqual(effects[9],['impact','horn']);
  assert.deepEqual(effects[14],['impact','cheer']);
  assert.deepEqual(effects[19],['impact','horn']);
  assert.ok(effects.filter(e=>e.includes('effort')).length<=3,'effort cannot spam every hit');
});

test('slow hits and paused/reset sessions do not carry effort into the next round',()=>{
  const rules=new HitSoundRules();
  for(let i=0;i<8;i++)assert.deepEqual(rules.hit({combo:1,time:i*5}),['impact']);
  rules.reset();assert.deepEqual(rules.hit({combo:1,time:100}),['impact']);
  assert.deepEqual(rules.hit({combo:1,time:0}),['impact']);
});
