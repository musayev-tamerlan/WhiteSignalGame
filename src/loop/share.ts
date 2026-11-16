import type { Dir } from './engine';
import { levels, type LevelDef } from './levels';

// Daily signals, level transforms, share links and share cards.

const figureCW: Record<string, string> = { '^': '>', '>': 'v', v: '<', '<': '^' };
const figureMirror: Record<string, string> = { '<': '>', '>': '<' };
const dirCW: Record<Dir, Dir> = { U: 'R', R: 'D', D: 'L', L: 'U', W: 'W' };
const dirMirror: Record<Dir, Dir> = { L: 'R', R: 'L', U: 'U', D: 'D', W: 'W' };

/** Rotates a grid 90° clockwise. Puzzles stay solvable under rotation and mirroring. */
export function rotate(grid: string[]) {
  const h = grid.length, w = Math.max(...grid.map(row => row.length));
  return Array.from({ length: w }, (_, y) => Array.from({ length: h }, (_, x) => {
    const tile = grid[h - 1 - x][y] ?? '#';
    return figureCW[tile] ?? tile;
  }).join(''));
}

export function mirror(grid: string[]) {
  return grid.map(row => [...row].reverse().map(tile => figureMirror[tile] ?? tile).join(''));
}

export const rotatePlan = (plan: string) => [...plan].map(dir => dirCW[dir as Dir] ?? dir).join('');
export const mirrorPlan = (plan: string) => [...plan].map(dir => dirMirror[dir as Dir] ?? dir).join('');

/** One of eight orientations of a level, plans transformed to match. */
export function variant(level: LevelDef, turn: number): LevelDef {
  let grid = level.grid, plan = level.plan;
  if (turn & 4) { grid = mirror(grid); plan = plan.map(mirrorPlan); }
  for (let i = 0; i < (turn & 3); i++) { grid = rotate(grid); plan = plan.map(rotatePlan); }
  return { ...level, grid, plan };
}

const EPOCH = Date.UTC(2026, 10, 1);
export const dayNumber = (now = Date.now()) => Math.floor((now - EPOCH) / 86400000) + 1;

/** The same puzzle for everyone today: a campaign level in one of its eight orientations. */
export function dailyLevel(day = dayNumber()): LevelDef {
  const pool = levels.filter(level => level.id !== 'contact');
  const base = pool[(day * 7) % pool.length];
  const turn = Math.floor(day / pool.length) % 8 || day % 8;
  return { ...variant(base, turn), id: `daily-${day}`, name: `Signal #${day}` };
}

// Shared levels travel in the URL hash as base64url JSON.
export function encodeLevel(level: Pick<LevelDef, 'name' | 'grid' | 'loops' | 'steps'>) {
  const json = JSON.stringify({ n: level.name, g: level.grid, l: level.loops, s: level.steps });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLevel(code: string): LevelDef | undefined {
  try {
    const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    const data = JSON.parse(json);
    const grid = Array.isArray(data.g) ? data.g.filter((row: unknown) => typeof row === 'string').slice(0, 15) : [];
    if (grid.length < 3 || grid.some((row: string) => row.length > 15 || /[^#.SRabcABCLFI<>^v]/.test(row))) return undefined;
    if (grid.join('').split('S').length !== 2 || grid.join('').split('R').length !== 2) return undefined;
    return {
      id: `shared-${code.slice(0, 12)}`, name: String(data.n ?? 'Shared signal').slice(0, 40), intro: '',
      grid, loops: Math.min(4, Math.max(1, Number(data.l) || 1)), steps: Math.min(60, Math.max(4, Number(data.s) || 20)), plan: [],
    };
  } catch {
    return undefined;
  }
}

/** A spoiler-free result card for chats: loops as squares, stars, steps. */
export function shareCard(title: string, loopsUsed: number, maxLoops: number, steps: number, stars: number, url: string) {
  const squares = '🔁'.repeat(loopsUsed) + '⬛'.repeat(Math.max(0, maxLoops - loopsUsed));
  return `THE WHITE SIGNAL · ${title}\n${squares} ${loopsUsed}/${maxLoops} · ${steps} steps\n${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}\n${url}`;
}
