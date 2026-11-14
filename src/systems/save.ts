import { radioRoom, station, walkAreas } from '../world/layout';
import { canStandAt, type GroundPoint } from './movement';

export interface Save extends GroundPoint {
  level: 'outside' | 'inside';
  heard: boolean;
  flashlight: boolean;
}

const KEY = 'the-white-signal:v1';

export const freshSave = (): Save => ({
  level: 'outside',
  ...station.spawn,
  heard: false,
  flashlight: true,
});

export function loadSave(): Save {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && (saved.level === 'outside' || saved.level === 'inside') &&
        Number.isFinite(saved.x) && typeof saved.heard === 'boolean') {
      const level: Save['level'] = saved.level;
      const spawn = level === 'inside' ? radioRoom.spawn : station.spawn;
      const area = walkAreas[level];
      const x = Math.max(area.minX, Math.min(area.maxX, saved.x));
      // Older checkpoints only recorded X. Restore them on the clear approach or room aisle.
      const z = Number.isFinite(saved.z)
        ? Math.max(area.minZ, Math.min(area.maxZ, saved.z))
        : spawn.z;
      const position = canStandAt(x, z, area) ? { x, z } : spawn;
      return { level, ...position, heard: saved.heard, flashlight: saved.flashlight !== false };
    }
  } catch {
    // Storage can be unavailable in private browsing.
  }
  return freshSave();
}

export function saveGame(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
