import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_FIELDS } from '../src/js/custom.js';
import { BOARD_LIST, getBoard, DEFAULT_BOARD } from '../src/js/layout.js';
import { createGame, tick, DEFAULT_SETTINGS, DIFFICULTIES } from '../src/js/game.js';
import { createReach, advanceReach, REACH_DEFAULTS, REACH_DIFFICULTIES } from '../src/js/reach.js';

const GAMES = {
  drop: { defaults: DEFAULT_SETTINGS, presets: DIFFICULTIES },
  reach: { defaults: REACH_DEFAULTS, presets: REACH_DIFFICULTIES },
};

test('every custom slider edits a real game setting', () => {
  for (const [game, fields] of Object.entries(CUSTOM_FIELDS)) {
    const known = new Set([...Object.keys(GAMES[game].defaults), 'getReadySeconds']);
    for (const f of fields) assert.ok(known.has(f.key), `${game}: unknown setting ${f.key}`);
  }
});

test('every preset fits inside the custom slider ranges on every board', () => {
  for (const [game, fields] of Object.entries(CUSTOM_FIELDS)) {
    for (const [mode, { settings }] of Object.entries(GAMES[game].presets)) {
      const values = { getReadySeconds: 5, ...GAMES[game].defaults, ...settings };
      for (const { id } of BOARD_LIST) {
        const board = getBoard(id);
        for (const f of fields) {
          if (f.type === 'toggle') continue;
          const max = typeof f.max === 'function' ? f.max(board) : f.max;
          const ui = f.toUi ? f.toUi(values[f.key]) : values[f.key];
          // The gap slider is capped per board; createGame applies the same cap.
          const capped = f.key === 'gapWidth' ? Math.min(ui, max) : ui;
          assert.ok(capped >= f.min && capped <= max, `${game}/${mode}/${board.name}: ${f.key}=${ui} outside ${f.min}..${max}`);
        }
      }
    }
  }
});

test('speed-up amount slider round-trips the stored factor', () => {
  const f = CUSTOM_FIELDS.drop.find((x) => x.key === 'speedUpFactor');
  assert.equal(f.toUi(0.9), 10);
  assert.ok(Math.abs(f.fromUi(10) - 0.9) < 1e-9);
});

test('custom values in a strange order still play', () => {
  const drop = createGame({ rowSeconds: 0.5, minRowSeconds: 2, gapWidth: 99, sideJitter: 9 }, Math.random, DEFAULT_BOARD);
  assert.equal(drop.settings.minRowSeconds, 0.5);
  assert.ok(drop.settings.gapWidth * 2 <= DEFAULT_BOARD.cols);
  for (let t = 0; t < 100; t++) tick(drop);
  assert.ok(drop.score > 0);

  const reach = createReach({ timeLimit: 3, minTimeLimit: 10, clusterSize: 4, minDistance: 12 });
  assert.equal(reach.settings.minTimeLimit, 3);
  let scored = 0;
  for (let t = 0; t < 100; t++) if (advanceReach(reach, 0.5).scored) scored++;
  assert.ok(scored > 0);
});
