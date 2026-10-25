// Anonymous usage counts, so we can show the games are really being played.
// Visits: Vercel Web Analytics (enable it in the Vercel dashboard; the script only exists on Vercel).
// Game events: GoatCounter (set GOATCOUNTER_CODE to your site code; empty = events off).
// Neither uses cookies or collects personal data. Nothing is sent when running on localhost.

const GOATCOUNTER_CODE = ''; // e.g. 'kiltergames' for https://kiltergames.goatcounter.com

const isLocal = () => ['localhost', '127.0.0.1', ''].includes(location.hostname);

function addScript(src, attrs = {}) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.head.appendChild(s);
}

export function initAnalytics() {
  if (isLocal()) return;
  addScript('/_vercel/insights/script.js'); // 404s harmlessly when not hosted on Vercel
  if (GOATCOUNTER_CODE) {
    addScript('https://gc.zgo.at/count.js', { 'data-goatcounter': `https://${GOATCOUNTER_CODE}.goatcounter.com/count` });
  }
}

// Score buckets keep the event list short and readable in the dashboard.
export const scoreBucket = (score) => (score === 0 ? '0' : score < 5 ? '1-4' : score < 10 ? '5-9' : score < 20 ? '10-19' : '20+');

// Records one event, e.g. track('run-start', ['reach', 'hard', 'board-10']) -> "run-start/reach/hard/board-10".
export function track(name, parts = []) {
  if (isLocal()) return;
  const path = [name, ...parts].join('/');
  try {
    window.goatcounter?.count?.({ path, title: path, event: true });
  } catch {
    // Analytics must never break the game.
  }
}
