// Turns a board's raw LED table into a game-friendly grid.
//
// Every Kilter board is a staggered lattice with 8-unit spacing: a main grid of holds
// (Original: the big bolt-ons) plus a second set offset half a step in x and y
// (Original: the screw-on footholds, incl. the kickboard). The main grid becomes the game grid;
// grid rows count from the top (row 0) because things fall downwards.

import { BOARDS } from './boards-data.js';

export const STEP = 8;
export const DEFAULT_BOARD_ID = 10; // Original 12x12 with kickboard

const mod = (v) => ((v % STEP) + STEP) % STEP;
const mostCommon = (values) => {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
};

export function createBoard({ id, family, name, kickboardTop, leds }) {
  const holes = leds.map(([position, x, y]) => ({ position, x, y }));

  // Main grid: holds on x = 0 mod 8 unless the board barely has any (e.g. an Auxiliary-only LED kit).
  const onZero = holes.filter((h) => mod(h.x) === 0).length;
  const mainXMod = onZero * 2 >= holes.length - onZero ? 0 : STEP / 2;
  const mainYMod = mostCommon(holes.filter((h) => mod(h.x) === mainXMod).map((h) => mod(h.y)));
  for (const h of holes) h.main = mod(h.x) === mainXMod && mod(h.y) === mainYMod;

  const main = holes.filter((h) => h.main);
  const leftX = Math.min(...main.map((h) => h.x));
  const topY = Math.max(...main.map((h) => h.y));
  const cols = (Math.max(...main.map((h) => h.x)) - leftX) / STEP + 1;
  const rows = (topY - Math.min(...main.map((h) => h.y))) / STEP + 1;
  const byXY = new Map(holes.map((h) => [`${h.x},${h.y}`, h]));

  const colToX = (col) => leftX + col * STEP;
  const rowToY = (row) => topY - row * STEP;

  // LED position of the main-grid hold at (col, row), or undefined if there isn't one.
  function gridPosition(col, row) {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return undefined;
    const hole = byXY.get(`${colToX(col)},${rowToY(row)}`);
    return hole?.main ? hole.position : undefined;
  }

  // Light a bitmap (array of strings, '#' = on) onto the main grid, centred by default.
  function bitmapPositions(bitmap, { col, row } = {}) {
    const width = Math.max(...bitmap.map((line) => line.length));
    const left = col ?? Math.floor((cols - width) / 2);
    const top = row ?? Math.floor((rows - bitmap.length) / 2);
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

  const xs = holes.map((h) => h.x);
  const ys = holes.map((h) => h.y);
  return {
    id,
    family,
    name,
    kickboardTop,
    holes,
    cols,
    rows,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    colToX,
    rowToY,
    gridPosition,
    bitmapPositions,
  };
}

export const BOARD_LIST = BOARDS.map(({ id, family, name }) => ({ id, family, name }));

const cache = new Map();
export function getBoard(id) {
  const def = BOARDS.find((b) => b.id === Number(id)) ?? BOARDS.find((b) => b.id === DEFAULT_BOARD_ID);
  if (!cache.has(def.id)) cache.set(def.id, createBoard(def));
  return cache.get(def.id);
}

export const DEFAULT_BOARD = getBoard(DEFAULT_BOARD_ID);
