// On-screen mirror of the board: one SVG circle per LED, sized to fit the chosen board.

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAD = 6;

export function createPreview(container, board) {
  const { minX, maxX, minY, maxY } = board.bounds;
  const left = minX - PAD;
  const top = maxY + PAD; // board y points up, SVG y points down
  const width = maxX - minX + 2 * PAD;
  const height = maxY - minY + 2 * PAD;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${board.name} preview`);

  if (board.kickboardTop !== null) {
    const kick = document.createElementNS(SVG_NS, 'rect');
    kick.setAttribute('x', 0);
    kick.setAttribute('y', top - board.kickboardTop);
    kick.setAttribute('width', width);
    kick.setAttribute('height', height - (top - board.kickboardTop));
    kick.setAttribute('class', 'kickboard');
    svg.appendChild(kick);
  }

  const dots = new Map();
  for (const hole of board.holes) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', hole.x - left);
    dot.setAttribute('cy', top - hole.y);
    dot.setAttribute('r', hole.main ? 2.8 : 1.9);
    dot.setAttribute('class', 'hole');
    svg.appendChild(dot);
    dots.set(hole.position, dot);
  }
  container.replaceChildren(svg);

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
