/** Regulation board dimensions in metres; x right, y up, 20 at twelve o'clock. */
export const DART_NUMBERS=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
export function dartScore(x:number,y:number){
 const r=Math.hypot(x,y);
 if(!Number.isFinite(r)||r>.170)return {points:0,label:'Daneben'};
 if(r<=.00635)return {points:50,label:'Bullseye'};
 if(r<=.0159)return {points:25,label:'Bull'};
 const sector=Math.floor(((Math.atan2(x,y)+Math.PI/20+Math.PI*2)%(Math.PI*2))/(Math.PI/10));
 const n=DART_NUMBERS[sector],multiplier=r>=.162?2:r>=.099&&r<=.107?3:1;
 return {points:n*multiplier,label:`${multiplier===3?'Triple ':multiplier===2?'Double ':''}${n}`};
}
export class Darts {
 hits:{x:number;y:number;points:number;label:string}[]=[];
 get finished(){return this.hits.length===9;}
 get score(){return this.hits.reduce((sum,h)=>sum+h.points,0);}
 reset(){this.hits=[];}
 throw(x:number,y:number){if(this.finished)return;const hit={x,y,...dartScore(x,y)};this.hits.push(hit);return hit;}
}
