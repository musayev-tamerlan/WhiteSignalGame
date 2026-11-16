// "Loop" mode: a deterministic, turn-based simulation on a small grid.
// Every attempt (a loop) is recorded; the next loop replays all earlier ones
// alongside the player, so puzzles are solved by cooperating with your past selves.
//
// Tiles:  #  wall          .  floor        S  start         R  receiver (goal)
//         a b c  plates    A B C  doors (open while any Voss stands on the plate)
//         L  lamp (safe; figures will not enter light)
//         F  fuse (all must be picked up before the receiver works)
//         I  thin ice (breaks into a hole once someone steps off it)
//         < > ^ v  a figure on floor, facing that way

export type Dir = 'U' | 'D' | 'L' | 'R' | 'W';
export const directions: Record<Dir, [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], W: [0, 0] };

export interface Board {
  w: number;
  h: number;
  /** Static tiles with figures and the start replaced by floor. */
  tiles: string[];
  start: Point;
  receiver: Point;
  fuses: Point[];
  figures: Figure[];
}

export interface Point { x: number; y: number }
export interface Figure extends Point { dir: Dir; chasing: boolean }
export interface Voss extends Point { alive: boolean }

export interface Sim {
  t: number;
  vosses: Voss[];
  figures: Figure[];
  open: string;
  broken: number[];
  fuses: number[];
  won: boolean;
}

export type LoopEvent =
  | { kind: 'caught'; who: number }
  | { kind: 'fuse'; index: number }
  | { kind: 'door'; letter: string; open: boolean }
  | { kind: 'ice'; at: Point }
  | { kind: 'won' };

const figureDirs: Record<string, Dir> = { '<': 'L', '>': 'R', '^': 'U', v: 'D' };
const SIGHT = 4;

export function parse(grid: string[]): Board {
  const h = grid.length;
  const w = Math.max(...grid.map(row => row.length));
  let start: Point = { x: 1, y: 1 };
  let receiver: Point = { x: 1, y: 1 };
  const fuses: Point[] = [];
  const figures: Figure[] = [];
  const tiles = grid.map((row, y) => Array.from({ length: w }, (_, x) => {
    const tile = row[x] ?? '#';
    if (tile === 'S') { start = { x, y }; return '.'; }
    if (tile === 'R') receiver = { x, y };
    if (tile === 'F') fuses.push({ x, y });
    if (tile in figureDirs) { figures.push({ x, y, dir: figureDirs[tile], chasing: false }); return '.'; }
    return tile;
  }).join(''));
  return { w, h, tiles, start, receiver, fuses, figures };
}

export const tileAt = (board: Board, x: number, y: number) =>
  x < 0 || y < 0 || x >= board.w || y >= board.h ? '#' : board.tiles[y][x];

export function initial(board: Board, vosses: number): Sim {
  return {
    t: 0,
    vosses: Array.from({ length: vosses }, () => ({ ...board.start, alive: true })),
    figures: board.figures.map(figure => ({ ...figure })),
    open: '',
    broken: [],
    fuses: [],
    won: false,
  };
}

const key = (board: Board, x: number, y: number) => y * board.w + x;

/** Whether a Voss could stand on this tile right now. */
export function walkable(board: Board, sim: Sim, x: number, y: number) {
  const tile = tileAt(board, x, y);
  if (tile === '#') return false;
  if (sim.broken.includes(key(board, x, y))) return false;
  if (tile >= 'A' && tile <= 'C' && !sim.open.includes(tile)) return false;
  return true;
}

function figureCanEnter(board: Board, sim: Sim, x: number, y: number) {
  return walkable(board, sim, x, y) && tileAt(board, x, y) !== 'L';
}

/** The nearest living Voss the figure can see in a straight line, out of the light. */
function spotted(board: Board, sim: Sim, figure: Figure): Voss | undefined {
  let best: Voss | undefined;
  let bestDistance = Infinity;
  for (const voss of sim.vosses) {
    if (!voss.alive || tileAt(board, voss.x, voss.y) === 'L') continue;
    if (voss.x !== figure.x && voss.y !== figure.y) continue;
    const distance = Math.abs(voss.x - figure.x) + Math.abs(voss.y - figure.y);
    if (distance > SIGHT || distance >= bestDistance) continue;
    const sx = Math.sign(voss.x - figure.x), sy = Math.sign(voss.y - figure.y);
    let clear = true;
    for (let i = 1; i < distance; i++) {
      if (!walkable(board, sim, figure.x + sx * i, figure.y + sy * i)) { clear = false; break; }
    }
    if (clear) { best = voss; bestDistance = distance; }
  }
  return best;
}

/**
 * Advances one tick. `actions[i]` is what Voss i does; earlier loops come first and
 * the player last. Returns the next state and what happened, for rendering.
 */
