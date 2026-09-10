import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { floors as testFloors, floorOrder } from './data/house.ts';
import { parseHouseModel, MODEL_STORAGE_KEY, MAX_MODEL_BYTES } from './data/import-model.ts';
import type { FloorId } from './data/house.ts';
import { inPolygon } from './game/geometry.ts';
import { climbRegions, connectedBuilding, floorAtPosition, localPosition, origin } from './game/building.ts';
import { createHouseScene } from './game/scene.ts';
import { Player, FIXED_DT, idleInput } from './game/player.ts';
import { prepareActivities } from './game/activities.ts';
import { prepareInteriors } from './game/interiors.ts';
import type { BoxingPose } from './game/boxing.ts';
import { GameAudio } from './game/audio.ts';
import { TouchControls,useTouch } from './game/touch-input.ts';
import type {InputMode} from './game/touch-input.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <section id="auth-gate" class="auth-gate" hidden aria-labelledby="auth-title">
    <form id="auth-form" class="auth-card">
      <p class="eyebrow">KRS GAME <span>PRIVATER ZUGANG</span></p>
      <h1 id="auth-title">Kraus<span>Mansion.</span></h1>
      <p class="intro">Dieses Spiel ist nicht öffentlich freigegeben. Bitte gib das Zugangspasswort ein.</p>
      <label class="auth-label" for="auth-password">Passwort</label>
      <input id="auth-password" class="auth-password" type="password" autocomplete="current-password" required />
      <button class="start" type="submit"><span>Spiel öffnen</span><span aria-hidden="true">↗</span></button>
      <p id="auth-status" class="status" role="status"></p>
    </form>
  </section>
  <canvas id="game" aria-label="Begehbares 3D-Modell der KrausMansion"></canvas>
  <header class="brand"><span class="brand-mark">K.</span><div>KRAUSMANSION<span>Bewegung ausprobieren.</span></div></header>
  <div class="location"><span id="floor-name">Hausmodell</span><strong id="room-name">Wird geladen …</strong></div>
  <div id="crosshair" aria-hidden="true"></div>
  <aside id="boxing-hud" class="boxing-hud" hidden aria-label="Boxtraining">
    <p class="boxing-kicker">ENTDECKT / 01 · BOXTRAINING</p>
    <h2>Eine Runde am Sack.</h2>
    <p><kbd>Linke Maustaste</kbd> Linke Faust<br><kbd>Rechte Maustaste</kbd> Rechte Faust</p>
    <div class="boxing-stats"><span>LINKS <b id="boxing-left">0</b></span><span>RECHTS <b id="boxing-right">0</b></span><span>SERIE <b id="boxing-combo">0</b></span></div>
    <p id="boxing-feedback" class="boxing-feedback">Geh auf Schlagdistanz und ziele auf den Sack.</p>
    <small>Links und rechts abwechseln hält die Serie.</small>
  </aside>
  <aside class="map"><div class="map-caption"><span id="map-floor">GRUNDRISS</span><span>1 m</span></div><canvas id="map" role="img" aria-label="Grundriss mit deiner Position"></canvas></aside>
  <div class="movement"><span id="movement-state">Bereit zum Erkunden</span><span class="movement-line"></span><span id="eye-height">Augenhöhe 1,68 m</span></div>
  <div class="play-help"><kbd>W A S D</kbd> Bewegen <kbd>Leertaste</kbd> Springen <kbd>Strg</kbd> Ducken <kbd>Shift</kbd> Schnell gehen <kbd>Esc</kbd> Menü</div>
  <div id="touch-controls" hidden aria-label="Touch-Steuerung">
    <div class="touch-look" data-touch="look" aria-label="Zum Umsehen wischen"><span>Wischen zum Umsehen</span></div>
    <div class="touch-stick" data-touch="move" aria-label="Joystick zum Bewegen"><span class="stick-knob"></span><small>BEWEGEN · AUSSEN SCHNELL</small></div>
    <div class="touch-actions"><button type="button" data-touch="crouch" aria-pressed="false">Ducken</button><button type="button" data-touch="jump">Springen</button></div>
    <div class="touch-fists" hidden><button type="button" data-touch="left" aria-label="Linke Faust">Faust L</button><button type="button" data-touch="right" aria-label="Rechte Faust">Faust R</button></div>
    <div class="touch-toolbar"><button id="toggle-map" type="button" aria-pressed="false">Karte</button><button id="touch-pause" type="button">Pause</button></div>
  </div>
  <dialog id="menu" aria-labelledby="menu-title">
    <p class="eyebrow">KRS GAME <span>ERKUNDUNG / 01</span></p>
    <h1 id="menu-title">Kraus<span>Mansion.</span></h1>
    <p class="intro" id="intro">Das private Hausmodell wird geladen.<br>Danach kannst du alle Etagen erkunden.</p>
    <p id="rotate-hint" hidden role="status">Bitte drehe dein Gerät ins Querformat. Danach kannst du weiterspielen.</p>
    <div id="floor-picker" class="floor-picker" aria-label="Etage auswählen" hidden>${floorOrder.map(id=>`<button type="button" class="floor-option" data-floor="${id}" aria-pressed="${id==='eg'}"><strong>${id.toUpperCase()}</strong><span>${({kg:'Keller',eg:'Erdgeschoss',og:'Obergeschoss',dg:'Dachgeschoss'})[id]}</span></button>`).join('')}</div>
    <details id="advanced-settings" class="advanced-settings"><summary>Erweiterte Einstellungen</summary><div class="model-import"><button id="import-model" type="button" disabled>Anderes JSON laden</button><input id="model-file" type="file" accept=".json,application/json" hidden /><label><input id="remember-model" type="checkbox" /> Lokales Ersatzmodell merken</label><p>Optional: Die Datei wird nur in diesem Browser gelesen und ersetzt das automatisch geladene Modell für diese Sitzung.</p></div></details>
    <button type="button" class="start" id="start" disabled><span id="start-label">Hausmodell wird geladen …</span><span aria-hidden="true">↗</span></button>
    <p id="status" class="status" role="status">3D-Modell und Bewegung werden vorbereitet.</p>
    <button id="retry-load" type="button" hidden>Erneut laden</button>
    <div class="controls"><div><kbd>W A S D</kbd><span>Bewegen</span></div><div><kbd>Maus</kbd><span>Umsehen</span></div><div><kbd>Leertaste</kbd><span>Springen</span></div><div><kbd>Strg / Ctrl</kbd><span>Ducken · halten</span></div><div><kbd>Shift</kbd><span>Schnell gehen · halten</span></div><div><kbd>Esc</kbd><span>Pause / Menü</span></div></div>
    <div class="menu-bottom"><label for="sensitivity">Mausempfindlichkeit</label><input id="sensitivity" type="range" min="0.6" max="2.4" value="1" step="0.1" /><label for="sound-volume">Lautstärke <output id="sound-volume-value">55 %</output></label><input id="sound-volume" type="range" min="0" max="100" value="55" step="5" /><button id="sound-mute" type="button" aria-pressed="false">Ton stummschalten</button><button id="reset" type="button" disabled>Zum Startpunkt</button><button id="alternate-spawn" type="button" hidden></button></div>
    <p id="model-note" class="model-note">Nach der Anmeldung wird das private Hausmodell automatisch geladen.</p>
    <fieldset class="input-settings"><legend>Steuerung</legend>
      <label for="input-mode">Eingabe</label><select id="input-mode"><option value="auto">Automatisch</option><option value="touch">Touch / Joystick</option><option value="mouse">Maus / Tastatur</option></select>
      <label for="touch-sensitivity">Touch-Empfindlichkeit</label><input id="touch-sensitivity" type="range" min="0.5" max="2" value="1" step="0.1" />
      <label for="touch-size">Touch-Tasten</label><select id="touch-size"><option value="normal">Normal</option><option value="large">Groß</option></select>
      <label for="graphics-mode">Grafik</label><select id="graphics-mode"><option value="auto">Automatisch</option><option value="mobile">Sparsam</option><option value="high">Hohe Qualität</option></select>
      <button id="fullscreen" type="button" hidden>Vollbild</button>
    </fieldset>
    <p class="device-note">Links bewegen, rechts umsehen. Joystick außen: schnell gehen. Ducken antippen: an/aus.</p>
  </dialog>
