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
import { walkAreas } from './world/layout';
import { expedition, expeditionAreas, type Area } from './world/expedition-layout';
import { available, chapter, currentObjective, endings, has, hotspots, routeTarget, type Hotspot, type Line } from './world/story';
import { archive, type Ending } from './systems/progress';
import { FieldConditions } from './systems/field';
import { Encounter } from './systems/encounter';

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

const field = new FieldConditions();
const encounter = new Encounter();
const figure = new THREE.Group();
const arrow = el('objectiveArrow');
const figureMaterial = new THREE.MeshBasicMaterial({ color: '#152329', transparent: true, opacity: .72 });
const coat = new THREE.Mesh(new THREE.CylinderGeometry(.24, .43, 1.34, 6), figureMaterial);
coat.position.y = .82;
const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 8, 6), figureMaterial);
head.position.y = 1.66;
figure.add(coat, head);
scene.add(figure);

type Panel = 'pause' | 'journal' | 'map' | 'ending';
let panel: Panel | undefined;
let dialogue: { lines: Line[]; index: number; tag: string; finish?: () => void } | undefined;
let nearby: Hotspot | undefined;
let navigation: Hotspot | undefined;
let accumulator = 0;
let last = performance.now();
let saveTimer = 0;
let toastTimer = 0;
let clock = 0;
let stepDistance = 0;
let wasCracking = false;
let lastFieldStatus = '';

const snowy = (area: Area) => area === 'outside' || area === 'ridge' || area === 'crevasse';
const exposed = (area: Area) => area === 'ridge' || area === 'crevasse';
const placeName = (area: Area) => area === 'outside' ? 'Station yard' : area === 'inside' ? 'Radio room' : expedition[area].title;

