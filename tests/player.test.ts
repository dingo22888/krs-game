import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Player, FIXED_DT, PLAYER, idleInput } from '../src/game/player.ts';
import type { MovementInput } from '../src/game/player.ts';
import { buildModel } from '../src/game/model.ts';
import { floors, floorOrder } from '../src/data/house.ts';
import { decomposePolygon, inPolygon } from '../src/game/geometry.ts';

before(async()=>{await RAPIER.init();});
const box = (world:RAPIER.World,x:number,y:number,z:number,w:number,h:number,d:number) => world.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2).setTranslation(x,y,z));
function fixture() {
  const world = new RAPIER.World({x:0,y:-18,z:0});
  box(world,0,-.1,0,40,.2,40);
  return world;
}
function run(player:Player,seconds:number,input:Partial<MovementInput>={},yaw=0) {
  for(let i=0;i<Math.round(seconds/FIXED_DT);i++)player.step({...idleInput(),...input},yaw);
}

test('walking, strafing, yaw and diagonal speed stay consistent',()=>{
  const distances:number[]=[];
  for(const input of [{forward:1},{right:1},{forward:1,right:1}]) {
    const world=fixture(), player=new Player(world,0,0);
    run(player,.2);
    run(player,2,input);
    const p=player.body.translation(); distances.push(Math.hypot(p.x,p.z));
    if(input.forward===1 && !input.right)assert.ok(p.z < -4.3 && Math.abs(p.x)<.01);
    world.free();
  }
  assert.ok(Math.max(...distances)-Math.min(...distances)<.03);
  const world=fixture(),player=new Player(world,0,0);
  run(player,1,{forward:1},Math.PI/2);
  assert.ok(player.body.translation().x < -2 && Math.abs(player.body.translation().z)<.01);
  world.free();
});

test('held Shift increases speed; held Ctrl reduces capsule and speed',()=>{
  const results:number[]=[];
  for(const input of [{},{sprint:true},{crouch:true}]) {
    const world=fixture(),player=new Player(world,0,0);
    run(player,2,{forward:1,...input});results.push(-player.body.translation().z);
    if(input.crouch) {assert.equal(player.height,PLAYER.crouchingHeight);assert.ok(player.body.translation().y<.05);}
    world.free();
  }
  assert.ok(results[1]>results[0]*1.8);
  assert.ok(results[2]<results[0]*.55);
});

test('sprint stops at a thin wall and slides along it',()=>{
  const world=fixture();box(world,0,1.3,-2,12,2.6,.03);
  const player=new Player(world,0,0);
  run(player,2,{forward:1,right:1,sprint:true});
  const p=player.body.translation();
  assert.ok(p.z > -1.77,`tunneled: ${p.z}`);
  assert.ok(p.x > 5,`did not slide: ${p.x}`);
  world.free();
});

test('objects stop movement and a sufficiently wide doorway is traversable',()=>{
  const world=fixture();box(world,-2,1.3,-2,3,2.6,.25);box(world,2,1.3,-2,3,2.6,.25);
  box(world,0,.5,-5,2,1,1);
  const player=new Player(world,0,0);
  run(player,3,{forward:1});
  assert.ok(player.body.translation().z < -3,'doorway blocked');
  assert.ok(player.body.translation().z > -4.3,'walked through furniture');
  world.free();
});

test('jump rises, lands and does not repeat while Space remains held',()=>{
  const world=fixture(),player=new Player(world,0,0);run(player,.2);
  let apex=0;
  for(let i=0;i<240;i++){player.step({...idleInput(),jump:true},0);apex=Math.max(apex,player.body.translation().y);}
  assert.ok(apex>.75 && apex<1.05,`apex ${apex}`);
  assert.ok(player.grounded && player.body.translation().y<.04);
  player.step(idleInput(),0);player.step({...idleInput(),jump:true},0);
  assert.ok(player.verticalVelocity>0);
  world.free();
});

test('jump hits a ceiling without penetrating it',()=>{
  const world=fixture();box(world,0,2.1,0,6,.2,6);
  const player=new Player(world,0,0);run(player,.2);
  let top=0;
  for(let i=0;i<100;i++){player.step({...idleInput(),jump:i<2},0);top=Math.max(top,player.body.translation().y+player.height);}
  assert.ok(top<=2.005,`ceiling penetration: ${top}`);
  assert.ok(player.grounded);
  world.free();
});

