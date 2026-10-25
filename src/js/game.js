// Falling-bars game state. Pure logic: no timers, DOM or Bluetooth here.
//
// A bar is a full-width row of lit holds with a gap of `gapWidth` columns.
// Every tick all bars drop one row; a bar that falls off the bottom scores a point.
// Honor system: touching a lit hold means you're out.

import { COLS, ROWS, gridPosition, holesNearRow, colToX } from './layout.js';

export const DEFAULT_SETTINGS = {
  gapWidth: 5, // holds
  rowSeconds: 1.5, // starting time per row drop
  minRowSeconds: 0.6,
  speedUpEvery: 3, // bars cleared between speed-ups (0 = never)
  speedUpFactor: 0.9,
  barSpacing: 7, // rows between consecutive bars
  maxGapShift: 4, // max columns the gap moves between bars
  thickBars: false, // also light the screw-on rows above/below each bar
  getReadySeconds: 5,
};

export const BAR_COLORS = [
  [0, 0, 255], // blue
  [160, 0, 255], // purple
  [255, 0, 0], // red
];

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
  const maxStart = COLS - gapWidth;
  const rand = (n) => Math.floor(game.random() * n);
  if (game.lastGapStart === null) return rand(maxStart + 1);
  // Always move at least one column so every bar asks for a move, but stay reachable.
  const lo = Math.max(0, game.lastGapStart - maxGapShift);
  const hi = Math.min(maxStart, game.lastGapStart + maxGapShift);
  const options = [];
  for (let c = lo; c <= hi; c++) if (c !== game.lastGapStart) options.push(c);
  return options.length ? options[rand(options.length)] : game.lastGapStart;
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

  game.ticksSinceSpawn += 1;
  if (game.ticksSinceSpawn >= game.settings.barSpacing) {
    const gapStart = nextGapStart(game);
    game.bars.push({ row: 0, gapStart });
    game.lastGapStart = gapStart;
    game.ticksSinceSpawn = 0;
  }
  return { cleared };
}

export function barColor(game) {
  const tier = Math.min(BAR_COLORS.length - 1, Math.floor(game.speedLevel / 2));
  return BAR_COLORS[tier];
}

// LED positions lit by one bar.
export function barPositions(bar, settings) {
  const { gapWidth, thickBars } = settings;
  const gapEnd = bar.gapStart + gapWidth - 1;
  const positions = [];
  for (let c = 0; c < COLS; c++) {
    if (c >= bar.gapStart && c <= gapEnd) continue;
    const pos = gridPosition(c, bar.row);
    if (pos !== undefined) positions.push(pos);
  }
  if (thickBars) {
    // Screw-ons half a column outside the gap edge count as part of the gap.
    const gapLeftX = colToX(bar.gapStart) - 8;
    const gapRightX = colToX(gapEnd) + 8;
    for (const hole of holesNearRow(bar.row, 4)) {
      if (hole.boltOn || (hole.x > gapLeftX && hole.x < gapRightX)) continue;
      positions.push(hole.position);
    }
  }
  return positions;
}

// Full frame to send to the board: Map(position -> [r, g, b]).
export function renderFrame(game, color = barColor(game)) {
  const frame = new Map();
  for (const bar of game.bars) {
    for (const pos of barPositions(bar, game.settings)) frame.set(pos, color);
  }
  return frame;
}
