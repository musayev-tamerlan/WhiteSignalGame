import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { move, type Body, type MovementInput, type WalkArea } from './movement';

const body = (): Body => ({
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  facing: { x: 1, z: 0 }, grounded: true,
});
const open: WalkArea = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, obstacles: [] };
const right: MovementInput = { right: 1, down: 0, run: false, jump: false };
const still: MovementInput = { ...right, right: 0 };
const tick = 1 / 60;

test('running exceeds walking speed and both world axes respect boundaries', () => {
  const walk = body();
  const run = body();
  for (let i = 0; i < 60; i++) {
    move(walk, right, tick, open);
    move(run, { ...right, run: true }, tick, open);
  }
  assert.ok(run.x > walk.x);
  for (let i = 0; i < 600; i++) move(run, { ...right, run: true }, tick, open);
  assert.equal(run.x, 10);
  assert.equal(run.z, -10);
});

test('screen movement has equal speed along cardinal and diagonal directions', () => {
  const horizontal = body();
  const upRight = body();
  for (let i = 0; i < 60; i++) {
    move(horizontal, right, tick, open);
    move(upRight, { ...right, down: -1 }, tick, open);
  }
  assert.ok(horizontal.x > 0 && horizontal.z < 0);
  assert.equal(upRight.x, 0);
  assert.ok(upRight.z < 0);
  assert.ok(Math.abs(Math.hypot(horizontal.x, horizontal.z) - Math.hypot(upRight.x, upRight.z)) < 1e-8);
});

test('solid furniture blocks movement while leaving the aisle passable', () => {
  const area = { ...open, obstacles: [{ x: 0, z: -3, width: 2, depth: 1 }] };
  const player = body();
  for (let i = 0; i < 120; i++) move(player, { ...right, down: -1 }, tick, area);
  assert.ok(player.z > -2.23 && player.z < -2);
  for (let i = 0; i < 45; i++) move(player, { ...right, down: 1 }, tick, area);
  assert.ok(player.x > 1.28);
  for (let i = 0; i < 120; i++) move(player, { ...right, down: -1 }, tick, area);
  assert.ok(player.z < -3.5);
});

test('jump cannot repeat in the air and lands on the ground', () => {
  const player = body();
  move(player, { ...still, jump: true }, tick, open);
  assert.ok(player.y > 0);
  const upwardSpeed = player.vy;
  move(player, { ...still, jump: true }, tick, open);
  assert.ok(player.vy < upwardSpeed);
  for (let i = 0; i < 120; i++) move(player, still, tick, open);
  assert.equal(player.y, 0);
  assert.equal(player.grounded, true);
});

test('fixed simulation produces the same outcome for different render batches', () => {
  function simulate(batches: number[]) {
    const player = body();
    let accumulator = 0;
    for (const delta of batches) {
      accumulator += delta;
      while (accumulator >= tick) {
        move(player, right, tick, open);
        accumulator -= tick;
      }
    }
    return player;
  }
  assert.deepEqual(simulate(Array(60).fill(tick)), simulate(Array(30).fill(2 * tick)));
});
