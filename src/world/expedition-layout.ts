import type { GroundPoint, WalkArea } from '../systems/movement';

export const expeditionAreas = ['quarters', 'annex', 'ridge', 'crevasse', 'borehole'] as const;
export type ExpeditionArea = typeof expeditionAreas[number];
export type Area = 'outside' | 'inside' | ExpeditionArea;
type Fixture = WalkArea['obstacles'][number] & { kind: 'bed' | 'desk' | 'shelf' | 'generator' | 'rock' | 'tower' | 'drill' | 'crate' };

function room(width: number, depth: number, obstacles: Fixture[]) {
  return { minX: -width / 2 + .5, maxX: width / 2 - .5, minZ: -depth / 2 + .5, maxZ: depth / 2 - .5, obstacles };
}

function fixture(kind: Fixture['kind'], x: number, z: number, width: number, depth: number): Fixture {
  return { kind, x, z, width, depth };
}

export const expedition = {
  quarters: {
    title: 'Crew quarters', subtitle: 'INTERIOR · BLOCK B', snow: false, spawn: { x: -8, z: 5 },
    walk: room(21, 14, [
      fixture('bed', -8, -4, 2.3, 4), fixture('bed', -4.3, -4, 2.3, 4), fixture('bed', -.6, -4, 2.3, 4),
      fixture('desk', 7.7, -4.9, 4, 2), fixture('shelf', -9, 1, 1.4, 2.6), fixture('desk', 3.3, 2.7, 3.4, 1.8),
    ]),
  },
  annex: {
    title: 'Power annex', subtitle: 'INTERIOR · UTILITY BLOCK', snow: false, spawn: { x: -9, z: 5 },
    walk: room(24, 15, [
      fixture('generator', -7, -3.6, 3.1, 3.3), fixture('generator', 0, -3.6, 3.1, 3.3),
      fixture('generator', 7.5, -3.6, 3.1, 3.3), fixture('shelf', 10, 2.2, 1.9, 3.8),
      fixture('crate', -4, 2.8, 2.6, 1.9),
    ]),
  },
  ridge: {
    title: 'Relay ridge', subtitle: 'EXTERIOR · NORTH ARRAY', snow: true, spawn: { x: -27, z: 11 },
    walk: room(70, 42, [
      fixture('rock', -21, 1, 4, 7), fixture('rock', -11, -6, 6, 6), fixture('rock', -6, 10, 5, 5),
      fixture('rock', 9, 3, 5, 8), fixture('rock', 18, -12, 7, 5), fixture('rock', 23, 10, 4.5, 6),
      fixture('tower', -23, -12, 3, 3), fixture('tower', 1, -11, 3, 3), fixture('tower', 25, -3, 3, 3),
    ]),
  },
  crevasse: {
    title: 'The crevasse', subtitle: 'EXTERIOR · GLACIER TRENCH', snow: true, spawn: { x: -24, z: 12 },
    walk: room(62, 39, [
      fixture('rock', -17, -8, 9, 8), fixture('rock', -4, 6, 6, 10), fixture('rock', 6, -11, 9, 7),
      fixture('rock', 11, 10, 7, 8), fixture('rock', 21, -5, 5, 8), fixture('crate', -17, 8, 2, 2),
      fixture('crate', 1, -3, 2, 2), fixture('crate', 16, 5, 2, 2),
    ]),
  },
  borehole: {
    title: 'Borehole Nine', subtitle: 'SUBSURFACE · LISTENING CHAMBER', snow: false, spawn: { x: -13, z: 7 },
    walk: room(31, 21, [
      fixture('drill', 3, -4, 7.5, 7.5), fixture('shelf', -12, -5, 2.7, 5),
      fixture('desk', 10.8, -4, 4.2, 2.6), fixture('generator', -5, 3, 3.2, 3.6), fixture('crate', 10, 5, 3.2, 2.4),
    ]),
  },
} satisfies Record<ExpeditionArea, {
  title: string; subtitle: string; snow: boolean; spawn: GroundPoint; walk: ReturnType<typeof room>;
}>;

export const heaters = {
  ridge: [{ x: -27, z: 11 }, { x: -14, z: -12 }, { x: 4.5, z: -7.7 }, { x: 26, z: 2 }],
  crevasse: [{ x: -24, z: 12 }, { x: -10, z: 1 }, { x: 5.5, z: -4.3 }, { x: 21, z: 5 }],
};

export const thinIce = [
  { x: -7.7, z: -1.4, width: 2.35, depth: 11.5 },
  { x: 12.2, z: -1.8, width: 2.5, depth: 10.5 },
];

export const outbuildings = [
  { x: -16, z: .75, width: 7, depth: 4 },
  { x: 25, z: 11.65, width: 8, depth: 4.2 },
];
