/** Original procedural arcade sounds. No recordings, remote assets or speech
 * services: every sample is generated locally, with a reproducible seed.
 */
export type SoundEffect='impact'|'effort'|'cheer'|'horn';
const durations:Record<SoundEffect,number>={impact:.19,effort:.43,cheer:1.65,horn:1.42};

export function synthesize(effect:SoundEffect,seed=1,sampleRate=22050):Float32Array {
  const length=Math.ceil(durations[effect]*sampleRate),out=new Float32Array(length);
  let state=seed>>>0 || 1;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const noise=()=>random()*2-1;
  const add=(at:number,samples:Float32Array,gain=1)=>{const start=Math.round(at*sampleRate);
    for(let i=0;i<samples.length && start+i<length;i++)out[start+i]+=samples[i]*gain;};
  const bandpass=(samples:Float32Array,frequency:number,q:number)=>{
    const w=2*Math.PI*frequency/sampleRate,alpha=Math.sin(w)/(2*q),a0=1+alpha;
    const b0=alpha/a0,b2=-b0,a1=-2*Math.cos(w)/a0,a2=(1-alpha)/a0;
    let x1=0,x2=0,y1=0,y2=0;
    return samples.map(x=>{const y=b0*x+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;});
  };
  const voice=(duration:number,pitch:number,cheering:boolean)=>{
    const n=Math.ceil(duration*sampleRate),raw=new Float32Array(n);let phase=random();
    for(let i=0;i<n;i++) {
      const t=i/sampleRate,u=t/duration;
      const f=pitch*(cheering?1+.55*Math.sin(Math.PI*u)-.1*u:1.12-.3*u)*(1+.025*Math.sin(2*Math.PI*6*t));
      phase+=f/sampleRate;
      // Harmonic glottal pulse, softened by vocal-tract resonances below.
      raw[i]=(2*(phase%1)-1)*.7+noise()*.12;
    }
    const formants=cheering?[380,850,2400]:[560,1100,2500];
    const filtered=formants.map(f=>bandpass(raw,f,cheering?4:3));
    return raw.map((_,i)=>{
      const u=i/n,envelope=Math.pow(Math.sin(Math.PI*u),cheering?.8:1.2);
      return (filtered[0][i]*2.5+filtered[1][i]*1.6+filtered[2][i]*.55)*envelope;
    });
  };

  if(effect==='impact') {
    let low=0,phase=0;
    for(let i=0;i<length;i++) {
      const t=i/sampleRate;low+=.16*(noise()-low);phase+=2*Math.PI*(55+90*Math.exp(-t*35))/sampleRate;
      out[i]=(Math.sin(phase)*Math.exp(-t*26)*.85+low*Math.exp(-t*48)*1.8+noise()*Math.exp(-t*120)*.3)*Math.min(1,t/.002);
    }
  } else if(effect==='effort') {
    add(0,voice(.36,95+random()*30,false),1.2);
    let breath=0;
    for(let i=0;i<length;i++){const t=i/sampleRate;breath+=.2*(noise()-breath);out[i]+=breath*.25*Math.sin(Math.PI*i/length)*Math.exp(-t*2);}
  } else if(effect==='cheer') {
    for(let i=0;i<8;i++)add(random()*.35,voice(.65+random()*.65,180+random()*210,true),.28);
    // A small crowd of claps beneath the rising "woo" voices.
    for(let clap=0;clap<22;clap++) {
      const at=.08+random()*1.35,samples=new Float32Array(Math.ceil(.065*sampleRate));
      for(let i=0;i<samples.length;i++)samples[i]=noise()*Math.exp(-i/sampleRate*75);
      add(at,bandpass(samples,1700,.7),.25);
    }
  } else {
    for(const [start,duration] of [[0,.16],[.23,.16],[.46,.88]]) {
      const n=Math.ceil(duration*sampleRate),samples=new Float32Array(n);
      const phases=[0,0,0];
      for(let i=0;i<n;i++) {
        const t=i/sampleRate,u=t/duration,env=Math.min(1,t/.012)*Math.min(1,(duration-t)/.06);
        let sum=0;
        for(let v=0;v<3;v++) {
          phases[v]+=2*Math.PI*[233.08,293.66,349.23][v]*(1+.008*Math.sin(t*31+v)-.025*u)/sampleRate;
          for(let h=1;h<=8;h++)sum+=Math.sin(phases[v]*h)/Math.pow(h,1.25);
        }
        samples[i]=sum*.2*env;
      }
      add(start,samples);
    }
  }
  // Consistent headroom per effect plus short fades to avoid edge clicks.
  let peak=0;for(const value of out)peak=Math.max(peak,Math.abs(value));
  const gain=peak?Math.min(2,.78/peak):1,fade=Math.round(sampleRate*.004);
  for(let i=0;i<length;i++)out[i]*=gain*Math.min(1,i/fade,(length-1-i)/fade);
  return out;
}

export interface HitSoundEvent { combo:number; time:number }
export class HitSoundRules {
  private recent:number[]=[];
  private lastEffort=-Infinity;
  private lastTime=-Infinity;
  reset(){this.recent=[];this.lastEffort=-Infinity;this.lastTime=-Infinity;}
  hit({combo,time}:HitSoundEvent):SoundEffect[] {
    if(time<this.lastTime)this.reset();this.lastTime=time;
    this.recent=this.recent.filter(t=>time-t<4);this.recent.push(time);
    const sounds:SoundEffect[]=['impact'];
    // Milestones occur on hit events, never by polling a displayed counter.
    if(combo>=10 && combo%10===0)sounds.push('horn');
    else if(combo>=5 && combo%5===0)sounds.push('cheer');
    else if(this.recent.length>=4 && time-this.lastEffort>=2.5){sounds.push('effort');this.lastEffort=time;}
    return sounds;
  }
}
