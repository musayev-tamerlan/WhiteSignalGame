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
import { expedition, expeditionAreas, isFieldArea, type Area } from './world/expedition-layout';
import { available, chapter, coastEpilogue, currentObjective, endings, has, hotspots, matchesEnding, routeTarget, type Hotspot, type Line } from './world/story';
import { archive, type Ending } from './systems/progress';
import { FieldConditions } from './systems/field';
import { Encounter } from './systems/encounter';
import { actions, keyName, loadSettings, saveSettings, type Action } from './systems/settings';
import { Achievements, achievementList, type AchievementId } from './systems/achievements';
import type { PadCommand } from './systems/input';

createUI();
const state=loadSave();
const settings = loadSettings();
const achievements = new Achievements();
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

// Footprints left in the snow. The figure can follow fresh ones.
const printGeometry = new THREE.PlaneGeometry(.2, .1);
printGeometry.rotateX(-Math.PI / 2);
const prints = new THREE.InstancedMesh(printGeometry, new THREE.MeshBasicMaterial({ color: '#3d5867', transparent: true, opacity: .55, depthWrite: false }), 80);
prints.frustumCulled = false;
scene.add(prints);
const printMatrix = new THREE.Matrix4();
const printRotation = new THREE.Quaternion();
const printScale = new THREE.Vector3();
const printPosition = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

type Panel = 'menu' | 'pause' | 'journal' | 'map' | 'ending' | 'settings' | 'achievements';
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
let heartbeat = 0;
let captionTimer = 0;
let titleTimer = 0;
let idleTimer = 0;
let lastChapter = '';
let settingsReturn: Panel = 'pause';
let rebinding: Action | undefined;
let wasTracking = false;
let wasStorm = false;
const visited = new Set<Area>();

const snowy = (area: Area) => area === 'outside' || isFieldArea(area);
const exposed = isFieldArea;
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

/** Text for sounds, so the game reads the same with audio off. */
function caption(text: string, seconds = 3.2) {
  if (!settings.captions) return;
  el('caption').textContent = `[${text}]`;
  el('caption').classList.add('show');
  captionTimer = seconds;
}

function award(id: AchievementId) {
  if (!achievements.unlock(id)) return;
  audio.beep(880);
  setTimeout(() => toast(`Achievement · ${achievementList[id].title}`), 900);
}

const areaSounds: Partial<Record<Area, string>> = {
  inside: 'Radio static hisses under the hum of the racks',
  annex: 'Generators drone behind the wall',
  ridge: 'Wind howls across the ridge',
  crevasse: 'Ice creaks somewhere below',
  borehole: 'A slow pulse rises from the shaft',
  coast: 'Waves break against the sea ice',
};

const barks: Partial<Record<Area, string>> = {
  quarters: 'VOSS — Six bunks. Somebody kept making the seventh.',
  annex: 'VOSS — It smells of burnt insulation and coffee.',
  ridge: 'VOSS — Three towers. Three bearings. Keep the light low out here.',
  crevasse: 'VOSS — The trench swallows sound. Not footsteps, though.',
  borehole: 'VOSS — It’s warm down here. It shouldn’t be.',
  coast: 'VOSS — The coast was supposed to be safe.',
};

function applySettings() {
  input.bindings = settings.keys;
  field.difficulty = settings.difficulty;
  audio.setVolume(settings.volume);
  document.documentElement.style.setProperty('--text-scale', String(settings.textScale));
  document.documentElement.lang = settings.language;
  el('caption').classList.toggle('hidden-ui', !settings.captions);
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
  if (current.number !== lastChapter) {
    if (!(current.number in state.splits)) state.splits[current.number] = state.elapsed;
    if (lastChapter) showTitleCard(current.number, current.title);
    lastChapter = current.number;
  }
  el('flashState').textContent = `◉ FLASHLIGHT ${state.flashlight ? 'ON' : 'OFF'}`;
  el('evidenceCount').textContent = `EVIDENCE ${state.evidence.length}/${Object.keys(archive).length}`;
  const entries = 1 + state.progress.length + state.evidence.length;
  el('journalButton').querySelector('.unread')!.textContent = String(entries);
  el('journalButton').setAttribute('aria-label', `Field notes, ${entries} entries`);
}