function formatTime(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

function toast(message: string) {
  el('toast').textContent = message;
  el('toast').style.opacity = '1';
  toastTimer = 5;
}

function persist() {
  state.x = player.body.x;
  state.z = player.body.z;
  el('saveLabel').textContent = saveGame(state) ? 'PROGRESS SAVED AUTOMATICALLY' : 'LOCAL STORAGE UNAVAILABLE';
}

function placePlayer(point: GroundPoint) {
  Object.assign(player.body, { x: point.x, z: point.z, y: 0, vx: 0, vy: 0, vz: 0, grounded: true });
  player.body.facing.x = Math.SQRT1_2;
  player.body.facing.z = -Math.SQRT1_2;
  stepDistance = 0;
  player.update(0);
  camera.update(player.body, 0, state.level, true);
}

function updateObjective() {
  const objective = currentObjective(state);
  navigation = routeTarget(state, objective.target);
  el('objectiveText').textContent = state.level === 'outside' && !has(state, 'heard')
    ? 'Reach the station and listen to the radio' : objective.text;
  el('objectiveRoute').textContent = navigation && navigation.id !== objective.target
    ? navigation.label : '';
  const current = chapter(state);
  el('chapterText').textContent = `CHAPTER ${current.number} / ${current.title}`;
  el('flashState').textContent = `◉ FLASHLIGHT ${state.flashlight ? 'ON' : 'OFF'}`;
  el('evidenceCount').textContent = `EVIDENCE ${state.evidence.length}/${Object.keys(archive).length}`;
  const entries = 1 + state.progress.length + state.evidence.length;
  el('journalButton').querySelector('.unread')!.textContent = String(entries);
  el('journalButton').setAttribute('aria-label', `Field notes, ${entries} entries`);
}

function changeArea(area: Area, point: GroundPoint, announce = true) {
  state.level = area;
  const outdoors = snowy(area);
  levels.setLevel(area);
  field.reset(area);
  wasCracking = false;
  lastFieldStatus = '';
  audio.surface(outdoors);
  scene.background = new THREE.Color(outdoors ? '#152b3b' : '#101c25');
  scene.fog = new THREE.FogExp2(outdoors ? '#243f50' : '#15232b', exposed(area) ? .012 : outdoors ? .009 : .0045);
  el('locationTitle').textContent = (area === 'outside' ? 'Kestrel Station' : placeName(area)).toUpperCase();
  el('sceneLabel').textContent = area === 'outside' ? 'EXTERIOR · STATION YARD'
    : area === 'inside' ? 'INTERIOR · RADIO ROOM' : expedition[area].subtitle;
  el('worldCaption').hidden = area !== 'outside';
  el('fieldMeters').hidden = !exposed(area);
  el('game').classList.toggle('indoors', !outdoors);
  nearby = undefined;
  placePlayer(point);
  updateObjective();
  updateFieldHud();
  updateScene(0);
  updatePrompt();
  if (announce) {
    persist();
    audio.beep(330);
    toast(placeName(area));
  }
}

function addParagraph(content: HTMLElement, text: string, className = '') {
  const p = document.createElement('p');
  p.textContent = text;
  p.className = className;
  content.append(p);
}

function addHeading(content: HTMLElement, text: string) {
  const heading = document.createElement('h3');
  heading.textContent = text;
  content.append(heading);
}

const areaLocks: Partial<Record<Area, Hotspot['requires']>> = {
  quarters: ['heard'], annex: ['locker'], ridge: ['dispatch'], crevasse: ['triangulated'], borehole: ['override'],
};

function setPanel(next?: Panel) {
  panel = next;
  input.clear();
  el('overlay').hidden = !next;
  el('pauseButton').setAttribute('aria-label', next ? 'Resume game' : 'Pause game');
  updatePrompt();
  audio.pause(document.hidden || next === 'pause' || next === 'journal' || next === 'map');
  if (!next) {
    last = performance.now();
    (document.activeElement as HTMLElement | null)?.blur();
    return;
  }

  el('panelTitle').textContent = { pause: 'Expedition paused', journal: 'Field notes', map: 'Expedition map', ending: 'Expedition complete' }[next];
  const content = el('panelContent');
  content.replaceChildren();
  if (next === 'pause') {
    addParagraph(content, 'WASD or arrows to move · Shift to run · Space to jump · F for flashlight · E to interact');
    addParagraph(content, 'J opens Field Notes. M shows the route to your objective. Use the sound button to mute or restore footsteps and signal tones.');
  } else if (next === 'journal') {
    addHeading(content, 'August 17, 1987');
    addParagraph(content, 'Kestrel stopped answering at 03:14. No distress call. Just twelve seconds of white noise.');
    for (const spot of [...hotspots].reverse()) {
      if (!spot.proof || !has(state, spot.proof)) continue;
      addHeading(content, spot.label);
      for (const [speaker, line] of spot.lines ?? []) addParagraph(content, `${speaker} — ${line}`);
    }
    for (const id of state.evidence) {
      addHeading(content, archive[id].title);
      addParagraph(content, archive[id].text);
    }
  } else if (next === 'map') {
    addParagraph(content, `You are here · ${placeName(state.level)}`);
    addParagraph(content, currentObjective(state).text, 'map-route');
    if (navigation) addParagraph(content, `Follow the amber marker · ${navigation.label}`);
    const list = document.createElement('ul');
    list.className = 'map-list';
    for (const area of ['outside', 'inside', ...expeditionAreas] as const) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = placeName(area);
      const status = document.createElement('span');
      status.textContent = area === state.level ? 'YOU ARE HERE' : areaLocks[area]?.every(flag => has(state, flag)) === false ? 'LOCKED' : 'OPEN';
      row.append(name, status);
      list.append(row);
    }
    content.append(list);
  } else {
    addParagraph(content, state.ending === 'seal' ? 'Ending · The chamber is sealed' : 'Ending · The warning reaches the coast');
    addParagraph(content, `${formatTime(state.elapsed)} active time · ${state.evidence.length} of ${Object.keys(archive).length} optional discoveries archived`);
    addParagraph(content, 'Return to the station to look for any evidence you missed.');
  }
  el('resumeButton').focus();
}

function togglePanel(next: Panel) {
  setPanel(panel === next ? undefined : next);
}

