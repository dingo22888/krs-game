/** Small fixed-step arcade racer. Same traffic pattern for every attempt. */
export class Racing {
 time=0;distance=0;x=0;speed=0;collisions=0;cooldown=0;private spawn=0;private sequence=0;
 cars:{x:number;y:number;passed:boolean}[]=[];
 get finished(){return this.time>=60;}
 reset(){this.time=0;this.distance=0;this.x=0;this.speed=0;this.collisions=0;this.cooldown=0;this.spawn=0;this.sequence=0;this.cars=[];}
 step(dt:number,steer:number,pedal=0){
  if(this.finished||!Number.isFinite(dt)||dt<=0)return;
  let left=Math.min(dt,.25);
  while(left>1e-8&&!this.finished){const t=Math.min(left,1/120,60-this.time);left-=t;this.time+=t;
   this.x=Math.max(-1.12,Math.min(1.12,this.x+Math.max(-1,Math.min(1,steer))*t*1.35));
   // Hold gas to accelerate; release to coast. Braking is deliberately stronger.
   const acceleration=pedal>0?9:pedal<0?-22:-1.8;
   this.speed=Math.max(0,Math.min(40,this.speed+acceleration*t));
   if(Math.abs(this.x)>.87&&this.speed>11)this.speed=Math.max(11,this.speed-32*t);
   this.distance+=this.speed*t;
   this.cooldown=Math.max(0,this.cooldown-t);this.spawn-=t;
   if(this.spawn<=0){const lanes=[-.57,.57,0,-.57,0,.57,.57,-.57];this.cars.push({x:lanes[this.sequence++%lanes.length],y:-.15,passed:false});this.spawn=1.65;}
   for(const car of this.cars){car.y+=t*(.20+this.speed*.014);if(!car.passed&&car.y>.76&&car.y<.94&&Math.abs(this.x-car.x)<.22&&this.cooldown===0){this.collisions++;this.speed*=.22;this.cooldown=1.2;car.passed=true;}}
   this.cars=this.cars.filter(c=>c.y<1.2);
  }
 }
 result(){return {distance:Math.floor(this.distance),collisions:this.collisions};}
}
