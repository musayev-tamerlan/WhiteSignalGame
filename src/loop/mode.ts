import * as THREE from 'three';
import { el } from '../ui';
import { t, tf } from '../i18n';
import type { AudioSystem } from '../systems/audio';
import type { FollowCamera } from '../systems/camera';
import type { Character } from '../systems/character';
import type { Input } from '../systems/input';
import type { Settings } from '../systems/settings';
import type { Voice } from '../systems/voice';
import { initial, parse, replay, solve, step, tileAt, type Board, type Dir, type LoopEvent, type Sim } from './engine';
import { levels, type LevelDef } from './levels';
import { dailyLevel, dayNumber, decodeLevel, encodeLevel, shareCard } from './share';
import { loadLoopProgress, recordDaily, rooms, saveLoopProgress, starsFor, suits, totalStars, type LoopProgress } from './progress';
import { openEditor } from './editor';
import { shareText } from './telegram';

export interface LoopDeps {
  scene: THREE.Scene;
  player: Character;
  makeCharacter: () => Character;
  camera: FollowCamera;
  input: Input;
  audio: AudioSystem;
  voice: Voice;
  settings: Settings;
  vibrate: (pattern: number | number[]) => void;
  onExit: () => void;
}

type Screen = 'select' | 'win' | 'station' | 'editor';
const STEP_TIME = .16;

/** Daily levels are named by number so the name can be translated. */
export const levelName = (level: LevelDef) => level.id.startsWith('daily-') ? tf('Signal #{0}', level.id.slice(6)) : t(level.name);

const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string, glow = 0) {
  const id = color + glow;
  if (!materials.has(id)) materials.set(id, new THREE.MeshStandardMaterial({ color, roughness: .9, emissive: glow ? color : '#000', emissiveIntensity: glow }));
  return materials.get(id)!;
}
const cube = new THREE.BoxGeometry(1, 1, 1);

/**
 * Loop mode: a short puzzle game where each attempt is replayed by Voss's past
 * selves. It borrows the renderer, camera, input and audio from the campaign.
 */
export class LoopMode {
  active = false;
  progress: LoopProgress = loadLoopProgress();
  private readonly group = new THREE.Group();
  private level?: LevelDef;
  private board?: Board;
  private echoes: string[] = [];
  private current = '';
  private sim?: Sim;
  private previous?: Sim;
  private animation = 1;
  private hinted = false;
  private hintMarks = new THREE.Group();
  private readonly echoCharacters: Character[] = [];
  private figures: THREE.Group[] = [];
  private doors = new Map<string, THREE.Mesh[]>();
  private fuses: THREE.Mesh[] = [];
  private ice = new Map<number, THREE.Mesh>();
  private receiver?: THREE.Mesh;
  private repeat = 0;
  private held?: Dir;
  private busyUntil = 0;
  private clock = 0;
  private returnTo: Screen = 'select';
  private swipe?: { x: number; y: number };

  constructor(private readonly deps: LoopDeps) {
    deps.scene.add(this.group, this.hintMarks);
    this.group.visible = false;
    document.querySelectorAll<HTMLButtonElement>('[data-loop]').forEach(button => {
      button.addEventListener('click', () => this.command(button.dataset.loop!));
    });
    el('loopMenu').addEventListener('click', () => this.show('select'));
    window.addEventListener('keydown', event => this.key(event));
    const viewport = el('viewport');
    viewport.addEventListener('pointerdown', event => { if (this.active) this.swipe = { x: event.clientX, y: event.clientY }; });
    viewport.addEventListener('pointerup', event => {
      if (!this.active || !this.swipe) return;
      const dx = event.clientX - this.swipe.x, dy = event.clientY - this.swipe.y;
      this.swipe = undefined;
      if (Math.hypot(dx, dy) < 24) return;
      // Screen diagonals map to grid axes in the isometric view.
      this.act(dx >= 0 ? (dy < 0 ? 'U' : 'R') : (dy > 0 ? 'D' : 'L'));
    });
  }

  // ——— Entering and leaving ———

