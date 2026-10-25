// Falling-bars game state. Pure logic: no timers, DOM or Bluetooth here.
//
// A bar is a full-width band of lit holds with a gap of `gapWidth` columns. Thin bars are one
// bolt-on row; thick bars are two bolt-on rows plus the screw-on footholds between them.
// Every tick all bars drop one row; a bar that falls off the bottom scores a point.
// Honor system: touching a lit hold means you're out.

import { COLS, ROWS, HOLES, colToX, rowToY } from './layout.js';

export const DEFAULT_SETTINGS = {
  gapWidth: 5, // holds
  rowSeconds: 1.2, // starting time per row drop
  minRowSeconds: 0.6,
  speedUpEvery: 3, // bars cleared between speed-ups (0 = never)
  speedUpFactor: 0.9,
  barSpacing: 7, // rows between consecutive bars (thick bars add their extra row on top)
  minGapShift: null, // min columns the gap jumps between bars (null = gapWidth, so gaps never overlap)
  maxGapShift: 8, // max columns the gap jumps between bars
  thickBars: true, // two bolt-on rows + the screw-on footholds between them
  getReadySeconds: 5,
};

// Difficulty presets, applied on top of DEFAULT_SETTINGS.
export const DIFFICULTIES = {
  beginner: {
    label: 'Beginner',
    settings: { gapWidth: 7, rowSeconds: 1.6, minRowSeconds: 1.0, barSpacing: 9, minGapShift: 3, maxGapShift: 6, speedUpEvery: 5, speedUpFactor: 0.93 },
  },
  intermediate: {
    label: 'Intermediate',
    settings: { gapWidth: 5, rowSeconds: 1.2, minRowSeconds: 0.7, barSpacing: 7, minGapShift: 5, maxGapShift: 8, speedUpEvery: 3, speedUpFactor: 0.9 },
  },
  hard: {
    label: 'Hard',
    settings: { gapWidth: 4, rowSeconds: 0.9, minRowSeconds: 0.55, barSpacing: 6, minGapShift: 4, maxGapShift: 9, speedUpEvery: 3, speedUpFactor: 0.88 },
  },
  impossible: {
    label: 'Impossible',
    settings: { gapWidth: 3, rowSeconds: 0.6, minRowSeconds: 0.4, barSpacing: 5, minGapShift: 5, maxGapShift: 12, speedUpEvery: 2, speedUpFactor: 0.85 },
  },
};

export const BAR_COLOR = [255, 0, 0]; // red

export const barThickness = (settings) => (settings.thickBars ? 2 : 1);

export function createGame(settings = DEFAULT_SETTINGS, random = Math.random) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  s.gapWidth = Math.max(1, Math.min(COLS - 2, Math.round(s.gapWidth)));
  return {
    settings: s,
    random,
    bars: [],
    score: 0,
    speedLevel: 0,
    rowSeconds: s.rowSeconds,
    ticksSinceSpawn: Infinity,
    lastGapStart: null,
  };
}

function nextGapStart(game) {
  const { gapWidth, maxGapShift } = game.settings;
  const minShift = game.settings.minGapShift ?? gapWidth;
  const maxStart = COLS - gapWidth;
  const rand = (n) => Math.floor(game.random() * n);
  const last = game.lastGapStart;
  if (last === null) return rand(maxStart + 1);
  // Jump at least minShift so the gap clearly moves, but cap the jump to stay reachable.
  const maxShift = Math.max(maxGapShift, minShift);
  const options = [];
  for (let c = 0; c <= maxStart; c++) {
    const shift = Math.abs(c - last);
    if (shift >= minShift && shift <= maxShift) options.push(c);
  }
  if (options.length) return options[rand(options.length)];
  // Gap too wide for a clean jump: go as far as the board allows.
  return last * 2 < maxStart ? maxStart : 0;
}

// Advance one row. Returns { cleared } with the number of bars that left the board.
export function tick(game) {
  for (const bar of game.bars) bar.row += 1;
  const before = game.bars.length;
  game.bars = game.bars.filter((bar) => bar.row < ROWS);
  const cleared = before - game.bars.length;

  for (let i = 0; i < cleared; i++) {
    game.score += 1;
    const { speedUpEvery, speedUpFactor, minRowSeconds } = game.settings;
    if (speedUpEvery > 0 && game.score % speedUpEvery === 0) {
      game.speedLevel += 1;
      game.rowSeconds = Math.max(minRowSeconds, game.rowSeconds * speedUpFactor);
    }
  }

  // bar.row is the bar's top row. New bars slide in from above, so only their bottom row shows at first.
  const thickness = barThickness(game.settings);
  game.ticksSinceSpawn += 1;
  if (game.ticksSinceSpawn >= game.settings.barSpacing + thickness - 1) {
    const gapStart = nextGapStart(game);
    game.bars.push({ row: 1 - thickness, gapStart });
    game.lastGapStart = gapStart;
    game.ticksSinceSpawn = 0;
  }
  return { cleared };
}

// LED positions lit by one bar: every hole (bolt-on or screw-on) between the bar's top and bottom bolt-on rows, minus the gap.
// At the bottom row this also picks up the kickboard footholds below it.
export function barPositions(bar, settings) {
  const gapEnd = bar.gapStart + settings.gapWidth - 1;
  const yTop = rowToY(bar.row);
  const yBottom = rowToY(bar.row + barThickness(settings) - 1);
  // Screw-ons half a column outside the gap edge count as part of the gap.
  const gapLeftX = colToX(bar.gapStart) - 8;
  const gapRightX = colToX(gapEnd) + 8;
  return HOLES.filter((h) => h.y <= yTop && h.y >= yBottom && !(h.x > gapLeftX && h.x < gapRightX)).map(
    (h) => h.position,
  );
}

// Full frame to send to the board: Map(position -> [r, g, b]).
export function renderFrame(game, color = BAR_COLOR) {
  const frame = new Map();
  for (const bar of game.bars) {
    for (const pos of barPositions(bar, game.settings)) frame.set(pos, color);
  }
  return frame;
}
