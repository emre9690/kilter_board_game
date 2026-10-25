// Turns the raw LED table into a game-friendly grid.
//
// Kilter Original 12x12 w/ kickboard:
//   bolt-on grid: 17 columns (x = 8..136 step 8) x 19 rows (y = 8..152 step 8)
//   screw-ons sit in between at x = 4 mod 8, y = 4 mod 8 (incl. the kickboard row y = 4)
// Grid rows count from the top (row 0 = y 152) because things fall downwards.

import { LEDS } from './board-data.js';

export const COLS = 17;
export const ROWS = 19;
const STEP = 8;
const TOP_Y = 152;
const LEFT_X = 8;

export const HOLES = LEDS.map(([position, x, y]) => ({
  position,
  x,
  y,
  boltOn: x % STEP === 0 && y % STEP === 0,
}));

const byXY = new Map(HOLES.map((h) => [`${h.x},${h.y}`, h]));

export const colToX = (col) => LEFT_X + col * STEP;
export const rowToY = (row) => TOP_Y - row * STEP;

// LED position of the bolt-on hold at (col, row), or undefined if off the board.
export function gridPosition(col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return undefined;
  return byXY.get(`${colToX(col)},${rowToY(row)}`)?.position;
}

// Holes within dy (board units) of a grid row, e.g. dy = 4 picks up adjacent screw-on rows.
export function holesNearRow(row, dy = 0) {
  const y = rowToY(row);
  return HOLES.filter((h) => Math.abs(h.y - y) <= dy);
}

// Light a bitmap (array of strings, '#' = on) onto the bolt-on grid, centred by default.
export function bitmapPositions(bitmap, { col, row } = {}) {
  const height = bitmap.length;
  const width = Math.max(...bitmap.map((line) => line.length));
  const left = col ?? Math.floor((COLS - width) / 2);
  const top = row ?? Math.floor((ROWS - height) / 2);
  const positions = [];
  bitmap.forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (ch !== '#') return;
      const pos = gridPosition(left + c, top + r);
      if (pos !== undefined) positions.push(pos);
    });
  });
  return positions;
}
