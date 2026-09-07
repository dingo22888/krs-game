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

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="game" aria-label="Begehbares 3D-Modell der KrausMansion"></canvas>
  <header class="brand"><span class="brand-mark">K.</span><div>KRAUSMANSION<span>Bewegung ausprobieren.</span></div></header>
  <div class="location"><span id="floor-name">Testraum</span><strong id="room-name">Bewegungsraum</strong></div>
  <div id="crosshair" aria-hidden="true"></div>
  <aside class="map"><div class="map-caption"><span id="map-floor">TESTRAUM</span><span>1 m</span></div><canvas id="map" role="img" aria-label="Grundriss mit deiner Position"></canvas></aside>
  <div class="movement"><span id="movement-state">Bereit zum Erkunden</span><span class="movement-line"></span><span id="eye-height">Augenhöhe 1,68 m</span></div>
  <div class="play-help"><kbd>W A S D</kbd> Bewegen <kbd>Leertaste</kbd> Springen <kbd>Strg</kbd> Ducken <kbd>Shift</kbd> Schnell gehen <kbd>Esc</kbd> Menü</div>
  <dialog id="menu" aria-labelledby="menu-title">
    <p class="eyebrow">KRS GAME <span>ERKUNDUNG / 01</span></p>
    <h1 id="menu-title">Kraus<span>Mansion.</span></h1>
    <p class="intro" id="intro">Bewegen, springen und ducken.<br>Teste die Steuerung im Browser.</p>
    <div id="floor-picker" class="floor-picker" aria-label="Etage auswählen" hidden>${floorOrder.map(id=>`<button type="button" class="floor-option" data-floor="${id}" aria-pressed="${id==='eg'}"><strong>${id.toUpperCase()}</strong><span>${({kg:'Keller',eg:'Erdgeschoss',og:'Obergeschoss',dg:'Dachgeschoss'})[id]}</span></button>`).join('')}</div>
    <div class="model-import"><button id="import-model" type="button" disabled>Hausmodell laden</button><input id="model-file" type="file" accept=".json,application/json" hidden /><label><input id="remember-model" type="checkbox" /> Auf diesem Gerät merken</label><p>Die Datei wird nur in diesem Browser gelesen.</p></div>
    <button type="button" class="start" id="start" disabled><span id="start-label">Testraum wird geladen …</span><span aria-hidden="true">↗</span></button>
    <p id="status" class="status" role="status">3D-Modell und Bewegung werden vorbereitet.</p>
    <div class="controls"><div><kbd>W A S D</kbd><span>Bewegen</span></div><div><kbd>Maus</kbd><span>Umsehen</span></div><div><kbd>Leertaste</kbd><span>Springen</span></div><div><kbd>Strg / Ctrl</kbd><span>Ducken · halten</span></div><div><kbd>Shift</kbd><span>Schnell gehen · halten</span></div><div><kbd>Esc</kbd><span>Pause / Menü</span></div></div>
    <div class="menu-bottom"><label for="sensitivity">Mausempfindlichkeit</label><input id="sensitivity" type="range" min="0.6" max="2.4" value="1" step="0.1" /><button id="reset" type="button" disabled>Zum Startpunkt</button><button id="alternate-spawn" type="button" hidden></button></div>
    <p id="model-note" class="model-note">Noch kein Hausmodell geladen. Aktuell siehst du einen neutralen Testraum.</p>
    <p class="device-note">Zum Spielen brauchst du Maus und Tastatur.</p>
  </dialog>
