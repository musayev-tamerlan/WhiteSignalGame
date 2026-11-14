import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canStandAt } from '../systems/movement';
import { freshSave, loadSave } from '../systems/save';
import { archive } from '../systems/progress';
import type { Area } from './expedition-layout';
import { walkAreas } from './layout';
import { available, currentObjective, endings, hotspots, routeTarget } from './story';

test('a fresh expedition has a reachable route to both endings', () => {
  const save = freshSave();
  const visited = new Set<string>();
  for (let i = 0; i < 80; i++) {
    const objective = currentObjective(save);
    const target = routeTarget(save, objective.target);
    assert.ok(target, objective.text);
    assert.equal(save.level, target.area);
    assert.ok(available(save, target), target.id);
    if (target.destination) {
      save.level = target.destination.area;
      continue;
    }
    assert.equal(target.id, objective.target);
    assert.ok(!visited.has(target.id));
    visited.add(target.id);
    if (target.finale) break;
    assert.ok(target.proof, target.id);
    save.progress.push(target.proof);
  }
  assert.ok(visited.has('decision'));
  for (const ending of Object.keys(endings) as (keyof typeof endings)[]) {
    save.ending = ending;
    assert.equal(currentObjective(save).target, '');
  }
  assert.deepEqual(hotspots.flatMap(spot => spot.record ? [spot.record] : []).sort(), Object.keys(archive).sort());
});

test('all prompts and portals are reachable from their area entry points', () => {
  const spacing = .25;
  const offsets = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const area of Object.keys(walkAreas) as Area[]) {
    const walk = walkAreas[area];
    const spots = hotspots.filter(spot => spot.area === area);
    const arrivals = hotspots.flatMap(spot => spot.destination?.area === area ? [spot.destination.point] : []);
    if (area === 'outside') arrivals.push(freshSave());
    assert.ok(arrivals.length, area);
    for (const arrival of arrivals) assert.ok(canStandAt(arrival.x, arrival.z, walk), `${area} arrival blocked`);

    const start = [Math.round(arrivals[0].x / spacing), Math.round(arrivals[0].z / spacing)];
    const queue = [start];
    const seen = new Set([start.join(',')]);
    for (const [x, z] of queue) {
      for (const [dx, dz] of offsets) {
        const point = [x + dx, z + dz];
        const id = point.join(',');
        if (seen.has(id) || !canStandAt(point[0] * spacing, point[1] * spacing, walk)) continue;
        seen.add(id);
        queue.push(point);
      }
    }
    for (const spot of spots) {
      assert.ok(queue.some(([x, z]) => Math.hypot(x * spacing - spot.x, z * spacing - spot.z) < spot.radius), `${spot.id} unreachable`);
    }
  }
});

test('an older radio checkpoint unlocks the new crew quarters objective', () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => JSON.stringify({ level: 'inside', x: 3.5, heard: true, flashlight: false }) },
  });
  try {
    const save = loadSave();
    assert.deepEqual(save.progress, ['heard']);
    assert.equal(save.flashlight, false);
    assert.equal(currentObjective(save).target, 'roster');
    assert.equal(routeTarget(save, 'roster')?.id, 'exit');
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