function showTitleCard(number: string, title: string) {
  el('titleCardNumber').textContent = `CHAPTER ${number}`;
  el('titleCardTitle').textContent = title;
  el('titleCard').classList.add('show');
  titleTimer = 3.4;
}

function changeArea(area: Area, point: GroundPoint, announce = true) {
  if (state.level === 'crevasse' && area === 'borehole' && !field.tracked) award('ghost');
  state.level = area;
  const outdoors = snowy(area);
  levels.setLevel(area);
  field.reset(area);
  wasCracking = false;
  lastFieldStatus = '';
  audio.surface(outdoors);
  audio.ambience(area === 'outside' ? 'yard' : area === 'inside' ? 'radio' : area);
  scene.background = new THREE.Color(outdoors ? '#152b3b' : '#101c25');
  scene.fog = new THREE.FogExp2(outdoors ? '#243f50' : '#15232b', exposed(area) ? .012 : outdoors ? .009 : .0045);
  el('locationTitle').textContent = (area === 'outside' ? 'Kestrel Station' : placeName(area)).toUpperCase();
  el('sceneLabel').textContent = area === 'outside' ? 'EXTERIOR · STATION YARD'
    : area === 'inside' ? 'INTERIOR · RADIO ROOM' : expedition[area].subtitle;
  el('worldCaption').hidden = area !== 'outside';
  el('fieldMeters').hidden = !exposed(area);
  el('battery').parentElement!.hidden = settings.difficulty === 'story';
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
    const sound = areaSounds[area];
    if (sound) caption(sound);
    const bark = barks[area];
    if (bark && !visited.has(area)) setTimeout(() => { if (state.level === area && !dialogue) toast(bark); }, 2600);
  }
  visited.add(area);
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
  audio.pause(document.hidden || Boolean(next && next !== 'ending'));
  if (!next) {
    last = performance.now();
    (document.activeElement as HTMLElement | null)?.blur();
    return;
  }

  el('panelTitle').textContent = {
    menu: 'The White Signal', pause: 'Expedition paused', journal: 'Field notes', map: 'Expedition map',
    ending: 'Expedition complete', settings: 'Settings', achievements: 'Achievements',
  }[next];
  const content = el('panelContent');
  const actionsBox = el('panelActions');
  content.replaceChildren();
  actionsBox.replaceChildren();
  const fixedButtons = next !== 'menu' && next !== 'settings' && next !== 'achievements';
  el('resumeButton').classList.toggle('hidden-ui', !fixedButtons);
  el('restartButton').classList.toggle('hidden-ui', next !== 'pause');
  const action = (label: string, run: () => void) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', run);
    actionsBox.append(button);
    return button;
  };
  const k = (name: Action) => keyName(settings.keys[name]);
  if (next === 'menu') {
    addParagraph(content, 'Antarctica, August 17, 1987. Kestrel Station stopped answering at 03:14 UTC.');
    if (state.cycle) addParagraph(content, `Cycle ${state.cycle + 1}. Some of this will feel familiar.`, 'map-route');
    const started = state.elapsed > 0 || state.progress.length > 0;
    if (started) action(`CONTINUE · ${formatTime(state.elapsed)} · CHAPTER ${chapter(state).number}`, () => setPanel());
    action(started ? 'NEW EXPEDITION' : 'BEGIN EXPEDITION', () => {
      if (started && !window.confirm('Start over and clear this checkpoint?')) return;
      startExpedition(0);
    });
    if (has(state, 'caller')) action('NEW CYCLE · KEEP YOUR MEMORIES', () => startExpedition(state.cycle + 1));
    action('SETTINGS', () => { settingsReturn = 'menu'; setPanel('settings'); });
    action('ACHIEVEMENTS', () => { settingsReturn = 'menu'; setPanel('achievements'); });
  } else if (next === 'settings') {
    const row = (label: string, control: HTMLElement) => {
      const line = document.createElement('label');
      line.className = 'settings-row';
      line.append(label, control);
      content.append(line);
    };
    const toggle = (label: string, value: () => string, change: () => void) => {
      const button = document.createElement('button');
      button.textContent = value();
      button.addEventListener('click', () => { change(); saveSettings(settings); applySettings(); button.textContent = value(); });
      row(label, button);
      return button;
    };
    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0'; volume.max = '1'; volume.step = '.05';
    volume.value = String(settings.volume);
    volume.addEventListener('input', () => { settings.volume = Number(volume.value); saveSettings(settings); applySettings(); });
    row('Volume', volume);
    toggle('Text size', () => `${Math.round(settings.textScale * 100)}%`, () => {
      settings.textScale = settings.textScale === 1 ? 1.15 : settings.textScale === 1.15 ? 1.3 : 1;
    });
    toggle('Sound captions', () => settings.captions ? 'ON' : 'OFF', () => { settings.captions = !settings.captions; });
    toggle('Difficulty', () => ({ story: 'STORY · no capture, mild cold', normal: 'NORMAL', hard: 'HARD · colder, sharper ears' })[settings.difficulty], () => {
      settings.difficulty = settings.difficulty === 'normal' ? 'hard' : settings.difficulty === 'hard' ? 'story' : 'normal';
    });
    toggle('Language', () => settings.language === 'ru' ? 'РУССКИЙ' : 'ENGLISH', () => {
      settings.language = settings.language === 'en' ? 'ru' : 'en';
    });
    addHeading(content, 'Keys · click, then press a key');
    for (const name of actions) {
      const button = toggle(name.toUpperCase(), () => rebinding === name ? 'PRESS A KEY…' : k(name), () => { rebinding = name; });
      button.dataset.action = name;
    }
    addParagraph(content, 'Arrow keys and Enter always work. Gamepad: stick or D-pad to move, A interact, B jump, X flashlight, Y field notes, shoulder buttons run, Back map, Start pause.');
    action('BACK', () => setPanel(settingsReturn));
  } else if (next === 'achievements') {
    for (const [id, entry] of Object.entries(achievementList)) {
      const p = document.createElement('p');
      p.className = `achievement${achievements.earned.has(id as AchievementId) ? ' earned' : ''}`;
      const title = document.createElement('strong');
      title.textContent = `${achievements.earned.has(id as AchievementId) ? '◆' : '◇'} ${entry.title}`;
      p.append(title, ` — ${entry.text}`);
      content.append(p);
    }
    action('BACK', () => setPanel(settingsReturn));
  } else if (next === 'pause') {
    addParagraph(content, `${k('up')}${k('left')}${k('down')}${k('right')} or arrows to move · ${k('run')} to run · ${k('jump')} to jump · ${k('flashlight')} for flashlight · ${k('interact')} to interact`);
    addParagraph(content, `${k('journal')} opens Field Notes. ${k('map')} shows the route to your objective. Use the sound button to mute or restore footsteps and signal tones.`);
    addSplits(content);
    action('SETTINGS', () => { settingsReturn = 'pause'; setPanel('settings'); });
    action('ACHIEVEMENTS', () => { settingsReturn = 'pause'; setPanel('achievements'); });
    action('MAIN MENU', () => setPanel('menu'));
  } else if (next === 'journal') {
    addHeading(content, 'August 17, 1987');
    addParagraph(content, state.cycle
      ? 'Kestrel stopped answering at 03:14. Again. The handwriting in these notes is already mine.'
      : 'Kestrel stopped answering at 03:14. No distress call. Just twelve seconds of white noise.');
    for (const spot of [...hotspots].reverse()) {
      if (!spot.proof || !has(state, spot.proof) || !matchesEnding(state, spot)) continue;
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
      const locked = area === 'coast' ? !state.ending : areaLocks[area]?.every(flag => has(state, flag)) === false;
      status.textContent = area === state.level ? 'YOU ARE HERE' : locked ? 'LOCKED' : 'OPEN';
      row.append(name, status);
      list.append(row);
    }
    content.append(list);
  } else {
    const epilogue = has(state, 'caller');
    addParagraph(content, state.ending === 'seal' ? 'Ending · The chamber is sealed' : 'Ending · The warning reaches the coast');
    if (epilogue) addParagraph(content, 'Epilogue · The coast falls silent');
    addParagraph(content, `${formatTime(state.elapsed)} active time · ${state.evidence.length} of ${Object.keys(archive).length} optional discoveries archived`);
    addParagraph(content, epilogue
      ? 'Return to the station or the coast to look for any evidence you missed.'
      : 'Chapter 06 is open. Something on the coast is still answering. Take the lift up and follow the erased road from the crevasse.');
    addSplits(content);
    if (epilogue) action('NEW CYCLE · KEEP YOUR MEMORIES', () => startExpedition(state.cycle + 1));
  }
  (content.querySelector<HTMLElement>('button, input') ?? actionsBox.querySelector('button') ?? el('resumeButton')).focus();
  content.parentElement!.scrollTop = 0;
}

