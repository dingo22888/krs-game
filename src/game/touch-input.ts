import {idleInput} from './player.ts';
import type {MovementInput} from './player.ts';

export type TouchRole='move'|'look'|'jump'|'crouch'|'left'|'right';
export type InputMode='auto'|'touch'|'mouse';
export function useTouch(mode:InputMode,coarse:boolean,pointerLock:boolean) {
  return mode==='touch'||(mode==='auto'&&(coarse||!pointerLock));
}
export function joystick(x:number,y:number,radius:number) {
  const distance=Math.hypot(x,y),amount=Math.min(1,distance/Math.max(1,radius));
  const strength=amount<.12?0:(amount-.12)/.88;
  return {right:strength?x/distance*strength:0,forward:strength?-y/distance*strength:0,sprint:amount>.9,
    x:distance?x/distance*Math.min(distance,radius):0,y:distance?y/distance*Math.min(distance,radius):0};
}

/** Pointer ownership is per finger, never per primary touch. */
export class TouchInput {
  private pointers=new Map<number,{role:TouchRole;x:number;y:number;radius:number}>();
  private movement=idleInput();
  private jumpQueued=false;
  private jumpHeld=false;
  onLook:(x:number,y:number)=>void=()=>{};
  onPunch:(hand:'left'|'right')=>void=()=>{};
  onStick:(x:number,y:number,sprint:boolean)=>void=()=>{};
  onCrouch:(active:boolean)=>void=()=>{};
  begin(id:number,role:TouchRole,x:number,y:number,radius=1) {
    if(this.pointers.has(id)||[...this.pointers.values()].some(p=>p.role===role))return false;
    this.pointers.set(id,{role,x,y,radius});
    if(role==='jump'){this.jumpQueued=true;this.jumpHeld=true;}
    if(role==='crouch'){this.movement.crouch=!this.movement.crouch;this.onCrouch(this.movement.crouch);}
    if(role==='left'||role==='right')this.onPunch(role);
    return true;
  }
  move(id:number,x:number,y:number) {
    const p=this.pointers.get(id);if(!p)return;
    if(p.role==='move') {
      const stick=joystick(x-p.x,y-p.y,p.radius);
      Object.assign(this.movement,{forward:stick.forward,right:stick.right,sprint:stick.sprint});
      this.onStick(stick.x,stick.y,stick.sprint);
    } else if(p.role==='look') {
      this.onLook(x-p.x,y-p.y);p.x=x;p.y=y;
    }
  }
  end(id:number,cancelled=false) {
    const p=this.pointers.get(id);if(!p)return;
    this.pointers.delete(id);
    if(p.role==='move'){this.movement.forward=0;this.movement.right=0;this.movement.sprint=false;this.onStick(0,0,false);}
    if(p.role==='jump'){this.jumpHeld=false;if(cancelled)this.jumpQueued=false;}
  }
  sample():MovementInput {
    const input={...this.movement,jump:this.jumpHeld||this.jumpQueued};this.jumpQueued=false;return input;
  }
  reset() {
    this.pointers.clear();this.movement=idleInput();this.jumpQueued=false;this.jumpHeld=false;
    this.onStick(0,0,false);this.onCrouch(false);
  }
}

export class TouchControls {
  readonly input=new TouchInput();
  private enabled=false;
  private root:HTMLElement;
  constructor(root:HTMLElement,look:(x:number,y:number)=>void,punch:(hand:'left'|'right')=>void) {
    this.root=root;
    this.input.onLook=look;this.input.onPunch=punch;
    this.input.onStick=(x,y,fast)=>{
      root.querySelector<HTMLElement>('.stick-knob')!.style.transform=`translate(${x}px,${y}px)`;
      root.querySelector('[data-touch="move"]')!.classList.toggle('sprinting',fast);
    };
    this.input.onCrouch=active=>root.querySelector('[data-touch="crouch"]')!.setAttribute('aria-pressed',String(active));
    for(const element of root.querySelectorAll<HTMLElement>('[data-touch]')) {
      const role=element.dataset.touch as TouchRole;
      element.addEventListener('pointerdown',event=>{
        if(!this.enabled||event.button>0)return;
        event.preventDefault();
        const bounds=element.getBoundingClientRect(),isStick=role==='move';
        if(!this.input.begin(event.pointerId,role,isStick?bounds.x+bounds.width/2:event.clientX,isStick?bounds.y+bounds.height/2:event.clientY,bounds.width*.34))return;
        element.setPointerCapture(event.pointerId);element.classList.add('pressed');
        if(isStick)this.input.move(event.pointerId,event.clientX,event.clientY);
      });
      element.addEventListener('pointermove',event=>{if(this.enabled){event.preventDefault();this.input.move(event.pointerId,event.clientX,event.clientY);}});
      const end=(event:PointerEvent)=>{
        this.input.end(event.pointerId,event.type!=='pointerup');
        element.classList.remove('pressed');
      };
      element.addEventListener('pointerup',end);element.addEventListener('pointercancel',end);element.addEventListener('lostpointercapture',end);
      element.addEventListener('contextmenu',event=>event.preventDefault());
    }
  }
  reset() {
    this.input.reset();
    this.root.querySelectorAll('.pressed').forEach(e=>e.classList.remove('pressed'));
  }
  setEnabled(enabled:boolean) {this.enabled=enabled;this.root.hidden=!enabled;if(!enabled)this.reset();}
  setTraining(training:boolean) {this.root.querySelector<HTMLElement>('.touch-fists')!.hidden=!training;}
}