  enter(shared?: LevelDef) {
    this.active = true;
    this.progress = loadLoopProgress();
    el('game').classList.add('loop-mode');
    el('loopHud').hidden = false;
    this.deps.scene.background = new THREE.Color('#0b151c');
    this.deps.scene.fog = new THREE.FogExp2('#0b151c', .006);
    this.deps.audio.ambience('radio');
    this.deps.audio.surface(false);
    this.group.visible = true;
    this.deps.player.setVisible(true);
    this.applySuit();
    if (shared) this.start(shared, 'select');
    else this.show('select');
  }

  exit() {
    this.active = false;
    el('game').classList.remove('loop-mode');
    el('loopHud').hidden = true;
    el('loopOverlay').hidden = true;
    this.group.visible = false;
    this.hintMarks.clear();
    for (const echo of this.echoCharacters) echo.setVisible(false);
    this.deps.player.setLook(null);
    this.deps.voice.stop();
    this.deps.onExit();
  }

  get overlayOpen() { return !el('loopOverlay').hidden; }

  /** Escape and the gamepad's B: close a panel, or open the level list. */
  back() {
    if (this.overlayOpen && this.level && el('loopPanelTitle').dataset.screen !== 'win') { el('loopOverlay').hidden = true; return; }
    this.show('select');
  }

  // ——— Panels ———