function addSplits(content: HTMLElement) {
  const chapters = Object.entries(state.splits).sort(([a], [b]) => a.localeCompare(b));
  if (!chapters.length) return;
  addHeading(content, 'Chapter splits');
  const table = document.createElement('table');
  table.className = 'splits';
  chapters.forEach(([number, start], index) => {
    const end = chapters[index + 1]?.[1] ?? state.elapsed;
    const row = table.insertRow();
    row.insertCell().textContent = `Chapter ${number}`;
    row.insertCell().textContent = formatTime(end - start);
  });
  const total = table.insertRow();
  total.insertCell().textContent = 'Total';
  total.insertCell().textContent = formatTime(state.elapsed);
  content.append(table);
}

function startExpedition(cycle: number) {
  Object.assign(state, freshSave(), { ending: undefined, cycle });
  encounter.close();
  dialogue = undefined;
  el('dialogue').hidden = true;
  lastChapter = '';
  visited.clear();
  if (cycle) award('loop');
  changeArea(state.level, state);
  setPanel();
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
  if (spot.proof === 'heard') award('signal');
  if (state.evidence.length === Object.keys(archive).length) award('archivist');
  if (spot.proof === 'caller') {
    award('silence');
    if (state.elapsed < 25 * 60) award('swift');
  }
  updateObjective();
  persist();
  if (spot.proof === 'caller') {
    beginDialogue(coastEpilogue(state), 'HALVARD COAST · LAST TRANSMISSION', () => setPanel('ending'));
    return;
  }
  if (spot.proof === 'heard') toast('The crew quarters are now accessible.');
  else if (spot.record) toast('Evidence archived in Field Notes.');
  else if (spot.proof) toast('Objective updated.');
}