function beginDialogue(lines: Line[], tag: string, finish?: () => void) {
  input.clear();
  player.body.vx = 0;
  player.body.vz = 0;
  dialogue = { lines, index: -1, tag, finish };
  advanceDialogue();
  updatePrompt();
}

function advanceDialogue() {
  if (!dialogue || panel || encounter.open) return;
  dialogue.index++;
  const line = dialogue.lines[dialogue.index];
  if (!line) {
    const finish = dialogue.finish;
    dialogue = undefined;
    el('dialogue').hidden = true;
    finish?.();
    updatePrompt();
    return;
  }
  const [speaker, text] = line;
  el('dialogue').hidden = false;
  el('dialogueTag').textContent = dialogue.tag;
  el('speaker').textContent = speaker;
  el('dialogueText').textContent = text;
  el('nextDialogue').firstChild!.textContent = dialogue.index + 1 === dialogue.lines.length ? 'ARCHIVE ' : 'CONTINUE ';
  audio.beep(speaker.includes('VOICE') ? 310 : 460);
}

function complete(spot: Hotspot) {
  if (spot.proof && !has(state, spot.proof)) state.progress.push(spot.proof);
  if (spot.record && !state.evidence.includes(spot.record)) state.evidence.push(spot.record);
  updateObjective();
  persist();
  if (spot.proof === 'heard') toast('The crew quarters are now accessible.');
  else if (spot.record) toast('Evidence archived in Field Notes.');
  else if (spot.proof) toast('Objective updated.');
}

function tell(spot: Hotspot) {
  const entry = spot.record && archive[spot.record];
  const lines: Line[] = entry ? [[entry.title.toUpperCase(), entry.text]] : spot.lines ?? [];
  if (!lines.length) { complete(spot); return; }
  beginDialogue(lines, spot.id === 'terminal' ? 'INCOMING TRANSMISSION · 87.6 MHz' : 'KESTREL · FIELD RECORD', () => complete(spot));
}

function finishExpedition(ending: Ending) {
  encounter.close();
  beginDialogue(endings[ending], 'BOREHOLE NINE · FINAL TRANSMISSION', () => {
    state.ending = ending;
    updateObjective();
    persist();
    setPanel('ending');
  });
}

function interact() {
  if (panel || encounter.open) return;
  if (dialogue) { advanceDialogue(); return; }
  if (!nearby || !available(state, nearby)) return;
  const spot = nearby;
  if (spot.needsLight && !state.flashlight) {
    toast('Too dark to see the floor. Switch on your flashlight.');
    return;
  }
  if (spot.destination) {
    changeArea(spot.destination.area, spot.destination.point);
  } else if (spot.finale) {
    encounter.show('One transmission left', 'The signal is contained for now. What should your last transmission do?', ['Seal the chamber', 'Warn the coast'], choice =>
      finishExpedition(choice === 0 ? 'seal' : 'send'));
  } else if (spot.puzzle) {
    encounter.puzzle(spot.puzzle, choice => audio.beep(spot.id === 'echo' ? [240, 420, 620][choice] : 380 + choice * 85), () => tell(spot));
  } else tell(spot);
}

function updatePrompt() {
  const wall = Boolean(panel || encounter.open);
  const show = nearby && !dialogue && !wall;
  el('interact').hidden = !show;
  if (show) el('interactText').textContent = nearby!.label;
  const action = el<HTMLButtonElement>('touchAction');
  action.disabled = wall || (!nearby && !dialogue);
  action.textContent = dialogue ? 'NEXT' : nearby?.destination ? 'OPEN' : 'USE';
}

function updateFieldHud() {
  el<HTMLMeterElement>('warmth').value = field.warm;
  el<HTMLMeterElement>('attention').value = field.alert * 100;
  el('warmthValue').textContent = field.shelter ? 'HEATING' : `${Math.round(field.warm)}%`;
  el('attentionValue').textContent = field.alert > .50 ? 'TRACKED' : field.alert > .12 ? 'HEARD' : 'QUIET';
  el('whiteout').style.opacity = String(Math.max(0, (37 - field.warm) / 77));
}