  show(screen: Screen) {
    el('loopOverlay').hidden = false;
    el('loopPanelTitle').dataset.screen = screen;
    const content = el('loopPanelContent'), actions = el('loopPanelActions');
    content.replaceChildren();
    actions.replaceChildren();
    const paragraph = (text: string, className = '') => {
      const p = document.createElement('p');
      p.textContent = text;
      p.className = className;
      content.append(p);
      return p;
    };
    const button = (label: string, run: () => void, parent: HTMLElement = actions) => {
      const item = document.createElement('button');
      item.textContent = label;
      item.addEventListener('click', run);
      parent.append(item);
      return item;
    };

    if (screen === 'select') {
      el('loopPanelTitle').textContent = t('Loop');
      paragraph(t('Every attempt lasts until 03:14. Then your past selves repeat their steps alongside you. Hold doors, lure the figures, carry the fuse — together.'));
      const day = dayNumber();
      const doneToday = this.progress.daily.last === day;
      button(tf('📡 SIGNAL OF THE DAY #{0}', day) + (this.progress.daily.streak ? tf(' · streak {0}', this.progress.daily.streak) : '') + (doneToday ? ' ✓' : ''),
        () => this.start(dailyLevel(day), 'select'));
      const list = document.createElement('div');
      list.className = 'loop-levels';
      levels.forEach((level, index) => {
        const unlocked = index === 0 || (this.progress.stars[levels[index - 1].id] ?? 0) > 0;
        const stars = this.progress.stars[level.id] ?? 0;
        const item = button(`${index + 1}. ${t(level.name)}  ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, () => this.start(level, 'select'), list);
        item.disabled = !unlocked;
        if (!unlocked) item.textContent = `${index + 1}. 🔒`;
      });
      content.append(list);
      button(tf('🛠 RESTORE KESTREL · ★ {0}', totalStars(this.progress)), () => this.show('station'));
      button(t('✏ LEVEL EDITOR'), () => this.show('editor'));
      button(t('← BACK TO THE EXPEDITION'), () => this.exit());
    } else if (screen === 'station') {
      el('loopPanelTitle').textContent = t('Restore Kestrel');
      const stars = totalStars(this.progress);
      paragraph(tf('Stars earned in Loop repair the station. You have ★ {0}.', stars));
      for (const room of rooms) {
        const restored = this.progress.rooms.includes(room.id);
        const row = document.createElement('div');
        row.className = 'loop-room';
        const title = document.createElement('strong');
        title.textContent = `${restored ? '◆' : '◇'} ${t(room.title)} · ★ ${room.cost}`;
        row.append(title);
        if (restored) {
          const story = document.createElement('p');
          story.textContent = t(room.story);
          row.append(story);
        } else {
          const restore = button(t('RESTORE'), () => {
            this.progress.rooms.push(room.id);
            saveLoopProgress(this.progress);
            this.deps.audio.beep(660);
            this.say('FIELD LOG', room.story);
            this.show('station');
          }, row);
          restore.disabled = stars < room.cost;
        }
        content.append(row);
      }
      const unlocked = ['default', ...rooms.filter(room => this.progress.rooms.includes(room.id)).map(room => room.suit)];
      const suitRow = document.createElement('div');
      suitRow.className = 'loop-suits';
      for (const suit of unlocked) {
        const swatch = button(suit === this.progress.suit ? `● ${t(suit)}` : t(suit), () => {
          this.progress.suit = suit;
          saveLoopProgress(this.progress);
          this.applySuit();
          this.show('station');
        }, suitRow);
        swatch.style.borderColor = suits[suit] ?? '#78938d';
      }
      paragraph(t('Suit colour'), 'loop-label');
      content.append(suitRow);
      button(t('BACK'), () => this.show('select'));
    } else if (screen === 'editor') {
      el('loopPanelTitle').textContent = t('Level editor');
      openEditor(content, actions, {
        test: level => this.start(level, 'editor'),
        back: () => this.show('select'),
        share: level => this.shareLink(level),
      });
    }
    (actions.querySelector('button:not([disabled])') as HTMLButtonElement | null)?.focus();
  }

  private finish() {
    const level = this.level!, board = this.board!;
    const loopsUsed = this.echoes.length + 1;
    const steps = this.sim!.t;
    const final = level.plan.length === level.loops - 1 ? solve(board, level.plan, level.steps, 60000) : undefined;
    const par = final?.length ?? steps;
    const stars = starsFor(loopsUsed, level.loops, steps, par, this.hinted);
    const daily = level.id.startsWith('daily-');
    if (!level.id.startsWith('shared-')) {
      this.progress.stars[level.id] = Math.max(this.progress.stars[level.id] ?? 0, stars);
    }
    const streak = daily ? recordDaily(this.progress, dayNumber(), stars) : 0;
    saveLoopProgress(this.progress);

    el('loopOverlay').hidden = false;
    el('loopPanelTitle').dataset.screen = 'win';
    el('loopPanelTitle').textContent = t('The signal got through');
    const content = el('loopPanelContent'), actions = el('loopPanelActions');
    content.replaceChildren();
    actions.replaceChildren();
    const line = (text: string, className = '') => {
      const p = document.createElement('p');
      p.textContent = text;
      p.className = className;
      content.append(p);
    };
    line(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, 'loop-stars');
    line(tf('{0} of {1} loops · {2} steps · par {3}', loopsUsed, level.loops, steps, par));
    if (daily) line(tf('Daily streak: {0}', streak), 'map-route');
    if (stars < 3) line(t(this.hinted ? 'A hint was used: two stars at most.' : 'Three stars: the intended number of loops, within two steps of par.'));
    const add = (label: string, run: () => void) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', run);
      actions.append(button);
    };
    const index = levels.findIndex(item => item.id === level.id);
    if (index >= 0 && index < levels.length - 1) add(t('NEXT SIGNAL →'), () => this.start(levels[index + 1], 'select'));
    add(t('📤 SHARE RESULT'), () => {
      const url = level.id.startsWith('shared-') || level.id.startsWith('editor')
        ? `${location.origin}${location.pathname}#loop=${encodeLevel(level)}` : `${location.origin}${location.pathname}`;
      void shareText(shareCard(levelName(level), loopsUsed, level.loops, steps, stars, url));
    });
    add(t('↺ PLAY AGAIN'), () => this.start(level, this.returnTo));
    add(this.returnTo === 'editor' ? t('BACK TO THE EDITOR') : t('ALL SIGNALS'), () => this.show(this.returnTo));
    (actions.querySelector('button') as HTMLButtonElement | null)?.focus();
    this.deps.vibrate([40, 40, 40, 40, 120]);
    for (const [i, note] of [523, 659, 784].entries()) setTimeout(() => this.deps.audio.beep(note), i * 140);
  }

  private shareLink(level: LevelDef) {
    const url = `${location.origin}${location.pathname}#loop=${encodeLevel(level)}`;
    void shareText(`THE WHITE SIGNAL · ${level.name}\n${t('Can you get the signal through?')}\n${url}`);
  }

  // ——— Levels and loops ———

  start(level: LevelDef, returnTo: Screen) {
    this.level = level;
    this.returnTo = returnTo;
    this.board = parse(level.grid);
    this.echoes = [];
    this.hinted = false;
    this.build();
    this.reset();
    el('loopOverlay').hidden = true;
    el('loopLevel').textContent = levelName(level);
    if (level.intro) this.say('FIELD LOG', level.intro);
    else this.message(t('Reach the receiver before 03:14.'));
  }

  private get maxLoops() { return (this.level?.loops ?? 1) + 1; }

  private reset() {
    this.sim = initial(this.board!, this.echoes.length + 1);
    this.previous = this.sim;
    this.current = '';
    this.animation = 1;
    this.hintMarks.clear();
    this.refresh([]);
    this.hud();
  }

  private act(dir: Dir) {
    if (!this.active || this.overlayOpen || !this.sim || this.sim.won || this.clock < this.busyUntil) return;
    if (this.sim.t >= this.level!.steps) return;
    const actions = [...this.echoes.map(echo => (echo[this.sim!.t] ?? 'W') as Dir), dir];
    const result = step(this.board!, this.sim, actions);
    this.previous = this.sim;
    this.sim = result.sim;
    this.current += dir;
    this.animation = 0;
    this.busyUntil = this.clock + STEP_TIME;
    if (dir !== 'W') this.deps.audio.step('floor', .6);
    this.refresh(result.events);
    this.hud();
    const player = this.sim.vosses[this.sim.vosses.length - 1];
    if (this.sim.won) { setTimeout(() => this.finish(), 550); return; }
    if (!player.alive) {
      this.message(t('It caught you. This loop starts over; your past selves keep their steps.'));
      this.busyUntil = this.clock + 1.1;
      setTimeout(() => { if (this.active && this.level) this.reset(); }, 1000);
      return;
    }
    if (this.sim.t >= this.level!.steps) this.timeUp();
  }

  private timeUp() {
    if (this.echoes.length + 1 < this.maxLoops) {
      this.message(t('03:14. The loop closes — and you are back at the start, beside yourself.'));
      this.deps.audio.stinger();
      this.busyUntil = this.clock + 1;
      setTimeout(() => { if (this.active) this.closeLoop(true); }, 900);
    } else {
      this.message(t('03:14 and no more loops. Undo a loop or start the signal again.'));
    }
  }

  private closeLoop(auto = false) {
    if (!this.sim || this.sim.won) return;
    if (this.echoes.length + 1 >= this.maxLoops) { this.message(t('This is your last loop.')); return; }
    if (!auto && this.current.replace(/W/g, '') === '') { this.message(t('Walk somewhere first — an echo that stands still won’t help.')); return; }
    this.echoes.push(this.current);
    this.reset();
    this.deps.vibrate(60);
    this.message(tf('Loop {0} closed. That Voss will repeat every step, beside you.', this.echoes.length));
  }

  private command(name: string) {
    if (!this.active) return;
    if (name in { U: 1, D: 1, L: 1, R: 1, W: 1 }) { this.act(name as Dir); return; }
    if (name === 'close') this.closeLoop();
    else if (name === 'restart') { this.reset(); this.message(t('Loop restarted.')); }
    else if (name === 'undo') {
      if (!this.echoes.length) { this.message(t('No earlier loop to undo.')); return; }
      this.echoes.pop();
      this.reset();
      this.message(t('Last loop undone.'));
    } else if (name === 'hint') this.hint();
  }

  private hint() {
    const level = this.level!, board = this.board!;
    const index = this.echoes.length;
    const path = index < level.plan.length ? level.plan[index] : solve(board, this.echoes, level.steps, 60000);
    if (!path) { this.message(t('No way through from here. Undo a loop and try different steps.')); return; }
    this.hinted = true;
    this.hintMarks.clear();
    // Replay the suggestion with the current echoes to place footprints where it really goes.
    let sim = initial(board, index + 1);
    const marks: { x: number; y: number }[] = [];
    for (let i = 0; i < path.length; i++) {
      sim = step(board, sim, [...this.echoes.map(echo => (echo[i] ?? 'W') as Dir), path[i] as Dir]).sim;
      const me = sim.vosses[index];
      marks.push({ x: me.x, y: me.y });
    }
    for (const [i, mark] of marks.entries()) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(.12 + (i === marks.length - 1 ? .1 : 0), 12),
        new THREE.MeshBasicMaterial({ color: '#79e0b0', transparent: true, opacity: .75 }));
      dot.rotation.x = -Math.PI / 2;
      const [x, z] = this.world(mark.x, mark.y);
      dot.position.set(x, .06, z);
      this.hintMarks.add(dot);
    }
    this.message(index < level.plan.length
      ? tf('Hint: in loop {0}, walk the green path, then close the loop.', index + 1)
      : t('Hint: the green path gets the signal through with the selves you have.'));
  }

