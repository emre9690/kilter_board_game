import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, HOLES, gridPosition, bitmapPositions } from '../src/js/layout.js';
import { createGame, tick, renderFrame, barPositions } from '../src/js/game.js';
import { BIG, numberBitmap } from '../src/js/font.js';

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

test('12x12 with kickboard layout has 476 LEDs and a full 17 x 19 bolt-on grid', () => {
  assert.equal(HOLES.length, 476);
  assert.equal(new Set(HOLES.map((h) => h.position)).size, 476);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) assert.notEqual(gridPosition(c, r), undefined, `missing ${c},${r}`);
  }
  assert.equal(gridPosition(COLS, 0), undefined);
});

test('a bar lights every column except the gap', () => {
  const game = createGame({ gapWidth: 5 }, seeded());
  const bar = { row: 3, gapStart: 6 };
  const lit = new Set(barPositions(bar, game.settings));
  assert.equal(lit.size, COLS - 5);
  for (let c = 6; c <= 10; c++) assert.ok(!lit.has(gridPosition(c, 3)));
  assert.ok(lit.has(gridPosition(5, 3)) && lit.has(gridPosition(11, 3)));
});

test('thick bars add screw-on holds but keep the gap clear', () => {
  const game = createGame({ gapWidth: 5, thickBars: true }, seeded());
  const bar = { row: 5, gapStart: 6 };
  const thin = barPositions(bar, { ...game.settings, thickBars: false });
  const thick = barPositions(bar, game.settings);
  assert.ok(thick.length > thin.length);
  const gapHoles = HOLES.filter((h) => h.x > 48 && h.x < 96).map((h) => h.position);
  assert.ok(gapHoles.every((p) => !thick.includes(p)));
});

test('bars spawn at the top, fall one row per tick and score at the bottom', () => {
  const game = createGame({ barSpacing: 7, speedUpEvery: 0 }, seeded(7));
  tick(game);
  assert.equal(game.bars.length, 1);
  assert.equal(game.bars[0].row, 0);
  let scoredAt = null;
  for (let t = 1; t < 40 && scoredAt === null; t++) {
    if (tick(game).cleared) scoredAt = t;
  }
  assert.equal(scoredAt, ROWS);
  assert.equal(game.score, 1);
});

test('gaps stay on the board and move by at most maxGapShift', () => {
  const game = createGame({ gapWidth: 5, maxGapShift: 3, barSpacing: 1 }, seeded(42));
  let prev = null;
  for (let t = 0; t < 500; t++) {
    tick(game);
    const g = game.lastGapStart;
    assert.ok(g >= 0 && g + 5 <= COLS);
    if (prev !== null && game.ticksSinceSpawn === 0) {
      assert.ok(Math.abs(g - prev) <= 3 && g !== prev);
    }
    prev = g;
  }
});

test('speed increases every N bars down to the minimum', () => {
  const game = createGame({ rowSeconds: 1, minRowSeconds: 0.8, speedUpEvery: 1, speedUpFactor: 0.5, barSpacing: 1 }, seeded());
  for (let t = 0; t < ROWS + 3; t++) tick(game);
  assert.ok(game.score >= 2);
  assert.equal(game.rowSeconds, 0.8);
});

test('rendered frame has one color per lit position', () => {
  const game = createGame({}, seeded(3));
  for (let t = 0; t < 20; t++) tick(game);
  const frame = renderFrame(game, [1, 2, 3]);
  assert.ok(frame.size > 0);
  for (const color of frame.values()) assert.deepEqual(color, [1, 2, 3]);
});

test('countdown digits, GO and scores fit on the board', () => {
  for (const key of ['3', '2', '1', 'GO']) {
    const bitmap = BIG[key];
    const expected = bitmap.join('').split('').filter((ch) => ch === '#').length;
    assert.equal(bitmapPositions(bitmap).length, expected, `clipped ${key}`);
  }
  for (const n of [0, 7, 42, 99, 123]) {
    const bitmap = numberBitmap(n);
    assert.ok(bitmap[0].length <= COLS, `score ${n} too wide`);
    const expected = bitmap.join('').split('').filter((ch) => ch === '#').length;
    assert.equal(bitmapPositions(bitmap).length, expected);
  }
});