function updateScene(dt: number) {
  const { x, y, z, facing } = player.body;
  player.update(dt);
  levels.update(dt, x, z);
  camera.update(player.body, dt, state.level);
  flashlight.visible = state.flashlight;
  flashlight.position.set(x + facing.x * .4, y + 1.05, z + facing.z * .4);
  flashlight.target.position.set(x + facing.x * 7, .05, z + facing.z * 7);
  beam.visible = state.flashlight;
  beam.position.set(x + facing.x * .48, .095, z + facing.z * .48);
  beam.rotation.y = Math.atan2(-facing.z, facing.x);

  waypoint.visible = Boolean(navigation && !dialogue && !encounter.open);
  arrow.hidden = !navigation;
  if (navigation) {
    waypoint.position.set(navigation.x, .1, navigation.z);
    const dx = navigation.x - x;
    const dz = navigation.z - z;
    const range = Math.hypot(dx, dz);
    const angle = Math.atan2((dx + dz) / Math.sqrt(3), dx - dz);
    arrow.style.transform = `rotate(${angle}rad)`;
    const distance = el('objectiveDistance');
    const readout = range < 1.7 ? 'NEARBY' : `${Math.round(range)} M`;
    if (distance.textContent !== readout) distance.textContent = readout;
  } else el('objectiveDistance').textContent = '';
  diamond.position.y = 1.08 + Math.sin(clock * 2.8) * .16;
  diamond.rotation.y = clock * 1.5;
  levels.terminalLight.intensity = 5 + Math.sin(clock * 3) * .4;
  figure.visible = Boolean(field.figure);
  if (field.figure) {
    figure.position.set(field.figure.x, Math.sin(clock * 5) * .035, field.figure.z);
    figureMaterial.opacity = .65 + field.alert * .28 + Math.sin(clock * 9) * .05;
  }
}

function fixed(dt: number) {
  if (!state.ending) state.elapsed += dt;
  clock += dt;
  if (input.pressed('KeyF') && !encounter.open) {
    state.flashlight = !state.flashlight;
    updateObjective();
    audio.beep(240);
  }

  const before = { x: player.body.x, z: player.body.z };
  const grounded = player.body.grounded;
  const stopped = Boolean(dialogue || encounter.open);
  move(player.body, {
    right: stopped ? 0 : input.right,
    down: stopped ? 0 : input.down,
    run: input.held('ShiftLeft', 'ShiftRight'),
    jump: input.pressed('Space') && !stopped,
  }, dt, walkAreas[state.level]);
  const actualDistance = Math.hypot(player.body.x - before.x, player.body.z - before.z);
  const speed = actualDistance / dt;
  if (player.body.grounded) {
    const surface = snowy(state.level) ? 'snow' : 'floor';
    if (!grounded) {
      audio.step(surface, 1.2, true);
      stepDistance = 0;
    } else if (speed > .27) {
      stepDistance += actualDistance;
      const stride = speed > 3.5 ? 1.23 : .89;
      if (stepDistance >= stride) {
        stepDistance -= stride;
        audio.step(surface, speed > 3.5 ? 1.03 : .74);
      }
    } else stepDistance = 0;
  }

  if (!stopped && exposed(state.level)) {
    const result = field.tick(state.level, player.body, speed, state.flashlight, dt);
    const cracking = field.ice > 0;
    if (cracking && !wasCracking) {
      audio.step('snow', 1.3);
      toast('Thin ice cracking. Jump or move back.');
    }
    wasCracking = cracking;
    if (result) {
      placePlayer(result.checkpoint);
      toast(result.message);
      persist();
    }
    const status = field.shelter ? 'heater' : field.alert > .50 ? 'alert' : field.warm < 26 ? 'cold' : '';
    if (!result && status !== lastFieldStatus) {
      if (status === 'heater') toast('Heated beacon · Warmth recovering');
      if (status === 'alert') { audio.beep(130); toast('Something noticed you. Slow down, switch off your light, or reach a beacon.'); }
      if (status === 'cold') toast('Warmth low. Find a heated beacon.');
    }
    lastFieldStatus = status;
    updateFieldHud();
  }

  nearby = undefined;
  if (!stopped && player.body.y < .6) {
    let nearest = Infinity;
    for (const spot of hotspots) {
      if (spot.area !== state.level || !available(state, spot)) continue;
      const distance = Math.hypot(player.body.x - spot.x, player.body.z - spot.z);
      if (distance < spot.radius && distance < nearest) { nearby = spot; nearest = distance; }
    }
  }
  if (input.pressed('KeyE', 'Enter')) interact();
  updatePrompt();
  updateScene(dt);

  saveTimer += dt;
  if (saveTimer >= 5) { persist(); saveTimer = 0; }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) el('toast').style.opacity = '0';
  }
}