`;

const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
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
let activeFloor:FloorId = 'eg';
let yaw = floors.eg.spawn.yaw, pitch = -.04;
let locked = false, ready = false, hasPlayed = false;
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

menu.showModal();
menu.addEventListener('cancel',event=>event.preventDefault());

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
  for (const f of plan.furniture) {const [x0,z0,x1,z1] = f.rect;ctx.fillRect(ox+x0*scale,oz+z0*scale,(x1-x0)*scale,(z1-z0)*scale);}
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
  yaw = spawn.yaw;pitch = -.04;cameraEye=1.68;
  const position = player.body.translation();
  previousHeight=player.height;
  previousPosition.set(position.x,position.y,position.z);
  camera.position.set(position.x,position.y+cameraEye,position.z);
  camera.rotation.set(pitch,yaw,0,'YXZ');
  accumulator = 0;keys.clear();
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
  locked=false;keys.clear();accumulator=0;player?.stop();
  document.body.classList.remove('playing');
  if(!menu.open)menu.showModal();
  $('menu-title').innerHTML = hasPlayed ? 'Kurze<span>Pause.</span>' : 'Kraus<span>Mansion.</span>';
  $('intro').textContent = customModel ? 'Dein Hausmodell ist geladen. Wähle eine Etage und erkunde das Haus.' : 'Lade dein Hausmodell oder probiere die Bewegung im Testraum aus.';
  $('start-label').textContent = hasPlayed ? 'Weiter erkunden' : customModel ? 'Haus betreten' : 'Testraum betreten';
  status.textContent = 'Ein Klick aktiviert die Maussteuerung. Esc gibt die Maus frei.';
}


function loadModel(text:string) {
  const candidate = parseHouseModel(text);
  // Replace the active dataset as a unit, then rebuild scene, physics and map.
  const previous = floors;
  floors = candidate;
  try { setFloor('eg'); } catch(error) { floors=previous;setFloor('eg');throw error; }
  customModel = true;
  $('floor-picker').hidden=false;
  $('floor-name').textContent=floors.eg.name;$('map-floor').textContent='EG / GRUNDRISS';
  $('start-label').textContent=hasPlayed?'Weiter erkunden':'Haus betreten';
  $('intro').textContent='Dein Hausmodell ist geladen. Wähle eine Etage und erkunde das Haus.';
  $('model-note').textContent=connectedBuilding(floors)?'Hausmodell lokal geladen. Die Etagen sind über Treppen verbunden. Dachneigung und Stufenhöhen sind vorläufig angenähert.':'Älteres Hausmodell geladen: Etagenwechsel im Menü. Lade die aktualisierte Hausdatei für Treppen und Dachschrägen.';
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
  if (!ready) return;
  status.textContent = '';
  try { await canvas.requestPointerLock(); }
  catch { status.textContent='Maussteuerung konnte nicht starten. Bitte erneut klicken; öffne das Spiel gegebenenfalls direkt in einem Browser-Tab.'; }
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas) {
    locked=true;hasPlayed=true;keys.clear();accumulator=0;
    menu.close();document.body.classList.add('playing');
  } else if(ready) pause();
});
document.addEventListener('pointerlockerror',()=>{status.textContent='Maussteuerung wurde vom Browser abgelehnt. Öffne das Spiel direkt und klicke erneut auf „Testraum betreten“.';});
document.addEventListener('mousemove',event=>{
  if(!locked)return;
  yaw -= event.movementX*.002*sensitivity;
  pitch = THREE.MathUtils.clamp(pitch-event.movementY*.002*sensitivity,-Math.PI/2+.025,Math.PI/2-.025);
});
document.addEventListener('keydown',event=>{
  if(!locked || !controlledKeys.has(event.code))return;
  event.preventDefault();keys.add(event.code);
});
document.addEventListener('keyup',event=>{
  keys.delete(event.code);
  if(locked && controlledKeys.has(event.code))event.preventDefault();
});
function releaseInput() { keys.clear();if(document.pointerLockElement===canvas)document.exitPointerLock(); }
window.addEventListener('blur',releaseInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInput();lastTime=0;accumulator=0;});
document.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach(button=>button.addEventListener('click',()=>{if(ready)setFloor(button.dataset.floor as FloorId);}));
reset.addEventListener('click',()=>{setFloor(activeFloor);status.textContent='Du bist wieder am Startpunkt dieser Etage.';});
$<HTMLInputElement>('sensitivity').addEventListener('input',event=>{sensitivity=Number((event.target as HTMLInputElement).value);});
window.addEventListener('resize',()=>{
  if(!renderer)return;
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);renderDirty=true;
});

function animate(time:number) {
  frameId=requestAnimationFrame(animate);
  const dt = lastTime ? Math.min((time-lastTime)/1000,.1) : 0;lastTime=time;
  if(document.hidden)return;
  if(locked) {
    accumulator+=dt;
    const input = {
      forward:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),
      right:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),
      sprint:keys.has('ShiftLeft')||keys.has('ShiftRight'),
      crouch:keys.has('ControlLeft')||keys.has('ControlRight'),
      jump:keys.has('Space'),
    };
    while(accumulator>=FIXED_DT) {
      const pos=player.body.translation();previousPosition.set(pos.x,pos.y,pos.z);
      previousHeight=player.height;
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
    renderer.render(house.scene,camera);
  } else if(renderDirty) {renderer.render(house.scene,camera);renderDirty=false;}
}

async function init() {
  try {
    if(!canvas.requestPointerLock)throw new Error('Dieser Browser unterstützt keine Maussteuerung. Bitte nutze einen Desktop-Browser mit Maus und Tastatur.');
    renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
    await RAPIER.init();
    setFloor('eg');ready=true;start.disabled=false;reset.disabled=false;
    $<HTMLButtonElement>('import-model').disabled=false;
    try {const saved=localStorage.getItem(MODEL_STORAGE_KEY);if(saved){loadModel(saved);$<HTMLInputElement>('remember-model').checked=true;}} catch {status.textContent='Das gespeicherte Modell konnte nicht geladen werden. Bitte die Hausdatei erneut auswählen.';}
    $('start-label').textContent=customModel?'Haus betreten':'Testraum betreten';
    status.textContent='Ein Klick aktiviert die Maussteuerung. Esc gibt die Maus frei.';
    frameId=requestAnimationFrame(animate);
  } catch(error) {
    console.error(error);
    $('start-label').textContent='Spiel konnte nicht starten';
    status.textContent=error instanceof Error && error.message.startsWith('Dieser Browser') ? error.message : 'Das 3D-Spiel konnte nicht geladen werden. Bitte prüfe WebGL/Hardwarebeschleunigung und lade die Seite neu.';
    status.classList.add('error');
  }
}
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();releaseInput();pause();ready=false;start.disabled=true;
  cancelAnimationFrame(frameId);
  status.textContent='Die Grafikverbindung wurde unterbrochen. Bitte lade die Seite neu.';
});
window.addEventListener('pagehide',()=>{
  releaseInput();cancelAnimationFrame(frameId);
  player?.dispose();house?.dispose();renderer?.dispose();
});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
void init();
