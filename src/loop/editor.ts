import { t, tf } from '../i18n';
import { parse, solve } from './engine';
import type { LevelDef } from './levels';

// A small grid editor. Levels are tested in place and shared as links.
const tools: [tile: string, label: string][] = [
  ['#', 'Wall'], ['.', 'Floor'], ['S', 'Start'], ['R', 'Receiver'], ['L', 'Lamp'], ['F', 'Fuse'], ['I', 'Thin ice'],
  ['a', 'Plate a'], ['A', 'Door A'], ['b', 'Plate b'], ['B', 'Door B'], ['c', 'Plate c'], ['C', 'Door C'],
  ['>', 'Figure →'], ['<', 'Figure ←'], ['^', 'Figure ↑'], ['v', 'Figure ↓'],
];
const glyph: Record<string, string> = {
  '#': '▦', '.': '', S: 'S', R: '📡', L: '☀', F: '⚡', I: '❄', a: 'a', b: 'b', c: 'c', A: 'A', B: 'B', C: 'C',
  '>': '→', '<': '←', '^': '↑', v: '↓',
};

const KEY = 'the-white-signal:loop-editor';
let draft: { name: string; grid: string[]; loops: number; steps: number } | undefined;

function blank(w: number, h: number) {
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) =>
    x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : x === 1 && y === 1 ? 'S' : x === w - 2 && y === h - 2 ? 'R' : '.').join(''));
}

function load() {
  if (draft) return draft;
  try { draft = JSON.parse(localStorage.getItem(KEY) || 'null') ?? undefined; } catch { /* Start fresh. */ }
  draft ??= { name: 'My signal', grid: blank(9, 7), loops: 2, steps: 20 };
  return draft;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* Kept in memory. */ } }

export function openEditor(content: HTMLElement, actions: HTMLElement, hooks: {
  test: (level: LevelDef) => void; back: () => void; share: (level: LevelDef) => void;
}) {
  const level = load();
  let tool = '#';
  const status = document.createElement('p');
  status.className = 'map-route';
  const asLevel = (): LevelDef => ({ id: 'editor', name: level.name, intro: '', grid: level.grid, loops: level.loops, steps: level.steps, plan: [] });

  const name = document.createElement('input');
  name.value = level.name;
  name.maxLength = 40;
  name.className = 'loop-input';
  name.addEventListener('input', () => { level.name = name.value || 'My signal'; save(); });

  const numbers = document.createElement('div');
  numbers.className = 'loop-numbers';
  const field = (label: string, value: number, min: number, max: number, set: (n: number) => void) => {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener('change', () => { set(Math.min(max, Math.max(min, Number(input.value) || min))); save(); });
    wrap.append(t(label), input);
    numbers.append(wrap);
  };
  field('Loops', level.loops, 1, 4, n => { level.loops = n; });
  field('Steps', level.steps, 4, 60, n => { level.steps = n; });

  const palette = document.createElement('div');
  palette.className = 'loop-palette';
  for (const [tile, label] of tools) {
    const button = document.createElement('button');
    button.textContent = glyph[tile] || '·';
    button.title = t(label);
    button.setAttribute('aria-label', t(label));
    button.classList.toggle('active', tile === tool);
    button.addEventListener('click', () => {
      tool = tile;
      palette.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    });
    palette.append(button);
  }

  const grid = document.createElement('div');
  grid.className = 'loop-grid';
  const draw = () => {
    grid.style.gridTemplateColumns = `repeat(${level.grid[0].length}, 1fr)`;
    grid.replaceChildren(...level.grid.flatMap((row, y) => [...row].map((tile, x) => {
      const cell = document.createElement('button');
      cell.className = `cell tile-${tile === '#' ? 'wall' : tile === '.' ? 'floor' : 'thing'}`;
      cell.textContent = glyph[tile] ?? tile;
      cell.setAttribute('aria-label', `${x + 1},${y + 1}`);
      cell.addEventListener('click', () => {
        // Only one start and one receiver: placing one moves it.
        let rows = level.grid.map(r => [...r]);
        if (tool === 'S' || tool === 'R') rows = rows.map(r => r.map(c => (c === tool ? '.' : c)));
        rows[y][x] = tool;
        level.grid = rows.map(r => r.join(''));
        save();
        draw();
      });
      return cell;
    })));
  };
  draw();

  const sizes = document.createElement('div');
  sizes.className = 'loop-suits';
  for (const [w, h] of [[7, 5], [9, 7], [11, 9], [13, 11]]) {
    const button = document.createElement('button');
    button.textContent = `${w}×${h}`;
    button.addEventListener('click', () => {
      if (!window.confirm(t('Start a new empty grid?'))) return;
      level.grid = blank(w, h);
      save();
      draw();
    });
    sizes.append(button);
  }

  content.append(name, numbers, palette, grid, sizes, status);
  const add = (label: string, run: () => void) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', run);
    actions.append(button);
  };
  add(t('▶ TEST'), () => hooks.test(asLevel()));
  add(t('✔ CHECK'), () => {
    const board = parse(level.grid);
    const single = solve(board, [], level.steps, 60000);
    status.textContent = single
      ? (level.loops > 1 ? tf('Solvable in one loop ({0} steps) — your past selves are not needed yet.', single.length) : tf('Solvable in {0} steps.', single.length))
      : level.loops > 1 ? t('Not solvable alone. Test it to make sure your past selves can open the way.') : t('Not solvable in one loop. Add a path or more steps.');
  });
  add(t('📤 SHARE LINK'), () => hooks.share(asLevel()));
  add(t('BACK'), hooks.back);
}