function tell(spot: Hotspot) {
  const entry = spot.record && archive[spot.record];
  const lines: Line[] = entry ? [[entry.title.toUpperCase(), entry.text]] : spot.lines ?? [];
  if (!lines.length) { complete(spot); return; }
  const tag = spot.id === 'terminal' ? 'INCOMING TRANSMISSION · 87.6 MHz' : spot.area === 'coast' ? 'HALVARD COAST · FIELD RECORD' : 'KESTREL · FIELD RECORD';
  beginDialogue(lines, tag, () => complete(spot));
}

function finishExpedition(ending: Ending) {
  encounter.close();
  beginDialogue(endings[ending], 'BOREHOLE NINE · FINAL TRANSMISSION', () => {
    state.ending = ending;
    award(ending === 'seal' ? 'sealed' : 'warned');
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
  el('interact').querySelector('kbd')!.textContent = keyName(settings.keys.interact);
  const action = el<HTMLButtonElement>('touchAction');
  action.disabled = wall || (!nearby && !dialogue);
  action.textContent = dialogue ? 'NEXT' : nearby?.destination ? 'OPEN' : 'USE';
}

function updateFieldHud() {
  el<HTMLMeterElement>('warmth').value = field.warm;
  el<HTMLMeterElement>('attention').value = field.alert * 100;
  el('warmthValue').textContent = field.shelter ? 'HEATING' : `${Math.round(field.warm)}%`;
  el('attentionValue').textContent = field.alert > .50 ? 'TRACKED' : field.alert > .12 ? 'HEARD' : 'QUIET';
  el('whiteout').style.opacity = String(Math.max(0, (37 - field.warm) / 77, field.storm * .35));
  el<HTMLMeterElement>('battery').value = field.battery;
  el('batteryValue').textContent = `${Math.round(field.battery)}%`;
}

function updateScene(dt: number) {
  const { x, y, z, facing } = player.body;
  player.update(dt);
  levels.update(dt * (1 + field.storm * 2.5), x, z);
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
  prints.visible = exposed(state.level);
  if (prints.visible) {
    prints.count = field.prints.length;
    field.prints.forEach((print, i) => {
      const fade = Math.max(.15, 1 - print.age / 26);
      printRotation.setFromAxisAngle(up, -print.angle);
      printPosition.set(print.x + Math.sin(print.angle) * (i % 2 ? .09 : -.09), .03, print.z - Math.cos(print.angle) * (i % 2 ? .09 : -.09));
      printScale.set(fade, 1, fade);
      prints.setMatrixAt(i, printMatrix.compose(printPosition, printRotation, printScale));
    });
    prints.instanceMatrix.needsUpdate = true;
  }
  figure.visible = Boolean(field.figure);
  if (field.figure) {
    figure.position.set(field.figure.x, Math.sin(clock * 5) * .035, field.figure.z);
    figureMaterial.opacity = .65 + field.alert * .28 + Math.sin(clock * 9) * .05;
  }
}

function fixed(dt: number) {
  if (!has(state, 'caller')) state.elapsed += dt;
  clock += dt;
  if (input.pressed('flashlight') && !encounter.open) {
    if (!state.flashlight && exposed(state.level) && field.battery <= 0) toast('Battery flat. Recharge at a heated beacon.');
    else {
      state.flashlight = !state.flashlight;
      updateObjective();
      audio.beep(240);
    }
  }
  if (state.flashlight && exposed(state.level) && field.battery <= 0) {
    state.flashlight = false;
    updateObjective();
    toast('Your flashlight died. Heated beacons recharge it.');
    caption('Flashlight clicks off');
  }

  const before = { x: player.body.x, z: player.body.z };
  const grounded = player.body.grounded;
  const stopped = Boolean(dialogue || encounter.open);
  move(player.body, {
    right: stopped ? 0 : input.right,
    down: stopped ? 0 : input.down,
    run: input.held('run'),
    jump: input.pressed('jump') && !stopped,
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
      caption('Ice cracking underfoot');
    }
    const storming = field.storm > .4;
    if (storming !== wasStorm) {
      toast(storming ? 'Storm gust. Colder, but the wind hides your steps.' : 'The gust passes.');
      caption(storming ? 'Wind rising to a roar' : 'Wind dropping');
      wasStorm = storming;
    }
    audio.gust(field.storm);
    if (field.tracking && !wasTracking) caption('Slow footsteps, following your trail');
    wasTracking = field.tracking;
    wasCracking = cracking;
    if (result) {
      placePlayer(result.checkpoint);
      toast(result.message);
      award('thaw');
      persist();
    }
    const status = field.shelter ? 'heater' : field.alert > .50 ? 'alert' : field.warm < 26 ? 'cold' : '';
    if (!result && status !== lastFieldStatus) {
      if (status === 'heater') toast('Heated beacon · Warmth recovering');
      if (status === 'alert') { audio.beep(130); toast('Something noticed you. Slow down, switch off your light, or reach a beacon.'); }
      if (status === 'cold') toast('Warmth low. Find a heated beacon.');
    }
    lastFieldStatus = status;
    // The heartbeat starts once the figure hears you and quickens as it closes in.
    heartbeat -= dt;
    if (field.alert > .12 && !field.shelter && heartbeat <= 0) {
      if (heartbeat < -1.5) caption('Your heartbeat, loud in your ears');
      audio.heartbeat(field.alert);
      heartbeat = 1.25 - field.alert * .7;
    }
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
  if (input.pressed('interact')) interact();
  if (input.pressed('journal')) togglePanel('journal');
  if (input.pressed('map')) togglePanel('map');
  // A gentle nudge for players who stop moving for a long time.
  idleTimer = speed > .2 || dialogue || encounter.open ? 0 : idleTimer + dt;
  if (idleTimer > 50) {
    idleTimer = 0;
    toast(`VOSS — Where was I headed? (${keyName(settings.keys.map)}: map)`);
  }
  updatePrompt();
  updateScene(dt);

  saveTimer += dt;
  if (saveTimer >= 5) { persist(); saveTimer = 0; }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) el('toast').style.opacity = '0';
  }
  if (captionTimer > 0) {
    captionTimer -= dt;
    if (captionTimer <= 0) el('caption').classList.remove('show');
  }
  if (titleTimer > 0) {
    titleTimer -= dt;
    if (titleTimer <= 0) el('titleCard').classList.remove('show');
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
  startExpedition(0);
});

function back() {
  if (panel === 'settings' || panel === 'achievements') setPanel(settingsReturn);
  else if (panel === 'menu') return;
  else if (panel) setPanel();
  else if (encounter.open) encounter.close();
  else togglePanel('pause');
}

// Capture phase, so a key being rebound never also triggers its old action.
window.addEventListener('keydown', event => {
  if (!rebinding) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.code !== 'Escape') {
    settings.keys[rebinding] = event.code;
    saveSettings(settings);
    applySettings();
  }
  rebinding = undefined;
  setPanel('settings');
}, true);

