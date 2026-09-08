import {HitSoundRules,synthesize} from './sound-effects.ts';
import type {SoundEffect} from './sound-effects.ts';
import type {BoxingHit} from './boxing.ts';

const STORAGE_KEY='krs-audio-v1';
export class GameAudio {
  volume=.55;
  muted=false;
  private context?:AudioContext;
  private master?:GainNode;
  private playing=false;
  private sources=new Set<AudioBufferSourceNode>();
  private buffers=new Map<string,AudioBuffer>();
  private rules=new HitSoundRules();
  private counter=0;
  private lastCelebration={cheer:-Infinity,horn:-Infinity};

  constructor() {
    try {
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null');
      if(typeof saved?.volume==='number' && Number.isFinite(saved.volume))this.volume=Math.max(0,Math.min(1,saved.volume));
      if(typeof saved?.muted==='boolean')this.muted=saved.muted;
    } catch { /* Storage is optional. */ }
  }

  /** Called synchronously from a click; a denied audio context cannot stop play. */
  unlock() {
    if(this.muted || this.volume===0)return;
    try {
      if(!this.context) {
        this.context=new AudioContext();
        this.master=this.context.createGain();
        const compressor=this.context.createDynamicsCompressor();
        compressor.threshold.value=-8;compressor.knee.value=12;compressor.ratio.value=6;
        compressor.attack.value=.003;compressor.release.value=.15;
        this.master.connect(compressor);compressor.connect(this.context.destination);
        this.updateGain();
      }
      void this.context.resume().catch(()=>{});
    } catch { /* The game remains usable without Web Audio. */ }
  }

  setPlaying(playing:boolean) {
    this.playing=playing;
    if(!playing){this.stop();this.rules.reset();}
  }
  reset() {this.stop();this.rules.reset();this.lastCelebration={cheer:-Infinity,horn:-Infinity};}
  setVolume(volume:number){this.volume=Math.max(0,Math.min(1,Number.isFinite(volume)?volume:0));this.settingsChanged();}
  setMuted(muted:boolean){this.muted=muted;this.settingsChanged();}
  private settingsChanged() {
    if(this.muted || !this.volume)this.stop();
    this.updateGain();
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify({volume:this.volume,muted:this.muted}));} catch { /* Optional. */ }
  }
  private updateGain() {
    if(this.context && this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume*.55,this.context.currentTime,.015);
  }
  hit(hit:BoxingHit) {
    const effects=this.rules.hit(hit);
    if(!this.playing || this.muted || !this.volume || this.context?.state!=='running')return;
    try {
      for(const effect of effects) {
        if(effect==='cheer'||effect==='horn') {
          if(this.context.currentTime-this.lastCelebration[effect]<1.6)continue;
          this.lastCelebration[effect]=this.context.currentTime;
        }
        this.play(effect,effect==='impact'?(hit.hand==='left'?-.18:.18):0);
      }
    } catch { /* Audio must never interrupt the physics loop. */ }
  }
  private play(effect:SoundEffect,pan:number) {
    if(!this.context || !this.master || this.sources.size>=12)return;
    const variant=this.counter++%3,key=`${effect}-${variant}`;
    let buffer=this.buffers.get(key);
    if(!buffer) {
      const samples=synthesize(effect,variant+1);
      buffer=this.context.createBuffer(1,samples.length,22050);buffer.getChannelData(0).set(samples);this.buffers.set(key,buffer);
    }
    const source=this.context.createBufferSource(),gain=this.context.createGain(),panner=this.context.createStereoPanner();
    source.buffer=buffer;source.playbackRate.value=effect==='impact'?.94+Math.random()*.12:1;
    gain.gain.value=({impact:.9,effort:.48,cheer:.54,horn:.46})[effect];panner.pan.value=pan;
    source.connect(gain);gain.connect(panner);panner.connect(this.master);
    this.sources.add(source);
    source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();panner.disconnect();};
    source.start(this.context.currentTime+(effect==='impact'?0:.045));
  }
  private stop() {
    for(const source of this.sources){try{source.stop();}catch{/* Already stopped. */}}
    this.sources.clear();
  }
  dispose(){this.stop();void this.context?.close().catch(()=>{});this.buffers.clear();}
}
