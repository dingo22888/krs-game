import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, Quaternion, Euler } from 'three';
import type { BoxingLocation } from './activities.ts';

export type Hand = 'left'|'right';
export interface BoxingPose { eye:RAPIER.Vector; yaw:number; pitch:number; body:RAPIER.RigidBody }
export const BAG = {radius:.26,height:1.1,mass:32,impulse:17,extension:.13,duration:.36} as const;
const hands:Hand[]=['left','right'];
const identity={x:0,y:0,z:0,w:1};

export function fistPosition(hand:Hand,age:number) {
  const extension=age<0?0:age<BAG.extension?age/BAG.extension:Math.max(0,1-(age-BAG.extension)/(BAG.duration-BAG.extension));
  const eased=extension*extension*(3-2*extension);
  return new Vector3((hand==='left'?-1:1)*(.24-.10*eased),-.25+.07*eased,-.32-.75*eased);
}

/** A heavy bag suspended by two ball joints, sharing the player's fixed-step
 * world. There is no animation driving its transform: contacts apply impulses.
 */
export class Boxing {
  readonly world:RAPIER.World;
  readonly location:BoxingLocation;
  readonly body:RAPIER.RigidBody;
  readonly collider:RAPIER.Collider;
  readonly chain:RAPIER.RigidBody;
  readonly anchor:Vector3;
  readonly chainLength:number;
  readonly ages:Record<Hand,number>={left:-1,right:-1};
  readonly hits:Record<Hand,number>={left:0,right:0};
  combo=0;
  bestCombo=0;
  feedback='';
  flash=0;
  private resolved:Record<Hand,boolean>={left:false,right:false};
  private clock=0;
  private lastStart=-Infinity;
  private lastHit=-Infinity;
  private lastHand:Hand|null=null;

  constructor(world:RAPIER.World,location:BoxingLocation) {
    this.world=world;this.location=location;
    this.anchor=new Vector3(location.x,location.ceiling-.08,location.z);
    const center=location.y+1.12;
    this.chainLength=this.anchor.y-center-BAG.height/2;
    const fixed=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...this.anchor.toArray() as [number,number,number]));
    const dynamic=(y:number)=>RAPIER.RigidBodyDesc.dynamic().setTranslation(location.x,y,location.z)
      .setGravityScale(9.81/18).setLinearDamping(.2).setAngularDamping(.55).setCcdEnabled(true).setAdditionalSolverIterations(8);
    this.chain=world.createRigidBody(dynamic(this.anchor.y-this.chainLength/2));
    world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(.005,this.chainLength/2-.01),.01)
      .setMass(1).setSensor(true).setCollisionGroups(0),this.chain);
    this.body=world.createRigidBody(dynamic(center));
    this.collider=world.createCollider(RAPIER.ColliderDesc.cylinder(BAG.height/2,BAG.radius)
      .setMass(BAG.mass).setFriction(.65).setRestitution(.08),this.body);
    world.createImpulseJoint(RAPIER.JointData.spherical({x:0,y:0,z:0},{x:0,y:this.chainLength/2,z:0}),fixed,this.chain,true);
    world.createImpulseJoint(RAPIER.JointData.spherical({x:0,y:-this.chainLength/2,z:0},{x:0,y:BAG.height/2,z:0}),this.chain,this.body,true);
  }

  nearby(pose:BoxingPose) {
    const direction=new Vector3().copy(this.body.translation()).sub(pose.eye);
    const distance=direction.length();
    if(distance>2.4 || distance<.001)return false;
    const hit=this.world.castRay(new RAPIER.Ray(pose.eye,direction.normalize()),distance+.3,true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,pose.body);
    return hit?.collider.handle===this.collider.handle;
  }

  punch(hand:Hand,pose:BoxingPose) {
    if(!this.nearby(pose)||this.ages[hand]>=0||this.clock-this.lastStart<.10)return false;
    this.ages[hand]=0;this.resolved[hand]=false;this.lastStart=this.clock;
    return true;
  }

  cancel() { for(const hand of hands)this.ages[hand]=-1;this.combo=0;this.lastHand=null; }

  step(dt:number,pose:BoxingPose) {
    this.clock+=dt;this.flash=Math.max(0,this.flash-dt);
    if(this.clock-this.lastHit>1.4)this.combo=0;
    const rotation=new Quaternion().setFromEuler(new Euler(pose.pitch,pose.yaw,0,'YXZ'));
    for(const hand of hands) {
      const age=this.ages[hand];if(age<0)continue;
      const nextAge=age+dt;
      if(!this.resolved[hand] && age<BAG.extension) {
        const from=fistPosition(hand,0).applyQuaternion(rotation).add(pose.eye);
        const to=fistPosition(hand,Math.min(nextAge,BAG.extension)).applyQuaternion(rotation).add(pose.eye);
        // Check the eye-to-guard segment too: a glove starting beyond a thin
        // wall must never let a punch bypass that wall.
        const guard=from.clone().sub(pose.eye);
        const blocked=this.world.castRay(new RAPIER.Ray(pose.eye,guard),1,true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,pose.body);
        const hit=blocked?null:this.world.castShape(from,identity,to.clone().sub(from),new RAPIER.Ball(.095),0,1,true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,pose.body);
        if(blocked || hit) {
          this.resolved[hand]=true;
          if(hit?.collider.handle===this.collider.handle || blocked?.collider.handle===this.collider.handle) {
            const center=hit?from.clone().lerp(to,hit.time_of_impact):from;
            const contact=this.collider.projectPoint(center,false)?.point ?? center;
            const direction=new Vector3(0,0,-1).applyQuaternion(rotation);
            this.body.applyImpulseAtPoint(direction.multiplyScalar(BAG.impulse),contact,true);
            this.hits[hand]++;
            this.combo=this.lastHand!==hand && this.clock-this.lastHit<=1.4?this.combo+1:1;
            this.bestCombo=Math.max(this.bestCombo,this.combo);
            this.lastHand=hand;this.lastHit=this.clock;this.flash=.16;
            this.feedback=hand==='left'?'Links · Treffer':'Rechts · Treffer';
          } else {this.combo=0;this.feedback='Blockiert';}
        }
      }
      if(nextAge>=BAG.extension&&!this.resolved[hand]) {
        this.resolved[hand]=true;this.combo=0;this.feedback='Daneben · Abstand und Ziel prüfen';
      }
      this.ages[hand]=nextAge>=BAG.duration?-1:nextAge;
    }
  }
}