window.addEventListener('keydown', event => {
  if (event.repeat) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    back();
    return;
  }
  if (panel === 'journal' && input.matches('journal', event.code)) setPanel();
  else if (panel === 'map' && input.matches('map', event.code)) setPanel();
  if (!panel && encounter.open && /^Digit[1-9]$/.test(event.code)) encounter.press(Number(event.key) - 1);
});

// Gamepad focus moves between the buttons of whichever menu or puzzle is open.
input.onPad = (command: PadCommand) => {
  if (command === 'pause') {
    if (panel === 'pause') setPanel();
    else if (!panel && !encounter.open) setPanel('pause');
    return;
  }
  if (command === 'back') { back(); return; }
  const container = panel ? el('overlay') : el('puzzle');
  const focusable = Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]):not(.hidden-ui), input'))
    .filter(item => item.offsetParent !== null);
  const active = document.activeElement as HTMLElement | null;
  if (command === 'confirm') {
    (active && focusable.includes(active) ? active : focusable[0])?.click();
    return;
  }
  if (active instanceof HTMLInputElement && active.type === 'range' && (command === 'left' || command === 'right')) {
    if (command === 'left') active.stepDown(); else active.stepUp();
    active.dispatchEvent(new Event('input'));
    return;
  }
  const index = active ? focusable.indexOf(active) : -1;
  const step = command === 'up' || command === 'left' ? -1 : 1;
  focusable[(index + step + focusable.length) % focusable.length]?.focus();
};
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
  input.pollGamepad(Boolean(panel || encounter.open));
  if (!panel) {
    accumulator += delta;
    while (accumulator >= 1 / 60) { fixed(1 / 60); accumulator -= 1 / 60; }
  }
  el('elapsed').textContent = formatTime(state.elapsed);
  renderer.render(scene, camera.camera);
}

// Development-only hooks for browser checks. Vite strips this block from production builds.
if (import.meta.env.DEV) {
  Object.assign(window, { whiteSignal: {
    state,
    go: (area: Area, x: number, z: number) => changeArea(area, { x, z }),
    close: () => setPanel(),
    field,
    grant: (...flags: typeof state.progress) => { state.progress.push(...flags.filter(flag => !has(state, flag))); updateObjective(); },
    // Advance the fixed simulation without rendering, for checks in a hidden tab.
    tick: (frames = 1) => { for (let i = 0; i < frames; i++) if (!panel) fixed(1 / 60); },
  } });
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* The game works online without it. */ });
}

applySettings();
resize();
changeArea(state.level, state, false);
setPanel('menu');
requestAnimationFrame(frame);