test('crouch passes under a low obstacle; standing is blocked until clear',()=>{
  const world=fixture();box(world,0,1.5,-2.1,3,.5,2.0);
  const player=new Player(world,0,0);run(player,.2);
  run(player,.6,{forward:1});assert.ok(player.body.translation().z>-.88,'standing passed low clearance');
  run(player,1.4,{forward:1,crouch:true});
  assert.ok(player.body.translation().z < -1.5,'crouching did not pass');
  run(player,.2);
  assert.ok(player.crouched,'stood inside obstacle');
  run(player,2,{forward:1,crouch:true});run(player,.2);
  assert.equal(player.height,PLAYER.standingHeight);
  world.free();
});

test('capsule steps over a 17 cm riser but cannot step onto a 60 cm block',()=>{
  const world=fixture();box(world,0,.085,-1.5,3,.17,1);box(world,0,.3,-3,3,.6,1);
  const player=new Player(world,0,0);run(player,.2);run(player,2,{forward:1});
  const p=player.body.translation();assert.ok(p.z< -1.8 && p.z> -2.28,`unexpected step movement ${JSON.stringify(p)}`);
  world.free();
});

test('fixed-step movement is identical at 30, 60 and 144 rendered frames per second',()=>{
  const positions:number[]=[];
  for(const fps of [30,60,144]) {
    const world=fixture(),player=new Player(world,0,0);let acc=0;
    for(let i=0;i<fps*3;i++){acc+=1/fps;while(acc>=FIXED_DT-1e-10){player.step({...idleInput(),forward:1,sprint:true},0);acc-=FIXED_DT;}}
    positions.push(player.body.translation().z);world.free();
  }
  assert.ok(Math.max(...positions)-Math.min(...positions)<1e-4);
});

test('rectangle decomposition preserves the area of an L-shaped wall',()=>{
  const rects=decomposePolygon([[0,0],[3,0],[3,.2],[.2,.2],[.2,2],[0,2]]);
  const area=rects.reduce((a,r)=>a+(r[2]-r[0])*(r[3]-r[1]),0);
  assert.ok(Math.abs(area-.96)<1e-8);
});

for(const id of floorOrder) {
  test(`${id.toUpperCase()}: spawn, room access and closed external openings`,()=>{
    const plan=floors[id],world=new RAPIER.World({x:0,y:-18,z:0});
    const model=buildModel(plan);
    for(const b of model)if(b.collision)box(world,...b.position,...b.size);
    const player=new Player(world,plan.spawn.x,plan.spawn.z);run(player,.5);
    const pos=player.body.translation();
    assert.ok(inPolygon(pos.x,pos.z,plan.footprint));
    assert.ok(player.grounded && pos.y<.05,`bad spawn ${JSON.stringify(pos)}`);
    assert.equal(world.intersectionWithShape({x:pos.x,y:pos.y+player.height/2,z:pos.z},{x:0,y:0,z:0,w:1},player.collider.shape,undefined,undefined,player.collider,player.body),null,'spawn intersects a solid');
    // Grid pathfinding over the actual collision shapes catches accidentally sealed
    // doorways and furniture blocking a complete room, on every test level.
    const step=.16, radius=.23, maxX=Math.max(...plan.footprint.map(p=>p[0])),maxZ=Math.max(...plan.footprint.map(p=>p[1]));
    const nx=Math.ceil(maxX/step),nz=Math.ceil(maxZ/step);
    const passable=new Map<string,boolean>();
    const shape=new RAPIER.Capsule(PLAYER.standingHeight/2-radius,radius);
    const isOpen=(x:number,z:number)=>{
      if(x<0||z<0||x>=nx||z>=nz)return false;
      const key=`${x},${z}`;
      if(!passable.has(key))passable.set(key,inPolygon(x*step,z*step,plan.footprint) && !world.intersectionWithShape({x:x*step,y:.03+PLAYER.standingHeight/2,z:z*step},{x:0,y:0,z:0,w:1},shape,undefined,undefined,player.collider,player.body));
      return passable.get(key)!;
    };
    const queue:[[number,number]]=[[Math.round(pos.x/step),Math.round(pos.z/step)]];
    const seen=new Set<string>(),roomsReached=new Set<string>();
    for(let i=0;i<queue.length;i++){
      const [x,z]=queue[i],key=`${x},${z}`;if(seen.has(key)||!isOpen(x,z))continue;seen.add(key);
      for(const room of plan.rooms)if(inPolygon(x*step,z*step,room.polygon))roomsReached.add(room.name);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])queue.push([x+dx,z+dz]);
    }
    const expectedRooms=plan.rooms.map(r=>r.name);
    assert.deepEqual(expectedRooms.filter(name=>!roomsReached.has(name)),[],`inaccessible rooms; reached ${[...roomsReached]}`);
    assert.ok(model.filter(b=>b.material==='glass').length>0);
    world.free();
  });
}
