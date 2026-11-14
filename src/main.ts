import * as THREE from 'three';
import './style.css';
import { createUI, el } from './ui';
import { Input } from './systems/input';
import { Character } from './systems/character';
import { FollowCamera } from './systems/camera';
import { AudioSystem } from './systems/audio';
import { move, type GroundPoint } from './systems/movement';
import { loadSave, saveGame, freshSave } from './systems/save';
import { Levels } from './world/levels';
import { radioRoom, station, walkAreas } from './world/layout';

createUI();
const state=loadSave();
let renderer: THREE.WebGLRenderer;
try { renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'}); }
catch { el('viewport').innerHTML='<p style="padding:30vh 10%;position:relative;z-index:20">The White Signal needs WebGL. Please enable hardware acceleration and reload in a supported browser.</p>'; throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
el('viewport').append(renderer.domElement);
renderer.domElement.setAttribute('aria-label','Snow-covered Kestrel Station. Use WASD or the arrow keys to move. Press E to interact.');
const scene=new THREE.Scene();scene.background=new THREE.Color('#152b3b');scene.fog=new THREE.FogExp2('#243f50', .009);
const levels=new Levels(scene), player=new Character(scene), camera=new FollowCamera(), input=new Input(), audio=new AudioSystem();
const flashlight = new THREE.SpotLight('#e7e5bc', 19, 12, .33, .75, 1.4);
scene.add(flashlight, flashlight.target);

const cone = new THREE.Shape();
cone.moveTo(0, 0);
cone.lineTo(5.5, 1.15);
cone.quadraticCurveTo(6.1, 0, 5.5, -1.15);
cone.closePath();
const beamGeometry = new THREE.ShapeGeometry(cone);
const positions = beamGeometry.getAttribute('position');
const falloff = new Float32Array(positions.count);
for (let i = 0; i < positions.count; i++) falloff[i] = 1 - positions.getX(i) / 6;
beamGeometry.setAttribute('strength', new THREE.BufferAttribute(falloff, 1));
beamGeometry.rotateX(-Math.PI / 2);
const beam = new THREE.Mesh(beamGeometry, new THREE.ShaderMaterial({
  vertexShader: `
    attribute float strength;
    varying float lightStrength;
    void main() {
      lightStrength = strength;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying float lightStrength;
    void main() {
      gl_FragColor = vec4(0.77, 0.76, 0.55, max(lightStrength, 0.0) * 0.16);
    }
  `,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(beam);

const waypoint = new THREE.Group();
const halo = new THREE.Mesh(
  new THREE.RingGeometry(0.63, 0.69, 28),
  new THREE.MeshBasicMaterial({ color: '#f2b275', transparent: true, opacity: 0.8 }),
);
halo.rotation.x = -Math.PI / 2;
const diamond = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.19),
  new THREE.MeshBasicMaterial({ color: '#ffd1a1' }),
);
waypoint.add(halo, diamond);
scene.add(waypoint);

function placePlayer(point: GroundPoint) {
  Object.assign(player.body, { x: point.x, z: point.z, y: 0, vx: 0, vy: 0, vz: 0, grounded: true });
  player.body.facing.x = Math.SQRT1_2;
  player.body.facing.z = -Math.SQRT1_2;
  player.update(0);
  camera.update(player.body, 0, state.level === 'inside', true);
}
let manualPause=false, dialogIndex=-1, activePanel:'pause'|'journal'='pause', accumulator=0, last=performance.now(), saveTimer=0, toastTimer=0, time=0;
let nearby: 'entrance' | 'exit' | 'terminal' | '' = '';
const lines=[
 ['UNKNOWN VOICE','…Kestrel. Kestrel, do you read?'],
 ['UNKNOWN VOICE','If you can hear this, keep the lights on. Do not follow the figures in the snow.'],
 ['DR. ELIAS VOSS','This is Dr. Voss. I just arrived. Who is transmitting?'],
 ['UNKNOWN VOICE','You arrived three days ago, Doctor.'],
 ['SYSTEM','SIGNAL LOST. Transmission recorded in your field notes.']
];
function toast(message:string){el('toast').textContent=message;el('toast').style.opacity='1';toastTimer=4;}
function persist(){state.x=player.body.x;state.z=player.body.z;const ok=saveGame(state);el('saveLabel').textContent=ok?'PROGRESS SAVED AUTOMATICALLY':'LOCAL STORAGE UNAVAILABLE';}
function updateObjective(){el('journalButton').querySelector('.unread')!.textContent=state.heard?'2':'1';el('objectiveText').textContent=state.heard?'Investigate the repeating signal':state.level==='inside'?'Investigate the radio terminal':'Reach the research station';el('flashState').textContent=`◉ FLASHLIGHT ${state.flashlight?'ON':'OFF'}`;el('journalButton').setAttribute('aria-label',`Field notes, ${state.heard?'2':'1'} entries`);}
function changeLevel(position: GroundPoint, announce = true) {
 const inside=state.level==='inside';levels.setLevel(inside);
 scene.background=new THREE.Color(inside?'#101c25':'#152b3b');scene.fog=new THREE.FogExp2(inside?'#15232b':'#243f50',inside ? .0045 : .009);
 nearby = '';
 placePlayer(position);
 if (announce) {
  persist();
  audio.beep(330);
  toast(inside ? 'KESTREL STATION  /  COMMUNICATIONS' : 'EXTERIOR  /  KEEP THE LIGHTS ON');
 }
 updateScene(0);
 el('locationTitle').textContent = inside ? 'RADIO ROOM' : 'KESTREL STATION';
 el('sceneLabel').textContent=inside?'INTERIOR · RADIO ROOM':'EXTERIOR · APPROACH';el('worldCaption').hidden=inside;
 el<HTMLHeadingElement>('game').classList.toggle('indoors',inside);updateObjective();
}

function setPause(paused:boolean,panel:'pause'|'journal'='pause'){
 manualPause=paused;activePanel=panel;input.clear();el('overlay').hidden=!paused;audio.pause(paused||document.hidden);
 el('pauseButton').setAttribute('aria-label',paused?'Resume game':'Pause game');
 if(!paused){last=performance.now();return;}
 el('panelTitle').textContent=panel==='journal'?'Field notes':'Expedition paused';
 el('panelContent').innerHTML=panel==='journal'?`<p class="entry">01 / AUGUST 17, 1987</p><p>Kestrel stopped answering at 03:14. No distress call. Just twelve seconds of white noise. I was sent to find out why.</p>${state.heard?'<p class="entry">02 / THE TRANSMISSION</p><p>“You arrived three days ago, Doctor.” The voice knew my name. The terminal logged the same message at 03:14. Next: trace the source of the repeating signal.</p>':'<p>The station has power. Someone may still be inside. Find the entrance and check the communications terminal.</p>'}`:'<p>The storm can wait a moment.</p><p>WASD or arrows to move · Shift to run<br>Space to jump · F for flashlight<br>E to interact · J for field notes · Esc to pause</p>';
 el('resumeButton').focus();
}
function advanceDialogue(){
 dialogIndex++;
 if(dialogIndex>=lines.length){dialogIndex=-1;el('dialogue').hidden=true;state.heard=true;el('journalButton').querySelector('.unread')!.textContent='2';updateObjective();persist();toast('TRANSMISSION ARCHIVED  /  FIELD NOTES UPDATED');return;}
 el('dialogue').hidden=false;el('speaker').textContent=lines[dialogIndex][0];el('dialogueText').textContent=lines[dialogIndex][1];el('nextDialogue').innerHTML=`${dialogIndex===lines.length-1?'ARCHIVE':'CONTINUE'} <kbd>E</kbd> →`;audio.beep(dialogIndex===3?180:540);
}
function interact(){
 if(manualPause)return;
 audio.start();
 if(dialogIndex>=0){advanceDialogue();return;}
 if(nearby==='entrance'){state.level='inside';changeLevel(radioRoom.spawn);}
 else if(nearby==='exit'){state.level='outside';changeLevel({ x: station.entrance.x, z: station.entrance.z + 1.0 });}
 else if(nearby==='terminal'){player.body.vx=0;player.body.vz=0;advanceDialogue();}
}
el('interactButton').addEventListener('click',interact);el('nextDialogue').addEventListener('click',advanceDialogue);
el('pauseButton').addEventListener('click',()=>setPause(!manualPause));
el('journalButton').addEventListener('click',()=>setPause(!(manualPause&&activePanel==='journal'),'journal'));
el('resumeButton').addEventListener('click',()=>setPause(false));
el('soundButton').addEventListener('click',()=>{audio.toggle();el('soundLabel').textContent=audio.muted?'SOUND OFF':'SOUND ON';el('soundButton').setAttribute('aria-label',audio.muted?'Enable audio':'Mute audio');});
el('restartButton').addEventListener('click', () => {
  Object.assign(state, freshSave());
  dialogIndex = -1;
  el('dialogue').hidden = true;
  changeLevel(station.spawn, false);
  persist();
  setPause(false);
  toast('AUGUST 17, 1987  /  THE ARRIVAL');
});
document.addEventListener('visibilitychange',()=>{input.clear();accumulator=0;last=performance.now();if(document.hidden)persist();audio.pause(document.hidden||manualPause);});
window.addEventListener('pagehide',persist);
window.addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='Escape'){e.preventDefault();setPause(!manualPause);}if(e.code==='KeyJ'){e.preventDefault();setPause(!(manualPause&&activePanel==='journal'),'journal');}});
function resize() {
  const viewport = el('viewport');
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  camera.resize(viewport.clientWidth, viewport.clientHeight);
  camera.update(player.body, 0, state.level === 'inside', true);
}
window.addEventListener('resize', resize);

