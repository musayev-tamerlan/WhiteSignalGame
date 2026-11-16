// Hand-made Loop levels. `plan` lists the earlier loops a designer would record;
// tests prove the final loop is solvable with them and impossible with fewer loops.
export interface LevelDef {
  id: string;
  name: string;
  /** One line shown before the level starts. */
  intro: string;
  grid: string[];
  loops: number;
  steps: number;
  plan: string[];
}

export const levels: LevelDef[] = [
  {
    id: 'contact', name: 'Contact', intro: 'Reach the receiver before 03:14.',
    grid: [
      '#######',
      '#S...R#',
      '#######',
    ], loops: 1, steps: 10, plan: [],
  },
  {
    id: 'hold', name: 'Hold the door', intro: 'The door only opens while someone stands on the plate. Someone you were, perhaps.',
    grid: [
      '#########',
      '#S..a####',
      '#.#######',
      '#.#######',
      '#...A..R#',
      '#########',
    ], loops: 2, steps: 14, plan: ['RRR'],
  },
  {
    id: 'hands', name: 'Two hands', intro: 'Two plates, two doors. You will need two earlier yous.',
    grid: [
      '###########',
      '#a...S...b#',
      '#####.#####',
      '#####A#####',
      '#####B#####',
      '#####R#####',
      '###########',
    ], loops: 3, steps: 12, plan: ['LLLL', 'RRRR'],
  },
  {
    id: 'lamplight', name: 'Lamplight', intro: 'Figures will not step into light. Wait in it.',
    grid: [
      '###########',
      '#####^#####',
      '#####.#####',
      '#####.#####',
      '#S..L.L..R#',
      '#####.#####',
      '#####.#####',
      '#####.#####',
      '###########',
    ], loops: 1, steps: 24, plan: [],
  },
  {
    id: 'fuse', name: 'The fuse', intro: 'The receiver is dead without its fuse.',
    grid: [
      '#########',
      '#a..S..R#',
      '####A####',
      '####F####',
      '#########',
    ], loops: 2, steps: 14, plan: ['LLL'],
  },
  {
    id: 'bridge', name: 'One-way bridge', intro: 'Thin ice breaks behind you. Cross it together.',
    grid: [
      '#########',
      '#S.I.a###',
      '###.#####',
      '###A...R#',
      '#########',
    ], loops: 2, steps: 14, plan: ['RRRR'],
  },
  {
    id: 'decoy', name: 'Decoy', intro: 'It chases the nearest Voss. It does not care which one.',
    grid: [
      '###########',
      '#L......<R#',
      '#S#.#######',
      '###.#######',
      '###.#######',
      '###.#######',
      '###.#######',
      '###########',
    ], loops: 2, steps: 26, plan: ['URRDDDDD'],
  },
  {
    id: 'relay', name: 'Relay', intro: 'One of you opens the way for the next.',
    grid: [
      '#########',
      '#a.S.A.b#',
      '###.#####',
      '###B#####',
      '###R#####',
      '#########',
    ], loops: 3, steps: 14, plan: ['LL', 'RWRRR'],
  },
  {
    id: 'crossfire', name: 'Crossfire', intro: 'Two of them now. Lamp to lamp.',
    grid: [
      '#############',
      '####^###.####',
      '####.###.####',
      '####.###.####',
      '#S.L.L.L.L.R#',
      '####.###.####',
      '####.###.####',
      '####.###v####',
      '#############',
    ], loops: 1, steps: 30, plan: [],
  },
  {
    id: 'witness', name: '03:14', intro: 'Everything you have learned, at once.',
    grid: [
      '#############',
      '#L..A.....<R#',
      '#S##.########',
      '#.##.########',
      '#a##.########',
      '####.########',
      '#############',
    ], loops: 3, steps: 30, plan: ['DD', 'URRRDDDD'],
  },
];
