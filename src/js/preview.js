// On-screen mirror of the board: one SVG circle per LED.

import { HOLES } from './layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 144;
const HEIGHT = 160;

export function createPreview(container) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Board preview');

  // Kickboard sits below y = 12 on the 12x12 Original.
  const kick = document.createElementNS(SVG_NS, 'rect');
  kick.setAttribute('x', 0);
  kick.setAttribute('y', HEIGHT - 12);
  kick.setAttribute('width', WIDTH);
  kick.setAttribute('height', 12);
  kick.setAttribute('class', 'kickboard');
  svg.appendChild(kick);

  const dots = new Map();
  for (const hole of HOLES) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', hole.x);
    dot.setAttribute('cy', HEIGHT - hole.y);
    dot.setAttribute('r', hole.boltOn ? 2.8 : 1.9);
    dot.setAttribute('class', 'hole');
    svg.appendChild(dot);
    dots.set(hole.position, dot);
  }
  container.appendChild(svg);

  let lit = new Set();
  return function show(frame) {
    for (const pos of lit) {
      if (frame.has(pos)) continue;
      const dot = dots.get(pos);
      dot.style.fill = '';
      dot.classList.remove('lit');
    }
    for (const [pos, [r, g, b]] of frame) {
      const dot = dots.get(pos);
      if (!dot) continue;
      dot.style.fill = `rgb(${r},${g},${b})`;
      dot.style.color = `rgb(${r},${g},${b})`;
      dot.classList.add('lit');
    }
    lit = new Set(frame.keys());
  };
}
