import RAPIER from '@dimforge/rapier3d-compat';

export const FIXED_DT = 1/120;
export const PLAYER = {
  radius:.23, standingHeight:1.8, crouchingHeight:1.1,
  walkSpeed:2.3, sprintSpeed:4.4, crouchSpeed:1.15,
  gravity:18, jumpSpeed:5.7, skin:.012, stanceSharpness:14,
} as const;
export interface MovementInput { forward:number; right:number; sprint:boolean; crouch:boolean; jump:boolean }
export const idleInput = (): MovementInput => ({forward:0,right:0,sprint:false,crouch:false,jump:false});
export interface ClimbRegion { x0:number;z0:number;x1:number;z1:number;bottom:number;top:number;maxSlope:number }

export class Player {
  readonly world: RAPIER.World;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  height:number = PLAYER.standingHeight;
  verticalVelocity = 0;
  grounded = false;
  crouched = false;
  speed = 0;
  private vx = 0;
  private vz = 0;
  private jumpHeld = false;
  private climbRegions:ClimbRegion[];

  constructor(world:RAPIER.World, x:number, z:number, elevation=0, climbRegions:ClimbRegion[]=[]) {
    this.world = world;
    this.climbRegions=climbRegions;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x,elevation+.03,z));
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(this.height/2-PLAYER.radius,PLAYER.radius)
        .setTranslation(0,this.height/2,0).setFriction(0), this.body,
    );
    this.controller = world.createCharacterController(PLAYER.skin);
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(56*Math.PI/180);
    this.controller.setMinSlopeSlideAngle(Math.PI/3);
    // Narrow/winding treads need a shorter clearance probe than broad landings.
    // The capsule still has to fit, and the maximum riser remains 21 cm.
    this.controller.enableAutostep(.21,.07,false);
    this.controller.enableSnapToGround(.18);
    world.timestep = FIXED_DT;
    world.step();
  }

  private updateStance(wantsCrouch:boolean, dt:number) {
    const target = wantsCrouch ? PLAYER.crouchingHeight : PLAYER.standingHeight;
    this.crouched = wantsCrouch || this.height < PLAYER.standingHeight;
    if (target === this.height) return;
    const feet = this.body.translation();
    if (target > this.height) {
      const standingShape = new RAPIER.Capsule(target/2-PLAYER.radius,PLAYER.radius);
      const obstruction = this.world.intersectionWithShape(
        {x:feet.x,y:feet.y+target/2,z:feet.z},
        {x:0,y:0,z:0,w:1},standingShape,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.collider,this.body,
      );
      if (obstruction) return; // Remain crouched until there is headroom.
    }
    // Feet remain fixed while the actual capsule changes height smoothly.
    // Camera interpolation uses this same height, so it cannot lag above the head.
    const blended = target+(this.height-target)*Math.exp(-PLAYER.stanceSharpness*dt);
    const next = Math.abs(blended-target)<.001 ? target : blended;
    this.height = next;
    this.crouched = wantsCrouch || next < PLAYER.standingHeight;
    this.collider.setShape(new RAPIER.Capsule(next/2-PLAYER.radius,PLAYER.radius));
    this.collider.setTranslationWrtParent({x:0,y:next/2,z:0});
    // Relative transforms are propagated at world.step(); the movement query
    // below needs the new world transform now, before that step happens.
    this.collider.setTranslation({x:feet.x,y:feet.y+next/2,z:feet.z});
  }

  step(input:MovementInput, yaw:number, dt = FIXED_DT) {
    const feet=this.body.translation();
    const region=this.climbRegions.find(r=>feet.x>=r.x0&&feet.x<=r.x1&&feet.z>=r.z0&&feet.z<=r.z1&&feet.y>=r.bottom&&feet.y<=r.top);
    const slope=region?.maxSlope??56;
    this.controller.setMaxSlopeClimbAngle(slope*Math.PI/180);
    this.controller.setMinSlopeSlideAngle(Math.min(89,slope+4)*Math.PI/180);
    this.updateStance(input.crouch,dt);
    const speed = this.crouched ? PLAYER.crouchSpeed : input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const norm = Math.max(1,Math.hypot(input.forward,input.right));
    const forward = input.forward/norm, right = input.right/norm;
    const targetX = (right*Math.cos(yaw)-forward*Math.sin(yaw))*speed;
    const targetZ = (-right*Math.sin(yaw)-forward*Math.cos(yaw))*speed;
    const smoothing = 1-Math.exp(-22*dt);
    this.vx += (targetX-this.vx)*smoothing;
    this.vz += (targetZ-this.vz)*smoothing;
    if (input.jump && !this.jumpHeld && this.grounded && !this.crouched) {
      this.verticalVelocity = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    this.jumpHeld = input.jump;
    this.verticalVelocity = Math.max(this.verticalVelocity-PLAYER.gravity*dt,-25);
    const desired = {x:this.vx*dt,y:this.verticalVelocity*dt,z:this.vz*dt};
    this.controller.computeColliderMovement(this.collider,desired,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const movement = this.controller.computedMovement();
    const pos = this.body.translation();
    this.body.setNextKinematicTranslation({x:pos.x+movement.x,y:pos.y+movement.y,z:pos.z+movement.z});
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = 0;
    if (this.verticalVelocity > 0 && movement.y < desired.y-1e-4) this.verticalVelocity = 0;
    this.speed = Math.hypot(movement.x,movement.z)/dt;
    this.world.timestep = dt;
    this.world.step();
  }

  stop() {
    this.vx = 0; this.vz = 0; this.speed = 0; this.jumpHeld = false;
  }

  dispose() {
    this.world.removeCharacterController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
