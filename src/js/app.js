// UI wiring: connection panel, run timeline (get ready -> 3-2-1-GO -> play -> score), settings.

import { KilterConnection, isBluetoothSupported } from './ble.js';
import { createGame, tick, renderFrame, DEFAULT_SETTINGS } from './game.js';
import { bitmapPositions } from './layout.js';
import { BIG, numberBitmap } from './font.js';
import { createPreview } from './preview.js';

const YELLOW = [255, 255, 0];
const GREEN = [0, 255, 0];
const PURPLE = [160, 0, 255];

const $ = (id) => document.getElementById(id);
const showOnPreview = createPreview($('preview'));

// ---------- persistence (best effort; private mode may block storage) ----------

const STORE_KEY = 'gapdrop.settings.v5';
const BEST_KEY = 'gapdrop.best';
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

const UI_DEFAULTS = {
  gapWidth: DEFAULT_SETTINGS.gapWidth,
  rowSeconds: DEFAULT_SETTINGS.rowSeconds,
  barSpacing: DEFAULT_SETTINGS.barSpacing,
  maxGapShift: DEFAULT_SETTINGS.maxGapShift,
  getReadySeconds: DEFAULT_SETTINGS.getReadySeconds,
  speedUp: true,
  thickBars: DEFAULT_SETTINGS.thickBars,
  sounds: true,
  showAllDevices: false,
  apiLevel: 'auto',
};
const settings = { ...UI_DEFAULTS, ...load(STORE_KEY, {}) };
let best = Number(load(BEST_KEY, 0)) || 0;

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setMessage = (text) => ($('message').textContent = text);

function gameSettings() {
  return {
    gapWidth: settings.gapWidth,
    rowSeconds: settings.rowSeconds,
    barSpacing: settings.barSpacing,
    maxGapShift: settings.maxGapShift,
    thickBars: settings.thickBars,
    speedUpEvery: settings.speedUp ? DEFAULT_SETTINGS.speedUpEvery : 0,
  };
}

async function startRun() {
  const id = ++runId;
  const alive = () => id === runId;
  unlockAudio();
  holdWake();
  game = createGame(gameSettings());
  updateScore();
  display(new Map());

  setPhase('getready');
  for (let t = settings.getReadySeconds; t > 0; t--) {
    setMessage(`Get on the wall… ${t}`);
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
  setMessage('Climb!');
  display(new Map());
  while (alive()) {
    const { cleared } = tick(game);
    if (cleared) {
      beep(880, 90);
      updateScore();
    }
    display(renderFrame(game));
    await sleep(game.rowSeconds * 1000);
  }
}

async function endRun() {
  if (phase === 'getready' || phase === 'countdown') return cancelRun();
  const id = ++runId;
  setPhase('over');
  releaseWake();
  const score = game?.score ?? 0;
  if (score > best) {
    best = score;
    save(BEST_KEY, best);
  }
  updateScore();
  setMessage(`Score: ${score}`);
  beep(220, 500);
  // Blink the bars where they stopped, then show the score.
  for (let i = 0; i < 2 && game; i++) {
    display(new Map());
    await sleep(300);
    if (id !== runId) return;
    display(renderFrame(game));
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
}

function updateScore() {
  $('score').textContent = game?.score ?? 0;
  $('speed').textContent = (game?.speedLevel ?? 0) + 1;
  $('best').textContent = best;
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
      ? `Connected to ${connection.device?.name || 'board'} (API v${connection.apiLevel})`
      : status === 'connecting'
        ? 'Connecting…'
        : 'Not connected';
  const showDetail = status === 'disconnected' || detail.startsWith('Send failed');
  $('status-detail').textContent = showDetail ? detail : '';
  $('btn-connect').textContent = known ? 'Pick a different board' : 'Connect board';
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

// ---------- settings form ----------

const FORMAT = {
  gapWidth: (v) => `${v} holds`,
  rowSeconds: (v) => `${Number(v).toFixed(1)} s per row`,
  barSpacing: (v) => `${v} rows`,
  maxGapShift: (v) => `${Math.max(v, settings.gapWidth)} holds`,
  getReadySeconds: (v) => (Number(v) === 0 ? 'none' : `${v} s`),
};

const form = $('settings');
for (const input of form.querySelectorAll('input, select')) {
  const key = input.name;
  if (input.type === 'checkbox') input.checked = !!settings[key];
  else input.value = settings[key];
  const out = $(`out-${key}`);
  if (out) out.textContent = FORMAT[key](input.value);

  input.addEventListener('input', () => {
    if (input.type === 'checkbox') settings[key] = input.checked;
    else if (input.type === 'range') settings[key] = Number(input.value);
    else settings[key] = input.value;
    if (out) out.textContent = FORMAT[key](input.value);
    if (key === 'gapWidth') $('out-maxGapShift').textContent = FORMAT.maxGapShift(settings.maxGapShift);
    if (key === 'apiLevel') {
      applyApiLevel();
      renderStatus(connection.status);
    }
    save(STORE_KEY, settings);
  });
}

setPhase('idle');
updateScore();
renderStatus('disconnected');
display(new Map());
