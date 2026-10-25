import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOARD } from '../src/js/layout.js';

const { cols: COLS, rows: ROWS, gridPosition } = DEFAULT_BOARD;
import { createReach, advanceReach, reachColor, clusterPositions, renderReach, REACH_DIFFICULTIES } from '../src/js/reach.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const run = (game, seconds, dt = 0.1) => {
  let scored = 0;
  for (let t = 0; t < Math.round(seconds / dt); t++) if (advanceReach(game, dt).scored) scored++;
  return scored;
};

test('a cluster covers its square of bolt-ons plus the screw-ons inside it', () => {
  const lit = new Set(clusterPositions({ col: 4, row: 6 }, 3, DEFAULT_BOARD));
  for (let c = 4; c < 7; c++) for (let r = 6; r < 9; r++) assert.ok(lit.has(gridPosition(c, r)));
  assert.ok(lit.size > 9, 'includes screw-on footholds');
  assert.ok(!lit.has(gridPosition(7, 6)) && !lit.has(gridPosition(4, 9)));
});

test('the cluster moves on and scores when time runs out', () => {
  const game = createReach({ timeLimit: 2, shrinkEvery: 0 }, seeded(3));
  const first = game.target;
  assert.equal(run(game, 1.9), 0);
  assert.equal(game.target, first);
  assert.equal(run(game, 0.1), 1);
  assert.notDeepEqual(game.target, first);
  assert.equal(game.score, 1);
  assert.ok(Math.abs(game.timeLeft - 2) < 1e-9);
});

test('consecutive clusters are spread far apart and stay on the board', () => {
  for (const [key, { settings }] of Object.entries(REACH_DIFFICULTIES)) {
    const game = createReach({ ...settings, shrinkEvery: 0 }, seeded(11));
    const size = game.settings.clusterSize;
    let prev = game.target;
    for (let i = 0; i < 200; i++) {
      run(game, game.timeLimit);
      const t = game.target;
      assert.ok(t.col >= 0 && t.col + size <= COLS, `${key}: off board sideways`);
      assert.ok(t.row >= 0 && t.row + size <= ROWS - game.settings.bottomMargin, `${key}: too low`);
      assert.ok(Math.hypot(t.col - prev.col, t.row - prev.row) >= game.settings.minDistance, `${key}: too close`);
      prev = t;
    }
  }
});

test('time per cluster shrinks to the minimum', () => {
  const game = createReach({ timeLimit: 3, minTimeLimit: 2, shrinkEvery: 1, shrinkBy: 0.5 }, seeded());
  run(game, 3);
  assert.equal(game.timeLimit, 2.5);
  run(game, 2.5);
  run(game, 2);
  assert.equal(game.timeLimit, 2);
});

test('colour goes green, yellow, red as time runs low', () => {
  const game = createReach({ timeLimit: 4, shrinkEvery: 0 }, seeded());
  assert.deepEqual(reachColor(game), [0, 255, 0]);
  run(game, 2.5);
  assert.deepEqual(reachColor(game), [255, 255, 0]);
  run(game, 1);
  assert.deepEqual(reachColor(game), [255, 0, 0]);
  const frame = renderReach(game);
  assert.ok(frame.size >= 4);
  for (const c of frame.values()) assert.deepEqual(c, [255, 0, 0]);
});

test('reach modes get harder', () => {
  const modes = ['beginner', 'intermediate', 'hard', 'impossible'].map((k) => REACH_DIFFICULTIES[k].settings);
  for (let i = 1; i < modes.length; i++) {
    assert.ok(modes[i].timeLimit < modes[i - 1].timeLimit);
    assert.ok(modes[i].minDistance >= modes[i - 1].minDistance);
  }
});
