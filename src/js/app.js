// UI wiring: connection panel, game + difficulty pickers, run timeline (get ready -> 3-2-1-GO -> play -> score), options.

import { KilterConnection, isBluetoothSupported } from './ble.js';
import { createGame, tick, renderFrame, DEFAULT_SETTINGS, DIFFICULTIES } from './game.js';
import { createReach, advanceReach, renderReach, REACH_DIFFICULTIES } from './reach.js';
import { bitmapPositions } from './layout.js';
import { BIG, numberBitmap } from './font.js';
import { createPreview } from './preview.js';

const YELLOW = [255, 255, 0];
const GREEN = [0, 255, 0];
const PURPLE = [160, 0, 255];

const $ = (id) => document.getElementById(id);
const showOnPreview = createPreview($('preview'));

// ---------- persistence (best effort; private mode may block storage) ----------

const STORE_KEY = 'gapdrop.settings.v6';
const BEST_KEY = 'gapdrop.bests'; // { [difficulty]: score } for Gap Drop, { ['reach.' + difficulty]: score } for Reach
const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

// ---------- games ----------

const REACH_STEP_SECONDS = 0.1;

// Each game: difficulty presets, how one step plays out, what the board shows, and the middle stat.
const GAMES = {
  drop: {
    label: 'Gap Drop',
    presets: DIFFICULTIES,
    create: createGame,
    step(g) {
      const { cleared } = tick(g);
      return { scored: cleared > 0, delayMs: g.rowSeconds * 1000 };
    },
    render: (g) => renderFrame(g),
    message: () => 'Climb!',
    statLabel: 'Speed',
    stat: (g) => (g?.speedLevel ?? 0) + 1,
  },
  reach: {
    label: 'Reach',
    presets: REACH_DIFFICULTIES,
    create: createReach,
    step(g) {
      const { scored } = advanceReach(g, REACH_STEP_SECONDS);
      return { scored, delayMs: REACH_STEP_SECONDS * 1000 };
    },
    render: (g) => renderReach(g),
    message: (g) => g.timeLeft.toFixed(1),
    statLabel: 'Time',
    stat: (g, preset) => `${(g?.timeLimit ?? preset.timeLimit).toFixed(1)}s`,
  },
};

const UI_DEFAULTS = {
  gameType: 'drop',
  difficulty: 'intermediate',
  sounds: true,
  showAllDevices: false,
  apiLevel: 'auto',
};
const settings = { ...UI_DEFAULTS, ...load(STORE_KEY, {}) };
if (!GAMES[settings.gameType]) settings.gameType = UI_DEFAULTS.gameType;
if (!DIFFICULTIES[settings.difficulty]) settings.difficulty = UI_DEFAULTS.difficulty;
const currentGame = () => GAMES[settings.gameType];
const currentPreset = () => currentGame().presets[settings.difficulty].settings;
const bests = load(BEST_KEY, {}) || {};
const bestKey = () => (settings.gameType === 'drop' ? settings.difficulty : `${settings.gameType}.${settings.difficulty}`);
const bestScore = () => Number(bests[bestKey()]) || 0;

// ---------- board output ----------

const connection = new KilterConnection({ onStatus: renderStatus });
const applyApiLevel = () => {
  connection.apiOverride = settings.apiLevel === 'auto' ? null : Number(settings.apiLevel);
};
applyApiLevel();

function display(frame) {
  showOnPreview(frame);
  connection.send(frame);
}

const solid = (positions, color) => new Map(positions.map((p) => [p, color]));
const frameKey = (frame) => [...frame].map(([p, c]) => `${p}:${c}`).join('|');

// ---------- sound ----------

let audio = null;
function unlockAudio() {
  if (!settings.sounds) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch {
    audio = null;
  }
}

function beep(freq = 660, ms = 150) {
  if (!settings.sounds || !audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.25, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + ms / 1000);
}

// ---------- keep the phone awake while it's lying on the floor ----------

let wakeLock = null;
async function holdWake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null;
  }
}
function releaseWake() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && phase !== 'idle' && phase !== 'over') holdWake();
});

// ---------- run timeline ----------

let phase = 'idle'; // idle | getready | countdown | playing | over
let runId = 0;
let game = null;
let runGame = null; // the GAMES entry for the run in progress

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setMessage = (text) => ($('message').textContent = text);

async function startRun() {
  const id = ++runId;
  const alive = () => id === runId;
  unlockAudio();
  holdWake();
  runGame = currentGame();
  game = runGame.create(currentPreset());
  updateScore();
  display(new Map());

  setPhase('getready');
  for (let t = DEFAULT_SETTINGS.getReadySeconds; t > 0; t--) {
    setMessage(`Get set · ${t}`);
    await sleep(1000);
    if (!alive()) return;
  }

  setPhase('countdown');
  for (const n of [3, 2, 1]) {
    setMessage(String(n));
    display(solid(bitmapPositions(BIG[n]), YELLOW));
    beep(660);
    await sleep(1000);
    if (!alive()) return;
  }
  setMessage('GO!');
  display(solid(bitmapPositions(BIG.GO), GREEN));
  beep(990, 300);
  await sleep(900);
  if (!alive()) return;

  setPhase('playing');
  display(new Map());
  let shown = '';
  while (alive()) {
    const { scored, delayMs } = runGame.step(game);
    if (scored) {
      beep(880, 90);
      updateScore();
    }
    // Only send when the lights change: Reach steps often but its cluster rarely changes.
    const frame = runGame.render(game);
    const key = frameKey(frame);
    if (key !== shown) {
      display(frame);
      shown = key;
    }
    setMessage(runGame.message(game));
    await sleep(delayMs);
  }
}

