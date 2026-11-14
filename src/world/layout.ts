import type { WalkArea } from '../systems/movement';
import { expedition, outbuildings, type Area } from './expedition-layout';

export const station = {
  building: { x: 8.5, z: -5.5, width: 13, depth: 7 },
  entrance: { x: 10.2, z: 0.65, radius: 1.7 },
  spawn: { x: -5, z: 5 },
  crates: [
    { x: -3.1, z: 2.4, width: 1.45, depth: 1.1 },
    { x: -1.5, z: 2.4, width: 1.25, depth: 1.1 },
    { x: 15.8, z: 0.9, width: 1.5, depth: 1.2 },
  ],
};

export const radioRoom = {
  spawn: { x: -5.6, z: 2.9 },
  exit: { x: -5.6, z: 4.1, radius: 1.3 },
  terminal: { x: 3.5, z: -1.8, radius: 1.65 },
  desk: { x: 3.5, z: -3.35, width: 5.8, depth: 1.45 },
  rack: { x: -3.1, z: -3.6, width: 3.8, depth: 1.45 },
  bench: { x: -6.5, z: -0.3, width: 1.55, depth: 3.25 },
};

export const walkAreas: Record<Area, WalkArea> = {
  outside: {
    minX: -24, maxX: 32, minZ: -16, maxZ: 21,
    obstacles: [station.building, ...station.crates, ...outbuildings],
  },
  quarters: expedition.quarters.walk,
  annex: expedition.annex.walk,
  ridge: expedition.ridge.walk,
  crevasse: expedition.crevasse.walk,
  borehole: expedition.borehole.walk,
  inside: {
    minX: -7.5, maxX: 7.5, minZ: -4.55, maxZ: 4.55,
    obstacles: [radioRoom.desk, radioRoom.rack, radioRoom.bench],
  },
};