  private say(speaker: string, text: string) {
    this.message(t(text));
    if (!this.deps.audio.muted && this.deps.settings.voice) this.deps.voice.speak(speaker, t(text), this.deps.settings.language);
  }

  private message(text: string) {
    el('loopMessage').textContent = text;
    el('loopMessage').classList.remove('pulse');
    void el('loopMessage').offsetWidth;
    el('loopMessage').classList.add('pulse');
  }

  private hud() {
    const level = this.level!, sim = this.sim!;
    const left = Math.max(0, level.steps - sim.t);
    el('loopClock').textContent = left ? `03:13:${String(60 - Math.min(59, left)).padStart(2, '0')}` : '03:14:00';
    el('loopClock').classList.toggle('late', left <= 3);
    el('loopSteps').textContent = tf('{0} steps to 03:14', left);
    const dots = Array.from({ length: this.maxLoops }, (_, i) => i < this.echoes.length ? '●' : i === this.echoes.length ? '◉' : '○').join(' ');
    el('loopLoops').textContent = `${dots}  ${tf('loop {0}/{1}', this.echoes.length + 1, level.loops)}`;
  }

  // ——— Board ———

  private world(x: number, y: number): [number, number] {
    const board = this.board!;
    return [x - (board.w - 1) / 2, y - (board.h - 1) / 2];
  }

