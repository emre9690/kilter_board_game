// Custom mode: which settings each game exposes as sliders, and the Customize panel that edits them.

const never = (v) => (Number(v) === 0 ? 'never' : null);

// max may depend on the board (e.g. a gap can be at most half the board wide).
// toUi/fromUi convert between the stored value and what the slider shows.
// atMost: this value can't exceed another field's (e.g. the fastest speed can't be slower than the start).
export const CUSTOM_FIELDS = {
  drop: [
    { key: 'gapWidth', label: 'Gap width', min: 2, max: (board) => Math.floor(board.cols / 2), step: 1, unit: 'holds' },
    { key: 'rowSeconds', label: 'Start speed', min: 0.3, max: 3, step: 0.05, unit: 's/row' },
    { key: 'minRowSeconds', label: 'Fastest speed', min: 0.3, max: 3, step: 0.05, unit: 's/row', atMost: 'rowSeconds' },
    { key: 'barSpacing', label: 'Rows between bars', min: 4, max: 22, step: 1, unit: 'rows' },
    { key: 'sideJitter', label: 'Gap in from edge', min: 0, max: 4, step: 1, unit: 'holds' },
    { key: 'speedUpEvery', label: 'Speed up every', min: 0, max: 10, step: 1, unit: 'bars', special: never },
    {
      key: 'speedUpFactor',
      label: 'Speed-up amount',
      min: 2,
      max: 25,
      step: 1,
      unit: '%',
      toUi: (f) => Math.round((1 - f) * 100),
      fromUi: (v) => 1 - v / 100,
    },
    { key: 'getReadySeconds', label: 'Get-ready time', min: 0, max: 15, step: 1, unit: 's' },
    { key: 'thickBars', label: 'Thick bars', type: 'toggle' },
  ],
  reach: [
    { key: 'timeLimit', label: 'Time per cluster', min: 2, max: 20, step: 0.5, unit: 's' },
    { key: 'minTimeLimit', label: 'Shortest time', min: 1, max: 20, step: 0.5, unit: 's', atMost: 'timeLimit' },
    { key: 'shrinkEvery', label: 'Cut time every', min: 0, max: 10, step: 1, unit: 'clusters', special: never },
    { key: 'shrinkBy', label: 'Cut by', min: 0.1, max: 2, step: 0.1, unit: 's' },
    { key: 'clusterSize', label: 'Cluster size', min: 1, max: 4, step: 1, format: (v) => `${v}×${v}` },
    { key: 'minDistance', label: 'Min jump', min: 3, max: 12, step: 1, unit: 'holds' },
    { key: 'getReadySeconds', label: 'Get-ready time', min: 0, max: 15, step: 1, unit: 's' },
  ],
};

function formatValue(field, uiValue) {
  if (field.format) return field.format(uiValue);
  const special = field.special?.(uiValue);
  if (special) return special;
  const decimals = field.step >= 1 ? 0 : field.step < 0.1 ? 2 : 1;
  const text = Number(uiValue).toFixed(decimals);
  // "1 hold", not "1 holds"; units like "s" or "s/row" stay as they are.
  const unit = Number(uiValue) === 1 && /^[a-z]{2,}s$/.test(field.unit) ? field.unit.slice(0, -1) : field.unit;
  return `${text} ${unit}`;
}

// Draws one slider (or checkbox) per field into `container`, filled from `values`.
// onChange(key, storedValue) fires on every edit.
export function renderCustomPanel(container, fields, values, board, onChange) {
  container.replaceChildren();
  const sliders = new Map(); // key -> (stored value) => void, to move a linked slider
  const update = (key, value) => {
    onChange(key, value);
    // Keep "at most" pairs consistent in both directions.
    for (const f of fields) {
      if (f.atMost === key && values[f.key] > value) sliders.get(f.key)?.(value);
      if (f.key === key && f.atMost && values[f.atMost] < value) sliders.get(f.atMost)?.(value);
    }
  };
  for (const field of fields) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.name = field.key;

    if (field.type === 'toggle') {
      label.className = 'check';
      input.type = 'checkbox';
      input.checked = !!values[field.key];
      input.addEventListener('input', () => update(field.key, input.checked));
      label.append(input, ` ${field.label}`);
      container.appendChild(label);
      continue;
    }

    const max = typeof field.max === 'function' ? field.max(board) : field.max;
    const stored = values[field.key];
    const ui = Math.min(max, Math.max(field.min, field.toUi ? field.toUi(stored) : stored));
    Object.assign(input, { type: 'range', min: field.min, max, step: field.step, value: ui });
    const out = document.createElement('output');
    out.textContent = formatValue(field, input.value);
    input.addEventListener('input', () => {
      out.textContent = formatValue(field, input.value);
      const v = Number(input.value);
      update(field.key, field.fromUi ? field.fromUi(v) : v);
    });
    sliders.set(field.key, (value) => {
      input.value = field.toUi ? field.toUi(value) : value;
      out.textContent = formatValue(field, input.value);
      onChange(field.key, value);
    });
    label.append(`${field.label} `, out, input);
    container.appendChild(label);
  }
}
