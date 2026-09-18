import { account } from './account.ts';
import type { PongView } from '../game/pong-view.ts';
import type { Chalkboard } from '../game/chalkboard.ts';
import type { Boxing, BoxingHit } from '../game/boxing.ts';

type Game = 'pong' | 'boxing' | 'tic-tac-toe';
const labels: Record<Game,string> = { pong:'Pong', boxing:'Boxtraining', 'tic-tac-toe':'Tic-Tac-Toe' };
const rules: Record<Game,string> = {
  pong:'Partie bis 5. Siege vor Niederlagen, danach Punktedifferenz.',
  boxing:'60 Sekunden: längste abwechselnde Serie, danach Trefferzahl. Pausieren bricht die Wertung ab.',
  'tic-tac-toe':'10 Partien, abwechselndes Startrecht: Sieg 3, Remis 1, Niederlage 0 Punkte.',
};
type Run = { id:string; game:Game; start:number; hits:number; combo:number };
export class Scoreboard {
  private run?:Run;
  private generation=0;
  private busy=false;
  private buttons:HTMLButtonElement[]=[];
  private pending?:{run:Run;result:unknown};
  private notice=document.createElement('aside');
  private noticeText=document.createElement('span');
  private retry=document.createElement('button');
  private dialog=document.createElement('dialog');
  private entries=document.createElement('div');
  private selection=document.createElement('select');
  private listGeneration=0;
  private boxingButton?:HTMLButtonElement;
  private boxingBegin?:()=>void;
  private boxingStarting=false;
  private bufferedHits:BoxingHit[]=[];
  private suspendedAt=0;
  onShow=()=>{};
  onClose=async()=>true;
  get isOpen(){return this.dialog.open;}
  constructor(){
    this.notice.className='score-notice';this.notice.hidden=true;this.notice.setAttribute('role','status');
    this.retry.type='button';this.retry.textContent='Erneut speichern';this.retry.hidden=true;
    this.retry.addEventListener('click',()=>{if(this.pending)void this.save(this.pending);});
    const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Wertungshinweis schließen');close.addEventListener('click',()=>{this.notice.hidden=true;});
    const ranks=document.createElement('button');ranks.type='button';ranks.textContent='Highscores';ranks.addEventListener('click',()=>this.show());
    this.notice.append(this.noticeText,this.retry,ranks,close);document.body.append(this.notice);
    this.dialog.className='leaderboard';this.dialog.setAttribute('aria-label','Highscores');
    const title=document.createElement('h2');title.textContent='Hausrekorde';
    const label=document.createElement('label');label.textContent='Minispiel ';label.append(this.selection);
    for(const game of Object.keys(labels) as Game[]){const option=document.createElement('option');option.value=game;option.textContent=labels[game];this.selection.append(option);}
    const done=document.createElement('button');done.type='button';done.textContent='Weiter spielen';
    const closeScores=async()=>{
      if(!await this.onClose()){done.textContent='Zum Fortsetzen hier klicken';return;}
      if(this.run&&this.suspendedAt)this.run.start+=performance.now()-this.suspendedAt;
      this.suspendedAt=0;this.dialog.close();
    };
    done.addEventListener('click',()=>{void closeScores();});
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();void closeScores();});
    this.dialog.append(title,label,this.entries,done);document.body.append(this.dialog);
    this.selection.addEventListener('change',()=>{void this.loadList();});
    document.addEventListener('keydown',e=>{if(!this.isOpen&&e.code==='KeyB'&&!e.repeat&&document.pointerLockElement&&this.boxingButton&&!this.boxingButton.hidden&&!this.boxingButton.disabled){e.preventDefault();this.boxingButton.click();}});
  }
  private message(text:string){this.noticeText.textContent=text;this.notice.hidden=false;}
  private button(container:HTMLElement,game:Game,begin:()=>void){
    const button=document.createElement('button');button.type='button';button.textContent=game==='boxing'?'B · 60-Sekunden-Wertung':game==='pong'?'Gewertete Partie':'10-Partien-Wertung';
    button.title=rules[game];
    button.addEventListener('click',()=>{void this.start(game,begin);});container.prepend(button);this.buttons.push(button);return button;
  }
  bind(house:{pong?:PongView;chalkboard?:Chalkboard;boxing?:Boxing}){
    this.buttons.forEach(b=>b.remove());this.buttons=[];this.boxingButton=undefined;this.boxingBegin=undefined;
    if(account.mode!=='supabase')return;
    if(house.pong){
      const pong=house.pong;this.button(pong.ui.querySelector('.pong-actions')!,'pong',()=>pong.startRanked());
      pong.onResult=result=>{void this.finish('pong',result);};pong.onCancel=()=>this.cancelGame('pong');
    }
    if(house.chalkboard){
      const chalk=house.chalkboard;this.button(chalk.ui.querySelector('.chalk-actions')!,'tic-tac-toe',()=>chalk.startChallenge());
      chalk.onChallengeResult=result=>{void this.finish('tic-tac-toe',result);};chalk.onCancel=()=>this.cancelGame('tic-tac-toe');
      chalk.onNewChallenge=()=>{
        chalk.setPreparing(true);
        void this.start('tic-tac-toe',()=>chalk.startChallenge()).finally(()=>chalk.setPreparing(false));
      };
      const entered=chalk.onEnter;
      chalk.onEnter=()=>{entered();chalk.onNewChallenge!();};
    }
    if(house.boxing){
      this.boxingBegin=()=>house.boxing!.cancel();
      this.boxingButton=this.button(document.getElementById('boxing-hud')!,'boxing',()=>house.boxing!.cancel());
      this.boxingButton.className='boxing-ranked';
    }
  }
  private async start(game:Game,begin:()=>void){
    if(this.busy||this.run)return;
    if(this.pending){this.message('Ein Ergebnis wartet noch auf Speicherung. Bitte zuerst erneut speichern.');return;}
    const generation=++this.generation;this.busy=true;this.buttons.forEach(b=>b.disabled=true);
    this.message('Wertung wird gestartet …');
    try {
      const response=await account.request('/api/highscores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',game})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(typeof data.runId!=='string'||!data.runId)throw new Error('Wertung konnte nicht vorbereitet werden. Bitte erneut starten.');
      if(generation!==this.generation)return;
      this.run={id:data.runId,game,start:performance.now(),hits:0,combo:0};begin();
      if(this.isOpen)this.suspendedAt=performance.now();
      this.message(`${labels[game]} · Wertung läuft${game==='tic-tac-toe'?' · 10 Partien':''}`);
    }catch(error){if(generation===this.generation)this.message(error instanceof Error?error.message:'Wertung konnte nicht gestartet werden.');}
    finally{if(generation===this.generation){this.busy=false;this.buttons.forEach(b=>b.disabled=Boolean(this.run));}}
  }
  hit(hit:BoxingHit){
    if(this.boxingStarting){this.bufferedHits.push(hit);return;}
    if(!this.run&&this.boxingBegin&&!this.pending&&!this.busy){
      this.boxingStarting=true;this.bufferedHits=[hit];
      void this.start('boxing',()=>{
        const hits=this.bufferedHits;this.bufferedHits=[];this.boxingStarting=false;
        for(const buffered of hits)this.hit(buffered);
      }).finally(()=>{this.boxingStarting=false;this.bufferedHits=[];});
      return;
    }
    if(this.run?.game!=='boxing'||performance.now()-this.run.start>=60000)return;
    this.run.hits++;this.run.combo=Math.max(this.run.combo,Math.min(this.run.hits,hit.combo));
  }
  tick(playing:boolean){
    if(this.isOpen)return;
    if(this.boxingButton)this.boxingButton.hidden=!playing||document.getElementById('boxing-hud')!.hidden;
    if(this.run?.game!=='boxing')return;
    if(!playing){this.cancelBoxing();return;}
    const seconds=Math.max(0,Math.ceil((60000-(performance.now()-this.run.start))/1000));
    this.message(`Boxtraining · ${seconds} s · Beste Serie ${this.run.combo} · ${this.run.hits} Treffer`);
    if(!seconds)void this.finish('boxing',{hits:this.run.hits,combo:this.run.combo});
  }
  private async finish(game:Game,result:unknown){
    if(this.run?.game!==game)return;
    const run=this.run;this.run=undefined;this.buttons.forEach(b=>b.disabled=false);
    this.pending={run,result};await this.save(this.pending);
  }
  private async save(pending:{run:Run;result:unknown}){
    if(this.busy)return;
    this.busy=true;this.retry.disabled=true;this.message('Ergebnis wird gespeichert …');
    try {
      const response=await account.request('/api/highscores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'finish',game:pending.run.game,runId:pending.run.id,result:pending.result})});
      const data=await response.json();if(!response.ok){if(response.status===409||response.status===404||response.status===400)this.pending=undefined;throw new Error(data.error);}
      this.pending=undefined;this.retry.hidden=true;
      this.message(`${labels[pending.run.game]} · Ergebnis gespeichert. Dein Rekord steht unter Highscores im Menü.`);
    }catch(error){this.retry.hidden=!this.pending;this.message(error instanceof Error?error.message:'Speichern fehlgeschlagen. Du kannst es erneut versuchen.');}
    finally{this.busy=false;this.retry.disabled=false;}
  }
  private cancelGame(game:Game){if(this.run?.game===game||this.busy&&!this.pending)this.cancel();}
  cancelBoxing(){if(this.run?.game==='boxing')this.cancel();}
  cancel(){
    ++this.generation;
    if(this.run)this.message('Wertung abgebrochen. Freies Spielen bleibt möglich.');
    this.run=undefined;if(!this.pending)this.busy=false;
    this.buttons.forEach(b=>b.disabled=false);
  }
  show(game?:Game){
    if(game)this.selection.value=game;
    else if(this.run)this.selection.value=this.run.game;
    if(!this.dialog.open){this.suspendedAt=performance.now();this.dialog.showModal();this.onShow();}
    void this.loadList();
  }
  private async loadList(){
    const generation=++this.listGeneration,game=this.selection.value as Game;this.entries.textContent='Rangliste wird geladen …';
    try {
      const response=await account.request(`/api/highscores?game=${encodeURIComponent(game)}`);
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(generation!==this.listGeneration)return;
      this.entries.replaceChildren();const rule=document.createElement('p');rule.textContent=rules[game];this.entries.append(rule);
      const table=document.createElement('table');
      const head=document.createElement('tr');for(const text of ['Platz','Spieler','Rekord']){const cell=document.createElement('th');cell.textContent=text;head.append(cell);}table.append(head);
      for(const item of data.entries){const row=document.createElement('tr');if(item.own)row.className='own-score';
        const score=game==='boxing'?`${item.score} Serie / ${item.secondary_score} Treffer`:game==='pong'?`${item.score?'Sieg':'Niederlage'} · ${item.secondary_score>0?'+':''}${item.secondary_score}`:`${item.score} / 30`;
        for(const text of [String(item.place),`${item.display_name}${item.own?' (du)':''}`,score]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}table.append(row);
      }
      this.entries.append(table);const foot=document.createElement('p');foot.textContent=data.entries.length?'Top 20 und dein bester Lauf. Gleiche Ergebnisse teilen den Rang.':'Noch keine Rekorde. Starte im Minispiel eine Wertung!';this.entries.append(foot);
    }catch(error){if(generation===this.listGeneration)this.entries.textContent=error instanceof Error?error.message:'Rangliste nicht erreichbar.';}
  }
}