  private build() {
    const board = this.board!;
    this.group.clear();
    // Loop boards get their own soft light so plates, doors and floor read clearly.
    this.group.add(new THREE.HemisphereLight('#cfe6f2', '#1a2a33', 1.6));
    const key = new THREE.DirectionalLight('#ffe9cc', 1.4);
    key.position.set(6, 12, 9);
    this.group.add(key);
    this.doors.clear();
    this.ice.clear();
    this.fuses = [];
    this.figures = [];
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, glow = 0) => {
      const mesh = new THREE.Mesh(cube, material(color, glow));
      mesh.position.set(x, y, z);
      mesh.scale.set(w, h, d);
      this.group.add(mesh);
      return mesh;
    };
    for (let y = 0; y < board.h; y++) {
      for (let x = 0; x < board.w; x++) {
        const tile = tileAt(board, x, y);
        const [wx, wz] = this.world(x, y);
        if (tile === '#') {
          // Only draw walls that border a walkable tile; the rest stay dark.
          const edge = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
            .some(([dx, dy]) => tileAt(board, x + dx, y + dy) !== '#');
          // Low rims keep one-tile corridors visible from the isometric camera.
          if (edge) box(wx, .17, wz, 1, .34, 1, (x + y) % 2 ? '#2a414c' : '#2f4854');
          continue;
        }
        box(wx, -.05, wz, .98, .1, .98, tile === 'I' ? '#7fb3c6' : (x + y) % 2 ? '#6b7f86' : '#76898f');
        if (tile === 'I') this.ice.set(y * board.w + x, box(wx, .01, wz, .86, .02, .86, '#bfe4ef'));
        if (tile >= 'a' && tile <= 'c') {
          box(wx, .02, wz, .7, .06, .7, '#d9a876', .35);
          box(wx, .06, wz, .3, .02, .3, '#2b3f4a');
        }
        if (tile >= 'A' && tile <= 'C') {
          const bars = [-.3, 0, .3].map(offset => box(wx + offset * (tileAt(board, x - 1, y) === '#' ? 0 : 1),
            .55, wz + offset * (tileAt(board, x - 1, y) === '#' ? 1 : 0), .12, 1.1, .12, '#c46a4a', .25));
          this.doors.set(tile + y * board.w + x, bars);
          box(wx, .02, wz, .9, .04, .9, '#6b3b30');
        }
        if (tile === 'L') {
          box(wx, .02, wz, .9, .04, .9, '#f0c27a', .5);
          box(wx + .38, .7, wz - .38, .08, 1.4, .08, '#56656a');
          box(wx + .38, 1.42, wz - .38, .26, .14, .26, '#ffd79a', 1.2);
          const light = new THREE.PointLight('#ffcf8a', 6, 4.5, 2);
          light.position.set(wx, 1.4, wz);
          this.group.add(light);
        }
        if (tile === 'F') this.fuses.push(box(wx, .3, wz, .24, .4, .24, '#7be0ff', 1));
        if (tile === 'R') {
          box(wx, .45, wz - .25, .9, .9, .4, '#1a2a30');
          this.receiver = box(wx, .62, wz - .04, .7, .38, .05, '#6fc2a4', .8);
          const light = new THREE.PointLight('#79e0b0', 5, 4, 2);
          light.position.set(wx, 1, wz + .3);
          this.group.add(light);
        }
      }
    }
    for (const _ of board.figures) {
      const figure = new THREE.Group();
      const shade = new THREE.MeshBasicMaterial({ color: '#0e1a1f', transparent: true, opacity: .9 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.2, .36, 1.1, 6), shade);
      body.position.y = .62;
      const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), shade);
      head.position.y = 1.32;
      const eyes = new THREE.Mesh(new THREE.BoxGeometry(.18, .04, .04), new THREE.MeshBasicMaterial({ color: '#ff5a4f' }));
      eyes.position.set(0, 1.34, .18);
      eyes.name = 'eyes';
      figure.add(body, head, eyes);
      this.group.add(figure);
      this.figures.push(figure);
    }
  }

  /** Updates doors, fuses, ice and characters to match the simulation. */
  private refresh(events: LoopEvent[]) {
    const board = this.board!, sim = this.sim!;
    for (const [id, bars] of this.doors) {
      const open = sim.open.includes(id[0]);
      for (const bar of bars) bar.position.y = open ? -.5 : .55;
    }
    this.fuses.forEach((fuse, i) => { fuse.visible = !sim.fuses.includes(i); });
    for (const [id, mesh] of this.ice) mesh.material = material(sim.broken.includes(id) ? '#0b151c' : '#bfe4ef');
    if (this.receiver) this.receiver.material = material(sim.fuses.length === board.fuses.length ? '#79e0b0' : '#3d5a52', sim.fuses.length === board.fuses.length ? 1 : .2);
    while (this.echoCharacters.length < this.echoes.length) this.echoCharacters.push(this.deps.makeCharacter());
    this.echoCharacters.forEach((echo, i) => {
      echo.setVisible(i < this.echoes.length && sim.vosses[i]?.alive !== false);
      echo.setLook('#8fe3ff', .72);
    });
    for (const event of events) {
      if (event.kind === 'door') this.deps.audio.beep(event.open ? 520 : 300);
      if (event.kind === 'fuse') this.deps.audio.beep(880);
      if (event.kind === 'ice') { this.deps.audio.step('snow', 1.4, true); this.deps.vibrate(40); }
      if (event.kind === 'caught') {
        this.deps.audio.stinger();
        this.deps.camera.shake(.8, .6);
        this.deps.vibrate([120, 60, 200]);
        if (event.who < this.echoes.length) this.message(tf('It caught your echo from loop {0}.', event.who + 1));
      }
    }
  }

  private applySuit() {
    this.deps.player.setLook(suits[this.progress.suit] ?? null);
  }

  // ——— Per-frame ———

  private key(event: KeyboardEvent) {
    if (!this.active || this.overlayOpen || event.repeat) return;
    const map: Record<string, Dir | string> = {
      ArrowUp: 'U', KeyW: 'U', ArrowRight: 'R', KeyD: 'R', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L',
      Space: 'W', Enter: 'close', KeyR: 'restart', Backspace: 'undo', KeyH: 'hint',
    };
    const name = map[event.code];
    if (!name) return;
    event.preventDefault();
    if (name.length === 1) this.held = name as Dir;
    this.command(name);
    this.repeat = .32;
    // Input saw this key too; don't let it also count as a gamepad-style wait or loop close.
    this.deps.input.consumeTaps();
  }

  frame(dt: number) {
    if (!this.active || !this.sim) return;
    this.clock += dt;
    // Held keys and the gamepad stick repeat moves at a steady pace.
    const input = this.deps.input;
    const stickX = input.right, stickY = input.down;
    let stickDir: Dir | undefined;
    if (Math.abs(stickX) > .5 || Math.abs(stickY) > .5) {
      // Screen directions → grid: right/up → U, right/down → R, left/down → D, left/up → L.
      stickDir = stickX >= 0 ? (stickY < 0 ? 'U' : 'R') : (stickY > 0 ? 'D' : 'L');
      if (Math.abs(stickY) < .3) stickDir = stickX > 0 ? 'R' : 'L';
      if (Math.abs(stickX) < .3) stickDir = stickY > 0 ? 'D' : 'U';
    }
    const keyHeld = this.held && ['U', 'D', 'L', 'R'].includes(this.held) && document.hasFocus() ? this.held : undefined;
    const want = stickDir ?? (input.held('up') || input.held('down') || input.held('left') || input.held('right') ? keyHeld : undefined);
    this.repeat -= dt;
    if (want && this.repeat <= 0 && !this.overlayOpen) { this.act(want); this.repeat = .2; }
    if (!want) { this.repeat = Math.min(this.repeat, 0); if (!stickDir) this.held = undefined; }
    if (input.pressed('interact')) this.act('W');
    if (input.pressed('jump')) this.closeLoop();

    this.animation = Math.min(1, this.animation + dt / STEP_TIME);
    const ease = this.animation * (2 - this.animation);
    const place = (character: Character, i: number) => {
      const from = this.previous!.vosses[i] ?? this.sim!.vosses[i], to = this.sim!.vosses[i];
      const [ax, az] = this.world(from.x, from.y), [bx, bz] = this.world(to.x, to.y);
      const body = character.body;
      const moving = this.animation < 1 && (ax !== bx || az !== bz);
      body.x = ax + (bx - ax) * ease;
      body.z = az + (bz - az) * ease;
      body.vx = moving ? (bx - ax) * 5 : 0;
      body.vz = moving ? (bz - az) * 5 : 0;
      if (moving) { body.facing.x = Math.sign(bx - ax); body.facing.z = Math.sign(bz - az); }
      character.update(dt);
    };
    this.echoCharacters.forEach((echo, i) => { if (i < this.echoes.length) place(echo, i); });
    place(this.deps.player, this.sim.vosses.length - 1);
    this.sim.figures.forEach((figure, i) => {
      const from = this.previous!.figures[i] ?? figure;
      const [ax, az] = this.world(from.x, from.y), [bx, bz] = this.world(figure.x, figure.y);
      const mesh = this.figures[i];
      mesh.position.set(ax + (bx - ax) * ease, Math.sin(this.clock * 4 + i) * .03, az + (bz - az) * ease);
      mesh.rotation.y = Math.atan2(bx - ax || ({ L: -1, R: 1 } as Record<string, number>)[figure.dir] || 0, bz - az || ({ U: -1, D: 1 } as Record<string, number>)[figure.dir] || 0);
      (mesh.getObjectByName('eyes') as THREE.Mesh).visible = figure.chasing || Math.sin(this.clock * 3 + i) > .6;
    });
    if (this.receiver && this.sim.won) this.receiver.scale.y = 1 + Math.sin(this.clock * 12) * .3;
    for (const [i, dot] of this.hintMarks.children.entries()) dot.position.y = .06 + Math.max(0, Math.sin(this.clock * 4 - i * .5)) * .05;
    this.deps.camera.update(this.deps.player.body, dt, 'inside');
  }

  /** For tests and the dev hook. */
  get state() { return { level: this.level?.id, echoes: [...this.echoes], current: this.current, sim: this.sim }; }

  /** Plays a level code from a shared link. */
  static fromHash(hash: string) {
    const match = hash.match(/#loop=([\w-]+)/);
    return match ? decodeLevel(match[1]) : undefined;
  }

  /** Whether a recording would win, used by the editor's checks. */
  static wins(level: LevelDef, loops: string[]) {
    return replay(parse(level.grid), loops, level.steps).won;
  }
}
