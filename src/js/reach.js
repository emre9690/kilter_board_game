// Reach game state. Pure logic: no timers, DOM or Bluetooth here.
//
// A cluster of holds lights up somewhere on the wall. Get on it before the timer runs out:
// when time is up the cluster jumps to a new spot far away and you score a point.
// The cluster goes green -> yellow -> red as time runs low. Honor system: not on it in time = out.

import { COLS, ROWS, HOLES, colToX, rowToY } from './layout.js';

export const REACH_DEFAULTS = {
  timeLimit: 6, // seconds for the first cluster
  minTimeLimit: 3.5,
  shrinkEvery: 3, // clusters reached between time cuts
  shrinkBy: 0.5, // seconds cut each time
  clusterSize: 3, // bolt-on holds per side of the square cluster
  minDistance: 7, // min grid distance between consecutive clusters
  bottomMargin: 3, // keep clusters this many rows above the bottom so they're hand targets
};

export const REACH_DIFFICULTIES = {
  beginner: { label: 'Beginner', settings: { timeLimit: 8, minTimeLimit: 5, shrinkEvery: 4, clusterSize: 3, minDistance: 6 } },
  intermediate: { label: 'Intermediate', settings: { timeLimit: 6, minTimeLimit: 3.5, shrinkEvery: 3, clusterSize: 3, minDistance: 7 } },
  hard: { label: 'Hard', settings: { timeLimit: 4.5, minTimeLimit: 2.5, shrinkEvery: 3, clusterSize: 2, minDistance: 8 } },
  impossible: { label: 'Impossible', settings: { timeLimit: 3, minTimeLimit: 1.8, shrinkEvery: 2, clusterSize: 2, minDistance: 9 } },
};

const GREEN = [0, 255, 0];
const YELLOW = [255, 255, 0];
const RED = [255, 0, 0];

export function createReach(settings = REACH_DEFAULTS, random = Math.random) {
  const s = { ...REACH_DEFAULTS, ...settings };
  const game = { settings: s, random, score: 0, timeLimit: s.timeLimit, timeLeft: s.timeLimit, target: null };
  game.target = nextTarget(game);
  return game;
}

const center = ({ col, row }, size) => [col + (size - 1) / 2, row + (size - 1) / 2];

// Random top-left corner for the next cluster, far from the current one.
function nextTarget(game) {
  const { clusterSize: size, minDistance, bottomMargin } = game.settings;
  const maxCol = COLS - size;
  const maxRow = ROWS - size - bottomMargin;
  const pick = () => ({
    col: Math.floor(game.random() * (maxCol + 1)),
    row: Math.floor(game.random() * (maxRow + 1)),
  });
  if (!game.target) return pick();

  const [cx, cy] = center(game.target, size);
  const dist = (t) => {
    const [x, y] = center(t, size);
    return Math.hypot(x - cx, y - cy);
  };
  let best = pick();
  for (let i = 0; i < 50 && dist(best) < minDistance; i++) {
    const candidate = pick();
    if (dist(candidate) > dist(best)) best = candidate;
  }
  return best;
}

// Advance time by dt seconds. Returns { scored } when the cluster moved on.
export function advanceReach(game, dt) {
  game.timeLeft -= dt;
  if (game.timeLeft > 1e-9) return { scored: false };

  game.score += 1;
  const { shrinkEvery, shrinkBy, minTimeLimit } = game.settings;
  if (shrinkEvery > 0 && game.score % shrinkEvery === 0) {
    game.timeLimit = Math.max(minTimeLimit, game.timeLimit - shrinkBy);
  }
  game.timeLeft = game.timeLimit;
  game.target = nextTarget(game);
  return { scored: true };
}

export function reachColor(game) {
  const fraction = game.timeLeft / game.timeLimit;
  if (fraction > 0.5) return GREEN;
  if (fraction > 0.25) return YELLOW;
  return RED;
}

// Every hole (bolt-ons and the screw-ons between them) inside the cluster's square.
export function clusterPositions(target, size) {
  const xMin = colToX(target.col);
  const xMax = colToX(target.col + size - 1);
  const yMax = rowToY(target.row);
  const yMin = rowToY(target.row + size - 1);
  return HOLES.filter((h) => h.x >= xMin && h.x <= xMax && h.y >= yMin && h.y <= yMax).map((h) => h.position);
}

export function renderReach(game, color = reachColor(game)) {
  return new Map(clusterPositions(game.target, game.settings.clusterSize).map((p) => [p, color]));
}
