import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { expedition, heaters, thinIce } from '../world/expedition-layout';
import type { Body, GroundPoint } from './movement';
import { FieldConditions } from './field';

function body(point: GroundPoint): Body {
  return { ...point, y: 0, vx: 0, vy: 0, vz: 0, facing: { x: 1, z: 0 }, grounded: true };
}

test('sprinting near the figure builds exposure and heaters restore warmth safely', () => {
  const field = new FieldConditions();
  field.reset('ridge');
  const runner = body({ x: -11, z: 0 });
  for (let i = 0; i < 60; i++) field.tick('ridge', runner, 5, false, 1 / 60);
  assert.ok(field.alert > .5);
  assert.ok(field.warm < 100);

  const safe = body(heaters.ridge[0]);
  for (let i = 0; i < 160; i++) field.tick('ridge', safe, 0, true, 1 / 60);
  assert.equal(field.alert, 0);
  assert.equal(field.warm, 100);
  assert.equal(field.shelter, true);
});

test('thin ice only cracks under a grounded player and recovers at the last beacon', () => {
  const field = new FieldConditions();
  field.reset('crevasse');
  const safe = heaters.crevasse[1];
  field.tick('crevasse', body(safe), 0, false, 1 / 60);
  const crossing = { ...body(thinIce[0]), grounded: false, y: 1 };
  for (let i = 0; i < 60; i++) assert.equal(field.tick('crevasse', crossing, 5, false, 1 / 60), undefined);
  assert.equal(field.ice, 0);
  let failure;
  for (let i = 0; i < 55 && !failure; i++) failure = field.tick('crevasse', body(thinIce[0]), 0, false, 1 / 60);
  assert.deepEqual(failure?.checkpoint, safe);
});

test('a whiteout returns the player to the trail entry when no other heater has been visited', () => {
  const field = new FieldConditions();
  field.reset('ridge');
  field.warm = .01;
  const outcome = field.tick('ridge', body({ x: 31, z: 14 }), 0, false, 1 / 60 * 2);
  assert.deepEqual(outcome?.checkpoint, expedition.ridge.spawn);
});
