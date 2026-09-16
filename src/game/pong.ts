const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export class Pong {
 ball={x:.5,y:.5,vx:.68,vy:.24};
 player=.5;opponent=.5;scores=[0,0];serve=1;winner='';hits=0;
 reset(){this.player=this.opponent=.5;this.scores=[0,0];this.winner='';this.hits=0;this.newBall(1);}
 private newBall(direction:number){this.ball={x:.5,y:.5,vx:direction*.68,vy:(this.scores[0]+this.scores[1])%2?.23:-.23};this.serve=1;}
 step(dt:number,target:number){
  if(this.winner)return;
  let remaining=clamp(dt,0,.1);
  while(remaining>0){const t=Math.min(remaining,1/240);remaining-=t;
   this.player+=clamp(clamp(target,.10,.90)-this.player,-1.65*t,1.65*t);
   const aim=this.ball.vx>0?this.ball.y:.5;
   this.opponent=clamp(this.opponent+clamp(aim-this.opponent,-.48*t,.48*t),.10,.90);
   if(this.serve>0){this.serve=Math.max(0,this.serve-t);continue;}
   const b=this.ball,old=b.x;b.x+=b.vx*t;b.y+=b.vy*t;
   if(b.y<.02){b.y=.04-b.y;b.vy=Math.abs(b.vy);}if(b.y>.98){b.y=1.96-b.y;b.vy=-Math.abs(b.vy);}
   const bounce=(p:number,direction:number)=>{b.x=direction===1?.06:.94;const angle=clamp((b.y-p)/.11,-1,1);b.vx=direction*Math.min(1.4,Math.abs(b.vx)*1.055);b.vy=angle*.82;this.hits++;};
   if(b.vx<0&&old>=.06&&b.x<=.06&&Math.abs(b.y-this.player)<=.115)bounce(this.player,1);
   if(b.vx>0&&old<=.94&&b.x>=.94&&Math.abs(b.y-this.opponent)<=.115)bounce(this.opponent,-1);
   if(b.x<-.025||b.x>1.025){const who=b.x>1?0:1;this.scores[who]++;if(this.scores[who]>=5){this.winner=who===0?'Du gewinnst!':'Der PC gewinnt!';return;}this.newBall(who===0?-1:1);}
  }
 }
}
