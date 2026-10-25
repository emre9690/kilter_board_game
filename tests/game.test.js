import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BOARD } from '../src/js/layout.js';

const { cols: COLS, rows: ROWS, holes: HOLES, gridPosition, bitmapPositions } = DEFAULT_BOARD;
import { createGame, tick, renderFrame, barPositions, DEFAULT_SETTINGS, DIFFICULTIES } from '../src/js/game.js';
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

test('a thin bar lights every column except the gap', () => {
  const game = createGame({ gapWidth: 5, thickBars: false }, seeded());
  const bar = { row: 3, gapStart: 6 };
  const lit = new Set(barPositions(bar, game.settings, game.board));
  assert.equal(lit.size, COLS - 5);
  for (let c = 6; c <= 10; c++) assert.ok(!lit.has(gridPosition(c, 3)));
  assert.ok(lit.has(gridPosition(5, 3)) && lit.has(gridPosition(11, 3)));
});

test('thick bars are on by default', () => {
  assert.equal(DEFAULT_SETTINGS.thickBars, true);
});

test('thick bars cover two bolt-on rows plus the footholds between, gap kept clear', () => {
  const game = createGame({ gapWidth: 5, thickBars: true }, seeded());
  const bar = { row: 5, gapStart: 6 };
  const thick = new Set(barPositions(bar, game.settings, game.board));
  for (const row of [5, 6]) {
    for (let c = 0; c < COLS; c++) assert.equal(thick.has(gridPosition(c, row)), c < 6 || c > 10, `col ${c} row ${row}`);
  }
  const footholds = HOLES.filter((h) => h.y === 108); // screw-on row between rows 5 (y 112) and 6 (y 104)
  const outside = footholds.filter((h) => h.x < 48 || h.x > 96);
  assert.ok(outside.length > 0 && outside.every((h) => thick.has(h.position)));
  const gapHoles = HOLES.filter((h) => h.x > 48 && h.x < 96).map((h) => h.position);
  assert.ok(gapHoles.every((p) => !thick.has(p)));
  assert.ok(HOLES.filter((h) => h.y > 112 || h.y < 104).every((h) => !thick.has(h.position)));
});

test('a thick bar on the bottom row lights the kickboard footholds', () => {
  const game = createGame({ thickBars: true }, seeded());
  const lit = new Set(barPositions({ row: ROWS - 1, gapStart: 0 }, game.settings, game.board));
  assert.ok(HOLES.filter((h) => h.y === 4 && h.x > 48).every((h) => lit.has(h.position)));
});

test('thin bars spawn at the top, fall one row per tick and score at the bottom', () => {
  const game = createGame({ barSpacing: 7, speedUpEvery: 0, thickBars: false }, seeded(7));
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

// Gap starts for each new bar over a run.
function gapHistory(settings, seed, ticks = 600) {
  const game = createGame(settings, seeded(seed));
  const gaps = [];
  for (let t = 0; t < ticks; t++) {
    tick(game);
    if (game.ticksSinceSpawn === 0) gaps.push(game.lastGapStart);
  }
  return gaps;
}

test('gaps alternate between the far left and far right, within the jitter', () => {
  const gaps = gapHistory({ gapWidth: 5, sideJitter: 2, barSpacing: 1 }, 42);
  const maxStart = COLS - 5;
  const sides = gaps.map((g) => (g <= 2 ? 'L' : g >= maxStart - 2 ? 'R' : '?'));
  assert.ok(!sides.includes('?'), `gap away from the edges: ${gaps}`);
  for (let i = 1; i < sides.length; i++) assert.notEqual(sides[i], sides[i - 1], 'same side twice');
  assert.ok(new Set(gaps).size > 2, 'jitter adds some variation');
});

test('thick bars slide in from above and are spaced one row further apart', () => {
  const game = createGame({ barSpacing: 7, speedUpEvery: 0, thickBars: true }, seeded(7));
  tick(game);
  assert.equal(game.bars[0].row, -1); // only its bottom row is on the board
  let ticks = 1;
  while (game.bars.length < 2) {
    tick(game);
    ticks++;
  }
  assert.equal(game.bars[0].row - game.bars[1].row, 8);
  do ticks++;
  while (!tick(game).cleared);
  // From row -1 the bar needs ROWS + 1 drops until its top row leaves the bottom.
  assert.equal(ticks, 1 + ROWS + 1);
});

test('speed increases every N bars down to the minimum', () => {
  const game = createGame({ rowSeconds: 1, minRowSeconds: 0.8, speedUpEvery: 1, speedUpFactor: 0.5, barSpacing: 1, thickBars: false }, seeded());
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

test('difficulty modes get strictly harder', () => {
  const modes = ['beginner', 'intermediate', 'hard', 'impossible'].map((k) => DIFFICULTIES[k].settings);
  for (let i = 1; i < modes.length; i++) {
    assert.ok(modes[i].gapWidth < modes[i - 1].gapWidth, 'gap shrinks');
    assert.ok(modes[i].rowSeconds < modes[i - 1].rowSeconds, 'bars fall faster');
    assert.ok(modes[i].barSpacing < modes[i - 1].barSpacing, 'bars come closer together');
  }
  // Room for a tall climber: at least 10 open rows between bars in every mode.
  for (const m of modes) assert.ok(m.barSpacing >= 10);
});

test('every difficulty plays with gaps on the board, swinging side to side', () => {
  for (const [key, { settings }] of Object.entries(DIFFICULTIES)) {
    const game = createGame(settings, seeded(5));
    let prev = null;
    for (let t = 0; t < 800; t++) {
      tick(game);
      const g = game.lastGapStart;
      assert.ok(g >= 0 && g + settings.gapWidth <= COLS, `${key}: gap off board`);
      if (prev !== null && game.ticksSinceSpawn === 0) {
        assert.ok(Math.abs(g - prev) >= COLS - settings.gapWidth - 2 * settings.sideJitter, `${key}: gap stayed on one side`);
      }
      if (game.ticksSinceSpawn === 0) prev = g;
    }
    assert.ok(game.score > 0, `${key}: never scored`);
    assert.ok(game.rowSeconds >= settings.minRowSeconds);
  }
});
