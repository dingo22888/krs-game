import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Boxing,BAG} from '../src/game/boxing.ts';
import type {BoxingPose,Hand} from '../src/game/boxing.ts';
import {prepareActivities} from '../src/game/activities.ts';
import {floors} from '../src/data/house.ts';
import {rectanglePoints,inPolygon} from '../src/game/geometry.ts';
import {Vector3,Quaternion} from 'three';

before(async()=>{await RAPIER.init();});
const dt=1/120;
function fixture() {
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  world.createCollider(RAPIER.ColliderDesc.cuboid(5,.1,5).setTranslation(0,-.1,0));
  const boxing=new Boxing(world,{x:0,y:0,z:0,ceiling:2.3,room:{name:'Werkstatt',polygon:rectanglePoints([-2,-2,2,2]),surface:'concrete'}});
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,0,1.1));
  world.createCollider(RAPIER.ColliderDesc.capsule(.6,.23).setTranslation(0,.9,0),body);
  const pose:BoxingPose={eye:{x:0,y:1.68,z:1.1},yaw:0,pitch:0,body};
  for(let i=0;i<30;i++)world.step();
  return {world,boxing,pose};
}
function run(f:ReturnType<typeof fixture>,seconds:number) {
  for(let i=0;i<Math.round(seconds/dt);i++){f.boxing.step(dt,f.pose);f.world.step();}
}

test('workshop placement clears only that room without changing private input',()=>{
  const plan=structuredClone(floors.kg);plan.rooms[1].name='Heizungskeller / Werkstatt';
  const original=JSON.stringify(plan),result=prepareActivities(plan);
  assert.ok(result.boxing);
  assert.equal(JSON.stringify(plan),original);
  assert.equal(result.plan.furniture.length,2);
  assert.ok(result.plan.furniture.every(f=>f.kind==='sofa'||f.kind==='table'));
  assert.ok(inPolygon(result.boxing.x,result.boxing.z,plan.rooms[1].polygon));
  assert.equal(prepareActivities(floors.eg).boxing,undefined);
  plan.rooms[1].polygon=rectanglePoints([0,0,1,1]);
  assert.equal(prepareActivities(plan).boxing,undefined,'small room must not be obstructed');
});

test('activity respects world offsets, ceiling holes and supports',()=>{
  const plan=structuredClone(floors.kg);plan.rooms[1].name='Werkstatt';
  plan.offset=[20,30];plan.elevation=-3;
  const result=prepareActivities(plan);assert.ok(result.boxing);
  assert.equal(result.boxing.y,-3);assert.ok(Math.abs(result.boxing.ceiling+.4)<1e-9);
  assert.ok(inPolygon(result.boxing.x-20,result.boxing.z-30,plan.rooms[1].polygon));
  plan.ceilingHoles=[[0,0,10,4]];
  assert.equal(prepareActivities(plan).boxing,undefined);
});

test('left/right strikes count once, drive the bag forward and generate opposite spin',()=>{
  const spins:number[]=[];
  for(const hand of ['left','right'] as Hand[]) {
    const f=fixture();assert.ok(f.boxing.punch(hand,f.pose));
    assert.equal(f.boxing.punch(hand,f.pose),false,'held/repeated click cannot stack');
    run(f,.2);
    assert.equal(f.boxing.hits[hand],1);
    assert.equal(f.boxing.hits[hand==='left'?'right':'left'],0);
    assert.ok(f.boxing.body.linvel().z<-.1);
    spins.push(f.boxing.body.angvel().y);
    run(f,.4);assert.equal(f.boxing.hits[hand],1,'one impulse per strike');
    f.world.free();
  }
  assert.ok(spins[0]*spins[1]<0,`expected opposing torque: ${spins}`);
});

test('misses, range, walls and paused punches cannot score',()=>{
  for(const mode of ['far','away','wall','cancel']) {
    const f=fixture();
    if(mode==='far')f.pose.eye.z=3.5;
    if(mode==='away')f.pose.yaw=Math.PI;
    f.boxing.punch('left',f.pose);
    if(mode==='wall') {
      f.world.createCollider(RAPIER.ColliderDesc.cuboid(2,2,.02).setTranslation(0,1,.7));
      f.world.step();
    }
    if(mode==='cancel')f.boxing.cancel();
    run(f,.5);
    assert.equal(f.boxing.hits.left,0,mode);
    f.world.free();
  }
});

test('bag remains suspended, swings back and loses energy through damping',()=>{
  const f=fixture();f.boxing.punch('left',f.pose);run(f,.15);
  let maxDistance=0,returned=false,earlyEnergy=0,lateEnergy=0;
  for(let i=0;i<120*14;i++) {
    f.boxing.step(dt,f.pose);f.world.step();
    const b=f.boxing,position=b.body.translation(),velocity=b.body.linvel(),spin=b.body.angvel();
    assert.ok(Number.isFinite(position.y) && position.y>.5 && position.y<1.8);
    const top=new Vector3(0,BAG.height/2,0).applyQuaternion(new Quaternion().copy(b.body.rotation())).add(position);
    const chainBottom=new Vector3(0,-b.chainLength/2,0).applyQuaternion(new Quaternion().copy(b.chain.rotation())).add(b.chain.translation());
    assert.ok(top.distanceTo(chainBottom)<.035,'joint separated');
    maxDistance=Math.max(maxDistance,Math.hypot(position.x,position.z));
    if(i>60 && velocity.z>.03)returned=true;
    const energy=Math.hypot(velocity.x,velocity.y,velocity.z)+Math.hypot(spin.x,spin.y,spin.z);
    if(i<120*3)earlyEnergy+=energy;
    if(i>=120*11)lateEnergy+=energy;
  }
  assert.ok(maxDistance>.08 && maxDistance<1.3);
  assert.ok(returned,'bag did not swing back');
  assert.ok(lateEnergy<earlyEnergy*.3,`${lateEnergy} >= ${earlyEnergy}`);
  f.world.free();
});

test('dynamic bag collides with surrounding walls under repeated impacts',()=>{
  const f=fixture();
  f.world.createCollider(RAPIER.ColliderDesc.cuboid(4,2,.05).setTranslation(0,1,-.65));
  let contacts=0;
  for(let i=0;i<120*5;i++) {
    if(i%40===0)f.boxing.body.applyImpulse({x:0,y:0,z:-17},true);
    f.world.step();
    const p=f.boxing.body.translation();
    f.world.contactPairsWith(f.boxing.collider,()=>contacts++);
    assert.ok(p.z>-.62,'bag tunneled through wall');
  }
  assert.ok(contacts>0,'bag never reached wall');
  f.world.free();
});
