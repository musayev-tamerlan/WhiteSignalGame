import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initial, parse, replay, solve, step } from './engine';
import { levels } from './levels';
import { dailyLevel, decodeLevel, encodeLevel, shareCard, variant } from './share';
import { recordDaily, starsFor, type LoopProgress } from './progress';

test('every level is solvable with its designer loops and impossible with fewer', () => {
  for (const level of levels) {
    const board = parse(level.grid);
    assert.equal(level.plan.length, level.loops - 1, `${level.id} plan length`);
    const final = solve(board, level.plan, level.steps);
    assert.ok(final, `${level.id} unsolvable`);
    assert.ok(replay(board, [...level.plan, final!], level.steps).won, `${level.id} replay`);
    if (level.loops > 1) assert.equal(solve(board, level.plan.slice(0, -1), level.steps), undefined, `${level.id} needs ${level.loops} loops`);
  }
});

test('rotated and mirrored levels stay solvable', () => {
  for (const level of levels.slice(0, 6)) {
    for (const turn of [1, 2, 3, 4, 5]) {
      const shifted = variant(level, turn);
      assert.ok(solve(parse(shifted.grid), shifted.plan, shifted.steps), `${level.id} turn ${turn}`);
    }
  }
});

test('the daily signal is stable for a day and solvable', () => {
  for (const day of [1, 2, 15, 99, 365]) {
    const daily = dailyLevel(day);
    assert.deepEqual(daily, dailyLevel(day));
    assert.ok(solve(parse(daily.grid), daily.plan, daily.steps), `day ${day}`);
  }
});

test('plates hold doors, light protects, and the receiver needs every fuse', () => {
  const board = parse(['#######', '#S.F.R#', '#######']);
  let sim = initial(board, 1);
  for (const dir of ['R', 'R', 'R']) sim = step(board, sim, [dir as 'R']).sim;
  assert.equal(sim.fuses.length, 1);
  sim = step(board, sim, ['R']).sim;
  assert.ok(sim.won);
  const dark = parse(['#######', '#S.F.R#', '#######']);
  assert.ok(!replay(dark, ['RR'], 4).won);
});

test('shared levels round-trip and reject junk', () => {
  const level = levels[1];
  const decoded = decodeLevel(encodeLevel(level));
  assert.deepEqual(decoded?.grid, level.grid);
  assert.equal(decoded?.loops, level.loops);
  assert.equal(decodeLevel('not-a-level'), undefined);
  assert.equal(decodeLevel(encodeLevel({ ...level, grid: ['###', '#X#', '###'] })), undefined);
});

test('stars, streaks and share cards', () => {
  assert.equal(starsFor(2, 2, 10, 9, false), 3);
  assert.equal(starsFor(2, 2, 10, 9, true), 2);
  assert.equal(starsFor(3, 2, 10, 9, false), 1);
  const progress: LoopProgress = { stars: {}, daily: { last: 0, streak: 0, best: {} }, rooms: [], suit: 'default' };
  assert.equal(recordDaily(progress, 10, 2), 1);
  assert.equal(recordDaily(progress, 11, 3), 2);
  assert.equal(recordDaily(progress, 13, 3), 1);
  assert.match(shareCard('Signal #3', 2, 3, 14, 3, 'https://x'), /🔁🔁⬛ 2\/3/);
});
