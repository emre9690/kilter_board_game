// Falling-bars game state. Pure logic: no timers, DOM or Bluetooth here.
//
// A bar is a full-width band of lit holds with a gap of `gapWidth` columns. Thin bars are one
// bolt-on row; thick bars are two bolt-on rows plus the screw-on footholds between them.
// Gaps alternate between the far left and far right of the board, give or take `sideJitter` columns.
// Every tick all bars drop one row; a bar that falls off the bottom scores a point.
// Honor system: touching a lit hold means you're out.

import { DEFAULT_BOARD } from './layout.js';

export const DEFAULT_SETTINGS = {
  gapWidth: 5, // holds
  rowSeconds: 1.2, // starting time per row drop
  minRowSeconds: 0.6,
  speedUpEvery: 3, // bars cleared between speed-ups (0 = never)
  speedUpFactor: 0.9,
  barSpacing: 14, // rows between consecutive bars (thick bars add their extra row on top)
  sideJitter: 2, // how many columns in from the edge a gap may sit
  thickBars: true, // two bolt-on rows + the screw-on footholds between them
  getReadySeconds: 5,
};

// Difficulty presets, applied on top of DEFAULT_SETTINGS.
export const DIFFICULTIES = {
  beginner: {
    label: 'Beginner',
    settings: { gapWidth: 7, rowSeconds: 1.6, minRowSeconds: 1.0, barSpacing: 18, sideJitter: 1, speedUpEvery: 5, speedUpFactor: 0.93 },
  },
  intermediate: {
    label: 'Intermediate',
    settings: { gapWidth: 5, rowSeconds: 1.2, minRowSeconds: 0.7, barSpacing: 14, sideJitter: 2, speedUpEvery: 3, speedUpFactor: 0.9 },
  },
  hard: {
    label: 'Hard',
    settings: { gapWidth: 4, rowSeconds: 0.9, minRowSeconds: 0.55, barSpacing: 12, sideJitter: 2, speedUpEvery: 3, speedUpFactor: 0.88 },
  },
  impossible: {
    label: 'Impossible',
    settings: { gapWidth: 3, rowSeconds: 0.6, minRowSeconds: 0.4, barSpacing: 10, sideJitter: 3, speedUpEvery: 2, speedUpFactor: 0.85 },
  },
};

export const BAR_COLOR = [255, 0, 0]; // red

export const barThickness = (settings) => (settings.thickBars ? 2 : 1);

export function createGame(settings = DEFAULT_SETTINGS, random = Math.random, board = DEFAULT_BOARD) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  // Narrow boards: at most half the width is gap, and the left and right gaps never overlap.
  s.gapWidth = Math.max(2, Math.min(Math.floor(board.cols / 2), Math.round(s.gapWidth)));
  s.sideJitter = Math.min(s.sideJitter, Math.max(0, Math.floor((board.cols - 2 * s.gapWidth) / 2)));
  s.minRowSeconds = Math.min(s.minRowSeconds, s.rowSeconds); // custom mode can set these in any order
  return {
    settings: s,
    board,
    random,
    bars: [],
    score: 0,
    speedLevel: 0,
    rowSeconds: s.rowSeconds,
    ticksSinceSpawn: Infinity,
    lastGapStart: null,
    lastSide: null,
  };
}

function nextGapStart(game) {
  const { gapWidth, sideJitter } = game.settings;
  const maxStart = game.board.cols - gapWidth;
  const rand = (n) => Math.floor(game.random() * n);
  const side = game.lastSide === null ? (rand(2) ? 'right' : 'left') : game.lastSide === 'left' ? 'right' : 'left';
  game.lastSide = side;
  const offset = rand(Math.min(sideJitter, maxStart) + 1);
  return side === 'left' ? offset : maxStart - offset;
}

// Advance one row. Returns { cleared } with the number of bars that left the board.
export function tick(game) {
  for (const bar of game.bars) bar.row += 1;
  const before = game.bars.length;
  game.bars = game.bars.filter((bar) => bar.row < game.board.rows);
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
export function barPositions(bar, settings, board) {
  const gapEnd = bar.gapStart + settings.gapWidth - 1;
  const yTop = board.rowToY(bar.row);
  const yBottom = board.rowToY(bar.row + barThickness(settings) - 1);
  // Screw-ons half a column outside the gap edge count as part of the gap.
  const gapLeftX = board.colToX(bar.gapStart) - 8;
  const gapRightX = board.colToX(gapEnd) + 8;
  return board.holes.filter((h) => h.y <= yTop && h.y >= yBottom && !(h.x > gapLeftX && h.x < gapRightX)).map(
    (h) => h.position,
  );
}

// Full frame to send to the board: Map(position -> [r, g, b]).
export function renderFrame(game, color = BAR_COLOR) {
  const frame = new Map();
  for (const bar of game.bars) {
    for (const pos of barPositions(bar, game.settings, game.board)) frame.set(pos, color);
  }
  return frame;
}