function withinReach(point: GroundPoint & { radius: number }) {
  return player.body.y < 0.6 && Math.hypot(player.body.x - point.x, player.body.z - point.z) < point.radius;
}

function updateScene(dt: number) {
  const inside = state.level === 'inside';
  const { x, y, z, facing } = player.body;
  player.update(dt);
  levels.update(dt, x);
  camera.update(player.body, dt, inside);

  flashlight.visible = state.flashlight;
  flashlight.position.set(x + facing.x * .4, y + 1.05, z + facing.z * .4);
  flashlight.target.position.set(x + facing.x * 7, .05, z + facing.z * 7);
  beam.visible = state.flashlight;
  beam.position.set(x + facing.x * .48, .095, z + facing.z * .48);
  beam.rotation.y = Math.atan2(-facing.z, facing.x);

  const target = inside ? radioRoom.terminal : station.entrance;
  waypoint.visible = dialogIndex < 0;
  waypoint.position.set(target.x, .1, target.z);
  diamond.position.y = 1.08 + Math.sin(time * 2.8) * .16;
  diamond.rotation.y = time * 1.5;
  levels.terminalLight.intensity = 5 + Math.sin(time * 3) * .4;
}

function fixed(dt: number) {
  if (input.pressed('KeyF')) {
    state.flashlight = !state.flashlight;
    updateObjective();
    audio.beep(240);
  }
  const jump = input.pressed('Space');
  // Let an in-flight jump land while the dialogue blocks new movement.
  const talking = dialogIndex >= 0;
  move(player.body, {
    right: talking ? 0 : input.right,
    down: talking ? 0 : input.down,
    run: input.held('ShiftLeft', 'ShiftRight'),
    jump: jump && !talking,
  }, dt, walkAreas[state.level]);

  nearby = '';
  if (!talking) {
    if (state.level === 'outside' && withinReach(station.entrance)) nearby = 'entrance';
    if (state.level === 'inside') {
      if (withinReach(radioRoom.exit)) nearby = 'exit';
      if (withinReach(radioRoom.terminal)) nearby = 'terminal';
    }
  }
  if (input.pressed('KeyE', 'Enter')) interact();
  el('interact').hidden = !nearby || dialogIndex >= 0;
  el('interactText').textContent = nearby === 'entrance' ? 'Enter station'
    : nearby === 'exit' ? 'Return outside' : state.heard ? 'Replay transmission' : 'Use radio terminal';
  const action = el<HTMLButtonElement>('touchAction');
  action.disabled = !nearby && dialogIndex < 0;
  action.textContent = dialogIndex >= 0 ? 'NEXT' : nearby === 'entrance' ? 'ENTER' : nearby === 'exit' ? 'EXIT' : 'USE';

  time += dt;
  updateScene(dt);
  saveTimer += dt;
  if (saveTimer > 5) { persist(); saveTimer = 0; }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) el('toast').style.opacity = '0';
  }
}
function frame(now:number){requestAnimationFrame(frame);const delta=Math.min((now-last)/1000,.1);last=now;if(document.hidden)return;if(!manualPause){accumulator+=delta;while(accumulator>=1/60){fixed(1/60);accumulator-=1/60;}}renderer.render(scene,camera.camera);}
resize();
changeLevel(state, false);
requestAnimationFrame(frame);
setTimeout(()=>toast('The station went silent at 03:14. Find out why.'),900);