el('interactButton').addEventListener('click', interact);
el('nextDialogue').addEventListener('click', advanceDialogue);
el('exitPuzzle').addEventListener('click', () => encounter.close());
el('pauseButton').addEventListener('click', () => togglePanel('pause'));
el('journalButton').addEventListener('click', () => togglePanel('journal'));
el('mapButton').addEventListener('click', () => togglePanel('map'));
el('resumeButton').addEventListener('click', () => setPanel());
const soundButton = el('soundButton');
const soundPreference = 'the-white-signal:sound';
try { audio.muted = localStorage.getItem(soundPreference) === 'off'; }
catch { audio.muted = false; }
function showSoundStatus() {
  el('soundLabel').textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
  soundButton.setAttribute('aria-label', audio.muted ? 'Enable audio' : 'Mute audio');
}
showSoundStatus();
function enableSoundOnInput(event: Event) {
  if (!event.isTrusted) return;
  window.removeEventListener('keydown', enableSoundOnInput);
  window.removeEventListener('pointerdown', enableSoundOnInput);
  audio.start();
}
window.addEventListener('keydown', enableSoundOnInput);
window.addEventListener('pointerdown', enableSoundOnInput);
soundButton.addEventListener('click', () => {
  audio.toggle();
  try { localStorage.setItem(soundPreference, audio.muted ? 'off' : 'on'); } catch { /* Audio still works without storage. */ }
  showSoundStatus();
});
el('restartButton').addEventListener('click', () => {
  if (!window.confirm('Restart the expedition and clear this checkpoint?')) return;
  Object.assign(state, freshSave(), { ending: undefined });
  encounter.close();
  dialogue = undefined;
  el('dialogue').hidden = true;
  changeArea(state.level, state);
  setPanel();
});

window.addEventListener('keydown', event => {
  if (event.repeat) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    if (panel) setPanel();
    else if (encounter.open) encounter.close();
    else togglePanel('pause');
    return;
  }
  if (event.code === 'KeyJ') togglePanel('journal');
  if (event.code === 'KeyM') togglePanel('map');
  if (!panel && encounter.open && /^Digit[1-9]$/.test(event.code)) encounter.press(Number(event.key) - 1);
});
document.addEventListener('visibilitychange', () => {
  input.clear();
  accumulator = 0;
  last = performance.now();
  if (document.hidden) persist();
  audio.pause(document.hidden || Boolean(panel));
});
window.addEventListener('pagehide', persist);

function resize() {
  const viewport = el('viewport');
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  camera.resize(viewport.clientWidth, viewport.clientHeight);
  camera.update(player.body, 0, state.level, true);
}
window.addEventListener('resize', resize);

function frame(now: number) {
  requestAnimationFrame(frame);
  const delta = Math.min((now - last) / 1000, .1);
  last = now;
  if (document.hidden) return;
  if (!panel) {
    accumulator += delta;
    while (accumulator >= 1 / 60) { fixed(1 / 60); accumulator -= 1 / 60; }
  }
  el('elapsed').textContent = formatTime(state.elapsed);
  renderer.render(scene, camera.camera);
}

resize();
changeArea(state.level, state, false);
requestAnimationFrame(frame);