`;

const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const authGate = $<HTMLElement>('auth-gate');
const authForm = $<HTMLFormElement>('auth-form');
const authPassword = $<HTMLInputElement>('auth-password');
const authStatus = $('auth-status');
const menu = $<HTMLDialogElement>('menu');
const start = $<HTMLButtonElement>('start');
const status = $('status');
const reset = $<HTMLButtonElement>('reset');
const map = $<HTMLCanvasElement>('map');
const mapContext = map.getContext('2d')!;
const keys = new Set<string>();
const controlledKeys = new Set(['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight']);
let house:ReturnType<typeof createHouseScene>;
let player:Player;
let renderer:THREE.WebGLRenderer;
let floors = testFloors;
let customModel = false;
let authenticated = false;
let activeFloor:FloorId = 'eg';
let yaw = floors.eg.spawn.yaw, pitch = -.04;
let playing = false, ready = false, hasPlayed = false;
let mouseStartPending=false;
const coarsePointer=matchMedia('(pointer: coarse)');
function savedSetting(key:string,fallback:string) {try{return localStorage.getItem(`krs-game.${key}`)??fallback;}catch{return fallback;}}
function saveSetting(key:string,value:string) {try{localStorage.setItem(`krs-game.${key}`,value);}catch{/* Settings are optional when storage is blocked. */}}
let inputMode=savedSetting('input-mode','auto') as InputMode;
if(!['auto','touch','mouse'].includes(inputMode))inputMode='auto';
let touchMode=useTouch(inputMode,coarsePointer.matches,Boolean(canvas.requestPointerLock));
let touchSensitivity=Math.max(.5,Math.min(2,Number(savedSetting('touch-sensitivity','1'))||1));
let graphicsMode=savedSetting('graphics-mode','auto');
if(!['auto','mobile','high'].includes(graphicsMode))graphicsMode='auto';
let sensitivity = 1;
let accumulator = 0, lastTime = 0, mapTimer = 0;
let frameId = 0;
let renderDirty = true;
const camera = new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.035,90);
camera.rotation.order = 'YXZ';
const previousPosition = new THREE.Vector3();
const interpolatedPosition = new THREE.Vector3();
let cameraEye = 1.68;
let previousHeight:number = 1.8;
const boxingHud=$('boxing-hud');
const gameAudio=new GameAudio();
const touch=new TouchControls($('touch-controls'),(dx,dy)=>{
  if(!playing||!touchMode)return;
  const scale=3/Math.max(320,innerHeight)*touchSensitivity;
  yaw-=dx*scale;pitch=THREE.MathUtils.clamp(pitch-dy*scale,-Math.PI/2+.025,Math.PI/2-.025);
},hand=>{if(playing&&touchMode){gameAudio.unlock();house.boxing?.punch(hand,boxingPose());}});
const portrait=()=>touchMode&&innerHeight>innerWidth;
function controlHint() {return touchMode?'Links bewegen · rechts wischen · Joystick außen: schnell gehen.':'Ein Klick aktiviert die Maussteuerung. Esc gibt die Maus frei.';}
function updateInputUI() {
  document.body.classList.toggle('touch-mode',touchMode);
  $('rotate-hint').hidden=!portrait();
  start.disabled=!ready||portrait();
  touch.setEnabled(playing&&touchMode);
  $<HTMLSelectElement>('input-mode').value=inputMode;
}
function applyGraphics() {
  if(!renderer)return;
  const low=graphicsMode==='mobile'||(graphicsMode==='auto'&&touchMode);
  renderer.setPixelRatio(Math.min(devicePixelRatio,low?1.25:1.75));
  renderer.shadowMap.enabled=!low;
  renderer.setSize(innerWidth,innerHeight);renderDirty=true;
}
$<HTMLInputElement>('touch-sensitivity').value=String(touchSensitivity);
$<HTMLSelectElement>('graphics-mode').value=graphicsMode;
const largeButtons=savedSetting('touch-size','normal')==='large';
document.body.classList.toggle('large-touch',largeButtons);
$<HTMLSelectElement>('touch-size').value=largeButtons?'large':'normal';
updateInputUI();
function updateAudioSettings() {
  $<HTMLInputElement>('sound-volume').value=String(Math.round(gameAudio.volume*100));
  $('sound-volume-value').textContent=`${Math.round(gameAudio.volume*100)} %`;
  $('sound-mute').textContent=gameAudio.muted?'Ton einschalten':'Ton stummschalten';
  $('sound-mute').setAttribute('aria-pressed',String(gameAudio.muted));
}
updateAudioSettings();
$('sound-volume').addEventListener('input',event=>{gameAudio.setVolume(Number((event.target as HTMLInputElement).value)/100);updateAudioSettings();});
$('sound-mute').addEventListener('click',()=>{gameAudio.setMuted(!gameAudio.muted);updateAudioSettings();});
function boxingPose():BoxingPose {
  const p=player.body.translation();
  return {eye:{x:p.x,y:p.y+player.height-.12,z:p.z},yaw,pitch,body:player.body};
}

menu.addEventListener('cancel',event=>event.preventDefault());

function showAuthGate(message = '') {
  if (menu.open) menu.close();
  authStatus.textContent = message;
  authGate.hidden = false;
  authPassword.focus();
}

async function checkAuthentication(): Promise<boolean> {
  if (import.meta.env.DEV) return true;
  try {
    const response = await fetch('/api/auth', { credentials: 'include', cache: 'no-store' });
    authenticated = response.ok;
  } catch {
    authenticated = false;
  }
  if (!authenticated) showAuthGate();
  return authenticated;
}

async function loadRemoteModel(): Promise<boolean> {
  if (import.meta.env.DEV) return true;
  const response = await fetch('/api/house-model', { credentials: 'include', cache: 'no-store' });
  if (response.status === 401) {
    authenticated = false;
    showAuthGate('Die Sitzung ist abgelaufen. Bitte erneut anmelden.');
    return false;
  }
  if (!response.ok) throw new Error((await response.json().catch(() => ({})) as {error?:string}).error ?? 'Privates Hausmodell konnte nicht geladen werden.');
  loadModel(await response.text());
  return true;
}

function updateMap() {
  const plan = floors[activeFloor];
  const cssW = 238, cssH = 280, dpr = Math.min(devicePixelRatio,2);
  if (map.width !== cssW*dpr) { map.width = cssW*dpr; map.height = cssH*dpr; }
  const ctx = mapContext;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cssW,cssH);
  const all = [...plan.footprint,...plan.walls.flat()];
  const minX = Math.min(...all.map(p=>p[0])), maxX = Math.max(...all.map(p=>p[0]));
  const minZ = Math.min(...all.map(p=>p[1])), maxZ = Math.max(...all.map(p=>p[1]));
  const scale = Math.min((cssW-26)/(maxX-minX),(cssH-32)/(maxZ-minZ));
  const ox = (cssW-(maxX-minX)*scale)/2-minX*scale, oz = 10-minZ*scale;
  const path = (points:readonly [number,number][]) => {
    ctx.beginPath(); points.forEach(([x,z],i)=>{if(i===0)ctx.moveTo(ox+x*scale,oz+z*scale);else ctx.lineTo(ox+x*scale,oz+z*scale);});ctx.closePath();
  };
  path(plan.footprint);ctx.fillStyle='#29363b';ctx.fill();
  const position = localPosition(plan,player.body.translation());
  const room = plan.rooms.find(r=>inPolygon(position.x,position.z,r.polygon));
  if (room) {path(room.polygon);ctx.fillStyle='#3d4d46';ctx.fill();}
  ctx.fillStyle='#64726e';
  for (const f of plan.furniture) {if(f.kind==='rug')continue;const [x0,z0,x1,z1] = f.rect;ctx.fillRect(ox+x0*scale,oz+z0*scale,(x1-x0)*scale,(z1-z0)*scale);}
  ctx.strokeStyle='#96bca8';ctx.lineWidth=1;
  for(const stair of plan.stairs??[])for(const step of stair.steps){path(step.polygon);ctx.stroke();}
  ctx.strokeStyle='#bdc9bd';ctx.setLineDash([3,3]);
  for(const hole of plan.floorHoles??[]){const [x0,z0,x1,z1]=hole;path([[x0,z0],[x1,z0],[x1,z1],[x0,z1]]);ctx.stroke();}ctx.setLineDash([]);
  ctx.fillStyle='#c1c9bb';for(const wall of plan.walls){path(wall);ctx.fill();}
  ctx.save();ctx.translate(ox+position.x*scale,oz+position.z*scale);ctx.rotate(-yaw);
  ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(5,5);ctx.lineTo(0,2);ctx.lineTo(-5,5);ctx.closePath();ctx.fillStyle='#d4fa72';ctx.fill();ctx.restore();
  ctx.strokeStyle='#c1c9bb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cssW-14-scale,cssH-8);ctx.lineTo(cssW-14,cssH-8);ctx.stroke();
  $('room-name').textContent = room?.name ?? 'Durchgang';
}

function setFloor(id:FloorId, spawnOverride?: {x:number;z:number;yaw:number}) {
  const plan = floors[id];
  const nextHouse = createHouseScene(connectedBuilding(floors)?floorOrder.map(id=>floors[id]):[plan]);
  const [ox,oy,oz]=origin(plan);
  const spawn = spawnOverride ?? plan.spawn;
  let nextPlayer:Player;
  try {
    nextPlayer = new Player(nextHouse.world,spawn.x+ox,spawn.z+oz,oy,climbRegions(Object.values(floors)));
    for(let i=0;i<24;i++)nextPlayer.step(idleInput(),spawn.yaw);
  } catch(error) {nextHouse.dispose();throw error;}
  if (house) {player.dispose();house.dispose();}
  house=nextHouse;player=nextPlayer;activeFloor=id;
  gameAudio.reset();
  if(house.boxing)house.boxing.onHit=hit=>gameAudio.hit(hit);
  house.boxingView?.capture();house.boxingView?.update(1);
  boxingHud.hidden=true;
  yaw = spawn.yaw;pitch = -.04;cameraEye=1.68;
  const position = player.body.translation();
  previousHeight=player.height;
  previousPosition.set(position.x,position.y,position.z);
  camera.position.set(position.x,position.y+cameraEye,position.z);
  camera.rotation.set(pitch,yaw,0,'YXZ');
  accumulator = 0;keys.clear();touch.reset();
  updateFloorLabel(id);
  $('movement-state').textContent='Bereit zum Erkunden';
  $('eye-height').textContent='Augenhöhe 1,68 m';
  status.textContent=customModel?`${plan.name} geladen.`:'Lade dein Hausmodell, um die vier Etagen zu erkunden.';
  updateMap();renderDirty=true;
}

function updateFloorLabel(id:FloorId) {
  activeFloor=id;const plan=floors[id];
  document.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.floor===id)));
  $('floor-name').textContent=customModel?plan.name:'Testraum';$('map-floor').textContent=customModel?`${id.toUpperCase()} / GRUNDRISS`:'TESTRAUM';
  $('alternate-spawn').hidden=!plan.alternateSpawn;
  $('alternate-spawn').textContent=plan.alternateSpawn?.label ?? '';
}

function pause() {
  gameAudio.setPlaying(false);
  playing=false;mouseStartPending=false;keys.clear();touch.setEnabled(false);accumulator=0;player?.stop();
  if(document.pointerLockElement===canvas)document.exitPointerLock();
  house?.boxing?.cancel();boxingHud.hidden=true;
  $('crosshair').classList.remove('hit');
  document.body.classList.remove('playing');
  if(!menu.open)menu.showModal();
  $('menu-title').innerHTML = hasPlayed ? 'Kurze<span>Pause.</span>' : 'Kraus<span>Mansion.</span>';
  $('intro').textContent = customModel ? 'Dein Hausmodell ist geladen. Wähle eine Etage und erkunde das Haus.' : 'Lade dein Hausmodell oder probiere die Bewegung im Testraum aus.';
  $('start-label').textContent = hasPlayed ? 'Weiter erkunden' : customModel ? 'Haus betreten' : 'Testraum betreten';
  status.textContent = controlHint();
  updateInputUI();
}


function loadModel(text:string) {
  const candidate = prepareInteriors(parseHouseModel(text));
  candidate.kg=prepareActivities(candidate.kg).plan;
  // Replace the active dataset as a unit, then rebuild scene, physics and map.
  const previous = floors;
  floors = candidate;
  try { setFloor('eg'); } catch(error) { floors=previous;setFloor('eg');throw error; }
  customModel = true;
  $('floor-picker').hidden=false;
  $('floor-name').textContent=floors.eg.name;$('map-floor').textContent='EG / GRUNDRISS';
  $('start-label').textContent=hasPlayed?'Weiter erkunden':'Haus betreten';
  $('intro').textContent='Dein Hausmodell ist geladen. Wähle eine Etage und erkunde das Haus.';
  $('model-note').textContent=connectedBuilding(floors)
    ? (import.meta.env.DEV ? 'Hausmodell geladen. Die Etagen sind über Treppen verbunden. Dachneigung und Stufenhöhen sind vorläufig angenähert.' : 'Privates Hausmodell geladen. Die Etagen sind über Treppen verbunden.')
    : 'Älteres Hausmodell geladen: Etagenwechsel im Menü. Lade die aktualisierte Hausdatei für Treppen und Dachschrägen.';
  status.textContent='Vier unterschiedliche Etagen geladen.';
}
$('import-model').addEventListener('click',()=>{if(ready)$<HTMLInputElement>('model-file').click();});
$('model-file').addEventListener('change',async()=>{
  const input=$<HTMLInputElement>('model-file');const file=input.files?.[0];if(!file)return;
  try {
    if(file.size>MAX_MODEL_BYTES)throw new Error('Die Hausdatei ist zu groß (maximal 512 KB).');
    const text=await file.text();loadModel(text);
    try {if($<HTMLInputElement>('remember-model').checked)localStorage.setItem(MODEL_STORAGE_KEY,text);else localStorage.removeItem(MODEL_STORAGE_KEY);}
    catch {status.textContent='Haus geladen. Dauerhaftes Speichern ist in diesem Browser nicht verfügbar.';}
  } catch(error) {status.textContent=error instanceof Error?error.message:'Hausdatei konnte nicht geladen werden.';}
  input.value='';
});
$('remember-model').addEventListener('change',()=>{
  try {
    if($<HTMLInputElement>('remember-model').checked&&customModel)localStorage.setItem(MODEL_STORAGE_KEY,JSON.stringify({format:'krs-house',version:connectedBuilding(floors)?2:1,floors}));
    else localStorage.removeItem(MODEL_STORAGE_KEY);
  } catch {status.textContent='Dauerhaftes Speichern ist in diesem Browser nicht verfügbar.';}
});
$('alternate-spawn').addEventListener('click',()=>{const point=floors[activeFloor].alternateSpawn;if(ready&&point)setFloor(activeFloor,point);});

start.addEventListener('click',async()=>{
  if (!ready||portrait()) return;
  gameAudio.unlock();
  status.textContent = '';
  if(touchMode){beginPlay();return;}
  if(!canvas.requestPointerLock){status.textContent='Maussteuerung ist hier nicht verfügbar. Wähle unten „Touch / Joystick“.';return;}
  mouseStartPending=true;
  try { await canvas.requestPointerLock(); }
  catch {mouseStartPending=false;status.textContent='Maussteuerung konnte nicht starten. Bitte erneut klicken oder „Touch / Joystick“ auswählen.';}
});
start.addEventListener('pointerdown',event=>{
  if(inputMode==='auto'&&event.pointerType==='touch'){touchMode=true;updateInputUI();applyGraphics();}
});
function beginPlay() {
  playing=true;mouseStartPending=false;hasPlayed=true;keys.clear();touch.reset();accumulator=0;lastTime=0;
  gameAudio.setPlaying(true);
  if(menu.open)menu.close();document.body.classList.add('playing');updateInputUI();
}
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas) {
    if(mouseStartPending&&ready&&!touchMode&&!document.hidden)beginPlay();
    else if(!playing||touchMode)document.exitPointerLock();
  } else if(playing&&!touchMode) pause();
});
document.addEventListener('pointerlockerror',()=>{mouseStartPending=false;status.textContent='Maussteuerung wurde vom Browser abgelehnt. Klicke erneut auf Spielen oder wähle „Touch / Joystick“.';});
document.addEventListener('mousemove',event=>{
  if(!playing||touchMode||document.pointerLockElement!==canvas)return;
  yaw -= event.movementX*.002*sensitivity;
  pitch = THREE.MathUtils.clamp(pitch-event.movementY*.002*sensitivity,-Math.PI/2+.025,Math.PI/2-.025);
});
document.addEventListener('mousedown',event=>{
  if(!playing||touchMode||document.pointerLockElement!==canvas || (event.button!==0 && event.button!==2))return;
  event.preventDefault();
  gameAudio.unlock();
  house.boxing?.punch(event.button===0?'left':'right',boxingPose());
});
canvas.addEventListener('contextmenu',event=>{if(playing)event.preventDefault();});
document.addEventListener('keydown',event=>{
  if(playing&&event.code==='Escape'){event.preventDefault();pause();return;}
  if(!playing||touchMode || !controlledKeys.has(event.code))return;
  event.preventDefault();keys.add(event.code);
});
document.addEventListener('keyup',event=>{
  keys.delete(event.code);
  if(playing && controlledKeys.has(event.code))event.preventDefault();
});
function releaseInput() {keys.clear();touch.reset();mouseStartPending=false;gameAudio.setPlaying(false);if(playing)pause();else if(document.pointerLockElement===canvas)document.exitPointerLock();}
window.addEventListener('blur',releaseInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInput();lastTime=0;accumulator=0;});
document.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach(button=>button.addEventListener('click',()=>{if(ready)setFloor(button.dataset.floor as FloorId);}));
reset.addEventListener('click',()=>{setFloor(activeFloor);status.textContent='Du bist wieder am Startpunkt dieser Etage.';});
$<HTMLInputElement>('sensitivity').addEventListener('input',event=>{sensitivity=Number((event.target as HTMLInputElement).value);});
$('touch-pause').addEventListener('click',pause);
$('toggle-map').addEventListener('click',()=>{
  const expanded=document.body.classList.toggle('mobile-map-open');$('toggle-map').setAttribute('aria-pressed',String(expanded));
});
$('input-mode').addEventListener('change',()=>{
  inputMode=$<HTMLSelectElement>('input-mode').value as InputMode;saveSetting('input-mode',inputMode);
  touchMode=useTouch(inputMode,coarsePointer.matches,Boolean(canvas.requestPointerLock));
  releaseInput();updateInputUI();applyGraphics();status.textContent=controlHint();
});
coarsePointer.addEventListener('change',()=>{
  if(inputMode!=='auto')return;
  releaseInput();touchMode=useTouch(inputMode,coarsePointer.matches,Boolean(canvas.requestPointerLock));updateInputUI();applyGraphics();
});
$('touch-sensitivity').addEventListener('input',()=>{touchSensitivity=Number($<HTMLInputElement>('touch-sensitivity').value);saveSetting('touch-sensitivity',String(touchSensitivity));});
$('touch-size').addEventListener('change',()=>{const value=$<HTMLSelectElement>('touch-size').value;document.body.classList.toggle('large-touch',value==='large');saveSetting('touch-size',value);touch.reset();});
$('graphics-mode').addEventListener('change',()=>{graphicsMode=$<HTMLSelectElement>('graphics-mode').value;saveSetting('graphics-mode',graphicsMode);applyGraphics();});
$('fullscreen').hidden=!document.documentElement.requestFullscreen;
$('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{status.textContent='Vollbild ist hier nicht verfügbar. Du kannst trotzdem spielen.';}
});
window.addEventListener('resize',()=>{
  if(playing&&portrait())pause();
  touch.reset();updateInputUI();
  if(!renderer)return;
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  applyGraphics();
});

function animate(time:number) {
  frameId=requestAnimationFrame(animate);
  const dt = lastTime ? Math.min((time-lastTime)/1000,.1) : 0;lastTime=time;
  if(document.hidden)return;
  if(playing) {
    accumulator+=dt;
    let input = {
      forward:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),
      right:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),
      sprint:keys.has('ShiftLeft')||keys.has('ShiftRight'),
      crouch:keys.has('ControlLeft')||keys.has('ControlRight'),
      jump:keys.has('Space'),
    };
    while(accumulator>=FIXED_DT) {
      if(touchMode)input=touch.input.sample();
      const pos=player.body.translation();previousPosition.set(pos.x,pos.y,pos.z);
      previousHeight=player.height;
      house.boxingView?.capture();
      house.boxing?.step(FIXED_DT,boxingPose());
      player.step(input,yaw);accumulator-=FIXED_DT;
    }
    const pos=player.body.translation();
    const bottom=Math.min(...Object.values(floors).map(p=>p.elevation??0))-4;
    if(pos.y < bottom) {setFloor(activeFloor);return;}
    interpolatedPosition.set(pos.x,pos.y,pos.z).lerp(previousPosition,1-accumulator/FIXED_DT);
    cameraEye = THREE.MathUtils.lerp(previousHeight,player.height,accumulator/FIXED_DT)-.12;
    camera.position.copy(interpolatedPosition);camera.position.y+=cameraEye;
    camera.rotation.set(pitch,yaw,0,'YXZ');
    mapTimer+=dt;
    if(mapTimer>.08) {
      if(connectedBuilding(floors)){const id=floorAtPosition(Object.values(floors),pos,activeFloor,player.grounded);if(id!==activeFloor)updateFloorLabel(id);}
      updateMap();mapTimer=0;
      $('movement-state').textContent = !player.grounded ? 'In der Luft' : player.crouched ? 'Geduckt' : player.speed>.1 ? input.sprint ? 'Schnell gehen' : 'Gehen' : 'Stehen';
      $('eye-height').textContent=`Augenhöhe ${(player.height-.12).toFixed(2).replace('.',',')} m`;
    }
    house.boxingView?.update(accumulator/FIXED_DT);
    const boxing=house.boxing;
    const training=Boolean(boxing?.nearby(boxingPose()));
    touch.setTraining(training);
    boxingHud.hidden=!training;
    if(training && boxing) {
      $('boxing-left').textContent=String(boxing.hits.left);
      $('boxing-right').textContent=String(boxing.hits.right);
      $('boxing-combo').textContent=String(boxing.combo);
      $('boxing-feedback').textContent=boxing.feedback || 'Geh auf Schlagdistanz und ziele auf den Sack.';
    }
    $('crosshair').classList.toggle('hit',training && (boxing?.flash??0)>0);
    renderer.render(house.scene,camera);
    if(training)house.boxingView?.renderGloves(renderer,camera);
  } else if(renderDirty) {renderer.render(house.scene,camera);renderDirty=false;}
}

async function init() {
  try {
    if (!await checkAuthentication()) return;
    if (!menu.open) menu.showModal();
    renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.shadowMap.type=THREE.PCFShadowMap;applyGraphics();
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
    await RAPIER.init();
    if (import.meta.env.DEV) {
      setFloor('eg');
      try {const saved=localStorage.getItem(MODEL_STORAGE_KEY);if(saved){loadModel(saved);$<HTMLInputElement>('remember-model').checked=true;}} catch {status.textContent='Das gespeicherte Modell konnte nicht geladen werden. Bitte die Hausdatei erneut auswählen.';}
    } else if (!await loadRemoteModel()) return;
    if (!menu.open) menu.showModal();
    ready=true;updateInputUI();reset.disabled=false;
    $<HTMLButtonElement>('import-model').disabled=false;
    $('start-label').textContent=customModel?'Haus betreten':'Testraum betreten';
    status.textContent=controlHint();
    frameId=requestAnimationFrame(animate);
  } catch(error) {
    console.error(error);
    ready=false;start.disabled=true;reset.disabled=true;
    if (!menu.open) menu.showModal();
    $('start-label').textContent='Spiel konnte nicht starten';
    status.textContent=error instanceof Error ? error.message : 'Das 3D-Spiel konnte nicht geladen werden. Bitte lade die Seite neu.';
    status.classList.add('error');
    $('retry-load').hidden=false;
  }
}
$('retry-load').addEventListener('click',()=>location.reload());
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();releaseInput();pause();ready=false;start.disabled=true;
  cancelAnimationFrame(frameId);
  status.textContent='Die Grafikverbindung wurde unterbrochen. Bitte lade die Seite neu.';
});
window.addEventListener('pagehide',()=>{
  releaseInput();cancelAnimationFrame(frameId);
  gameAudio.dispose();
  player?.dispose();house?.dispose();renderer?.dispose();
});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
void init();

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = authPassword.value;
  authPassword.disabled = true;
  authStatus.textContent = 'Anmeldung wird geprüft …';
  try {
    const response = await fetch('/api/auth', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({password}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as {error?:string};
      authStatus.textContent = data.error ?? 'Anmeldung fehlgeschlagen.';
      authPassword.select();
      return;
    }
    authenticated = true;
    authPassword.value = '';
    authGate.hidden = true;
    await init();
  } catch {
    authStatus.textContent = 'Der Authentifizierungsdienst ist nicht erreichbar.';
  } finally {
    authPassword.disabled = false;
  }
});