export function step(board: Board, sim: Sim, actions: Dir[]): { sim: Sim; events: LoopEvent[] } {
  const next: Sim = {
    t: sim.t + 1,
    vosses: sim.vosses.map(voss => ({ ...voss })),
    figures: sim.figures.map(figure => ({ ...figure })),
    open: sim.open,
    broken: [...sim.broken],
    fuses: [...sim.fuses],
    won: sim.won,
  };
  const events: LoopEvent[] = [];
  const before = sim.vosses.map(voss => ({ x: voss.x, y: voss.y }));

  // 1. Everyone moves at once; a blocked move becomes a wait.
  next.vosses.forEach((voss, i) => {
    if (!voss.alive) return;
    const [dx, dy] = directions[actions[i] ?? 'W'];
    if (!dx && !dy) return;
    if (walkable(board, sim, voss.x + dx, voss.y + dy)) { voss.x += dx; voss.y += dy; }
  });

  // 2. Thin ice gives way behind whoever leaves it.
  before.forEach((from, i) => {
    const voss = next.vosses[i];
    if (!sim.vosses[i].alive || (voss.x === from.x && voss.y === from.y)) return;
    if (tileAt(board, from.x, from.y) !== 'I') return;
    const k = key(board, from.x, from.y);
    if (!next.broken.includes(k)) { next.broken.push(k); events.push({ kind: 'ice', at: from }); }
  });

  // 3. Fuses are picked up by anyone standing on them.
  board.fuses.forEach((fuse, index) => {
    if (next.fuses.includes(index)) return;
    if (next.vosses.some(voss => voss.alive && voss.x === fuse.x && voss.y === fuse.y)) {
      next.fuses.push(index);
      events.push({ kind: 'fuse', index });
    }
  });

  // 4. Doors follow their plates, but never close on someone standing in them.
  let open = '';
  for (const letter of ['A', 'B', 'C']) {
    const plate = letter.toLowerCase();
    const held = next.vosses.some(voss => voss.alive && tileAt(board, voss.x, voss.y) === plate);
    const blocked = next.vosses.some(voss => voss.alive && tileAt(board, voss.x, voss.y) === letter) ||
      next.figures.some(figure => tileAt(board, figure.x, figure.y) === letter);
    if (held || (blocked && sim.open.includes(letter))) open += letter;
    if (open.includes(letter) !== sim.open.includes(letter)) events.push({ kind: 'door', letter, open: open.includes(letter) });
  }
  next.open = open;

  // 5. Figures chase what they can see, otherwise patrol and turn at obstacles and light.
  const figureFrom = next.figures.map(figure => ({ x: figure.x, y: figure.y }));
  for (const figure of next.figures) {
    const target = spotted(board, next, figure);
    figure.chasing = Boolean(target);
    if (target) {
      const dx = Math.sign(target.x - figure.x), dy = Math.sign(target.y - figure.y);
      if (figureCanEnter(board, next, figure.x + dx, figure.y + dy) || (target.x === figure.x + dx && target.y === figure.y + dy)) {
        figure.x += dx; figure.y += dy;
      }
      continue;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const [dx, dy] = directions[figure.dir];
      if (figureCanEnter(board, next, figure.x + dx, figure.y + dy)) { figure.x += dx; figure.y += dy; break; }
      figure.dir = ({ U: 'D', D: 'U', L: 'R', R: 'L', W: 'W' } as const)[figure.dir];
    }
  }

  // 6. A figure catches a Voss it reaches, lands next to, or swaps places with — never in light.
  next.vosses.forEach((voss, i) => {
    if (!voss.alive || tileAt(board, voss.x, voss.y) === 'L') return;
    const caught = next.figures.some((figure, f) =>
      Math.abs(figure.x - voss.x) + Math.abs(figure.y - voss.y) <= 1 ||
      (figure.x === before[i].x && figure.y === before[i].y && figureFrom[f].x === voss.x && figureFrom[f].y === voss.y));
    if (caught) { voss.alive = false; events.push({ kind: 'caught', who: i }); }
  });

  // 7. The signal goes through when someone reaches the receiver with every fuse found.
  if (!next.won && next.fuses.length === board.fuses.length &&
    next.vosses.some(voss => voss.alive && voss.x === board.receiver.x && voss.y === board.receiver.y)) {
    next.won = true;
    events.push({ kind: 'won' });
  }
  return { sim: next, events };
}

/** Plays whole loops: echoes[i] is loop i's action string; returns the final state. */
export function replay(board: Board, loops: string[], steps: number) {
  let sim = initial(board, loops.length);
  for (let t = 0; t < steps && !sim.won; t++) {
    sim = step(board, sim, loops.map(loop => (loop[t] ?? 'W') as Dir)).sim;
  }
  return sim;
}

/**
 * Breadth-first search for the last loop, given the earlier loops' recordings.
 * Used by tests to prove each level is solvable (and needs its loops) and by hints.
 */
export function solve(board: Board, echoes: string[], steps: number, limit = 400000): string | undefined {
  const start = initial(board, echoes.length + 1);
  const seen = new Set<string>();
  const signature = (sim: Sim) => JSON.stringify([sim.t, sim.vosses, sim.figures, sim.open, sim.broken, sim.fuses]);
  let frontier: { sim: Sim; path: string }[] = [{ sim: start, path: '' }];
  let visited = 0;
  while (frontier.length) {
    const nextFrontier: typeof frontier = [];
    for (const { sim, path } of frontier) {
      if (sim.t >= steps) continue;
      for (const dir of ['W', 'U', 'D', 'L', 'R'] as Dir[]) {
        const actions = [...echoes.map(echo => (echo[sim.t] ?? 'W') as Dir), dir];
        const { sim: after } = step(board, sim, actions);
        const player = after.vosses[after.vosses.length - 1];
        if (!player.alive) continue;
        if (after.won) return path + dir;
        const id = signature(after);
        if (seen.has(id)) continue;
        seen.add(id);
        if (++visited > limit) return undefined;
        nextFrontier.push({ sim: after, path: path + dir });
      }
    }
    frontier = nextFrontier;
  }
  return undefined;
}
