// UI wiring: connection panel, difficulty modes, run timeline (get ready -> 3-2-1-GO -> play -> score), options.

import { KilterConnection, isBluetoothSupported } from './ble.js';
import { createGame, tick, renderFrame, DEFAULT_SETTINGS, DIFFICULTIES } from './game.js';
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
const BEST_KEY = 'gapdrop.bests'; // { [difficulty]: score }
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
  difficulty: 'intermediate',
  sounds: true,
  showAllDevices: false,
  apiLevel: 'auto',
};
const settings = { ...UI_DEFAULTS, ...load(STORE_KEY, {}) };
if (!DIFFICULTIES[settings.difficulty]) settings.difficulty = UI_DEFAULTS.difficulty;
const bests = load(BEST_KEY, {}) || {};
const bestScore = () => Number(bests[settings.difficulty]) || 0;

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


async function startRun() {
  const id = ++runId;
  const alive = () => id === runId;
  unlockAudio();
  holdWake();
  game = createGame(DIFFICULTIES[settings.difficulty].settings);
  updateScore();
  display(new Map());

  setPhase('getready');
  for (let t = DEFAULT_SETTINGS.getReadySeconds; t > 0; t--) {
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
  if (score > bestScore()) {
    bests[settings.difficulty] = score;
    save(BEST_KEY, bests);
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
  for (const b of $('modes').children) b.disabled = running;
}

function updateScore() {
  $('score').textContent = game?.score ?? 0;
  $('speed').textContent = (game?.speedLevel ?? 0) + 1;
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

// ---------- difficulty modes ----------

function describeMode(key) {
  const m = DIFFICULTIES[key].settings;
  return `${m.gapWidth}-hold gap · ${m.rowSeconds.toFixed(1)} s per row · speeds up every ${m.speedUpEvery} bars`;
}

function renderModes() {
  for (const b of $('modes').children) b.setAttribute('aria-checked', String(b.dataset.mode === settings.difficulty));
  $('mode-detail').textContent = describeMode(settings.difficulty);
}

for (const [key, mode] of Object.entries(DIFFICULTIES)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.dataset.mode = key;
  b.textContent = mode.label;
  b.addEventListener('click', () => {
    settings.difficulty = key;
    save(STORE_KEY, settings);
    if (phase === 'over') {
      game = null;
      setPhase('idle');
      setMessage('Ready');
      display(new Map());
    }
    renderModes();
    updateScore();
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