async function endRun() {
  if (phase === 'getready' || phase === 'countdown') return cancelRun();
  const id = ++runId;
  setPhase('over');
  releaseWake();
  const score = game?.score ?? 0;
  if (score > bestScore()) {
    bests[bestKey()] = score;
    save(BEST_KEY, bests);
  }
  updateScore();
  setMessage('Out');
  beep(220, 500);
  // Blink the lights where they stopped, then show the score.
  for (let i = 0; i < 2 && game; i++) {
    display(new Map());
    await sleep(300);
    if (id !== runId) return;
    display(runGame.render(game));
    await sleep(450);
    if (id !== runId) return;
  }
  display(solid(bitmapPositions(numberBitmap(score)), PURPLE));
}

function cancelRun() {
  runId++;
  releaseWake();
  setPhase('idle');
  setMessage('Ready');
  display(new Map());
}

function setPhase(next) {
  phase = next;
  const btn = $('btn-main');
  const running = next === 'getready' || next === 'countdown' || next === 'playing';
  btn.textContent = next === 'playing' ? "I'm out" : running ? 'Cancel' : next === 'over' ? 'Play again' : 'Start';
  btn.classList.toggle('stop', running);
  for (const b of $('modes').children) b.disabled = running;
  $('game-type').disabled = running;
}

function updateScore() {
  $('score').textContent = runGame === currentGame() ? (game?.score ?? 0) : 0;
  const g = runGame === currentGame() ? game : null;
  $('stat-label').textContent = currentGame().statLabel;
  $('stat').textContent = currentGame().stat(g, currentPreset());
  $('best').textContent = bestScore();
}

function mainAction() {
  if (phase === 'idle' || phase === 'over') startRun();
  else endRun();
}

$('btn-main').addEventListener('click', mainAction);
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.target.closest?.('input, select, button, summary')) return;
  e.preventDefault();
  mainAction();
});

// ---------- connection panel ----------

function renderStatus(status, detail = '') {
  const known = !!connection.device;
  $('status-dot').className = `dot ${status}`;
  $('status-text').textContent =
    status === 'connected'
      ? connection.device?.name || 'Board'
      : status === 'connecting'
        ? 'Connecting'
        : 'Offline';
  const showDetail = status === 'disconnected' || detail.startsWith('Send failed');
  $('status-detail').textContent = showDetail ? detail : '';
  $('btn-connect').textContent = known ? 'Switch' : 'Connect';
  $('btn-connect').classList.toggle('primary', !known);
  $('btn-reconnect').hidden = !known || status !== 'disconnected';
  $('btn-disconnect').hidden = status !== 'connected';
  $('btn-clear').hidden = status !== 'connected';
  for (const id of ['btn-connect', 'btn-reconnect']) $(id).disabled = status === 'connecting';
}

async function guarded(action) {
  try {
    await action();
  } catch (err) {
    // User closing the device picker isn't an error worth shouting about.
    const msg = err?.name === 'NotFoundError' ? 'No board selected.' : err?.message || String(err);
    $('status-detail').textContent = msg;
  }
}

$('btn-connect').addEventListener('click', () =>
  guarded(() => connection.connect({ showAllDevices: settings.showAllDevices })),
);
$('btn-reconnect').addEventListener('click', () => guarded(() => connection.reconnect()));
$('btn-disconnect').addEventListener('click', () => guarded(() => connection.disconnect()));
$('btn-clear').addEventListener('click', () => display(new Map()));

if (!isBluetoothSupported()) {
  $('unsupported').hidden = false;
  $('btn-connect').disabled = true;
}

// ---------- game + difficulty pickers ----------

function renderModes() {
  for (const b of $('modes').children) b.setAttribute('aria-checked', String(b.dataset.mode === settings.difficulty));
  $('game-type').value = settings.gameType;
  for (const list of document.querySelectorAll('[data-rules]')) list.hidden = list.dataset.rules !== settings.gameType;
}

// After a finished run, switching game or mode goes back to a clean Ready screen.
function pickerChanged() {
  save(STORE_KEY, settings);
  if (phase === 'over') {
    game = null;
    setPhase('idle');
    setMessage('Ready');
    display(new Map());
  }
  renderModes();
  updateScore();
}

for (const [key, g] of Object.entries(GAMES)) $('game-type').add(new Option(g.label, key));
$('game-type').addEventListener('change', () => {
  settings.gameType = $('game-type').value;
  pickerChanged();
});

for (const [key, mode] of Object.entries(DIFFICULTIES)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.dataset.mode = key;
  b.textContent = mode.label;
  b.addEventListener('click', () => {
    settings.difficulty = key;
    pickerChanged();
  });
  $('modes').appendChild(b);
}

// ---------- options ----------

for (const input of $('settings').querySelectorAll('input, select')) {
  const key = input.name;
  if (input.type === 'checkbox') input.checked = !!settings[key];
  else input.value = settings[key];

  input.addEventListener('input', () => {
    settings[key] = input.type === 'checkbox' ? input.checked : input.value;
    if (key === 'apiLevel') {
      applyApiLevel();
      renderStatus(connection.status);
    }
    save(STORE_KEY, settings);
  });
}

renderModes();
setPhase('idle');
updateScore();
renderStatus('disconnected');
display(new Map());
