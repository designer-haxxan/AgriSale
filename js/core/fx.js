// Visual effects: animated crop-field scene, count-up numbers, category visuals.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent = null) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
};
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// One wheat/crop stalk with grain head and leaves, drawn pointing up from (0,0).
function stalk(parent, x, y, h, color, delay, scale = 1) {
  const pos = el('g', { transform: `translate(${x} ${y}) scale(${scale})` }, parent);
  const g = el('g', { class: 'stalk', style: `--d:${delay}s` }, pos);
  el('path', { d: `M0 0 C ${h * 0.04} ${-h * 0.4}, ${-h * 0.03} ${-h * 0.7}, 0 ${-h}`, stroke: color, 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round' }, g);
  for (let i = 0; i < 5; i++) {
    const ty = -h * (0.72 + i * 0.055);
    el('ellipse', { cx: 6, cy: ty, rx: 7, ry: 3.2, transform: `rotate(-38 6 ${ty})`, fill: '#e9b949' }, g);
    el('ellipse', { cx: -6, cy: ty - 4, rx: 7, ry: 3.2, transform: `rotate(38 -6 ${ty - 4})`, fill: '#f2c85b' }, g);
  }
  el('ellipse', { cx: 0, cy: -h - 8, rx: 3.6, ry: 8, fill: '#e9b949' }, g);
  el('path', { d: `M0 ${-h * 0.3} q 22 -10 30 -34`, stroke: color, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, g);
  el('path', { d: `M0 ${-h * 0.18} q -20 -10 -28 -30`, stroke: color, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, g);
  return g;
}

function cloud(parent, x, y, s, dur, delay) {
  const g = el('g', { class: 'drift', style: `--t:${dur}s;--d:${delay}s` }, parent);
  const c = el('g', { class: 'cloud', transform: `translate(${x} ${y}) scale(${s})` }, g);
  el('ellipse', { cx: 0, cy: 0, rx: 60, ry: 20, fill: '#fff' }, c);
  el('ellipse', { cx: -26, cy: -12, rx: 30, ry: 22, fill: '#fff' }, c);
  el('ellipse', { cx: 18, cy: -18, rx: 34, ry: 26, fill: '#fff' }, c);
}

// Builds the animated field into an <svg id=...> (viewBox 0 0 800 600, anchored to the bottom).
export function buildLoginScene(svg) {
  if (!svg || svg.dataset.built) return;
  svg.dataset.built = '1';
  svg.setAttribute('viewBox', '0 0 800 600');
  svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
  const defs = el('defs', {}, svg);
  const sun = el('radialGradient', { id: 'sg', cx: '50%', cy: '50%', r: '50%' }, defs);
  el('stop', { offset: '0', 'stop-color': '#fff6c4' }, sun); el('stop', { offset: '.45', 'stop-color': '#ffd54f' }, sun); el('stop', { offset: '1', 'stop-color': '#ffb300', 'stop-opacity': '0' }, sun);
  const h1 = el('linearGradient', { id: 'h1', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0', 'stop-color': '#a5d66f' }, h1); el('stop', { offset: '1', 'stop-color': '#6cb04a' }, h1);
  const h2 = el('linearGradient', { id: 'h2', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0', 'stop-color': '#7cc25a' }, h2); el('stop', { offset: '1', 'stop-color': '#3f8f3a' }, h2);
  const h3 = el('linearGradient', { id: 'h3', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0', 'stop-color': '#4caf50' }, h3); el('stop', { offset: '1', 'stop-color': '#256d2a' }, h3);

  el('circle', { class: 'sun', cx: 610, cy: 130, r: 120, fill: 'url(#sg)' }, svg);
  el('circle', { cx: 610, cy: 130, r: 44, fill: '#ffe082' }, svg);
  cloud(svg, 140, 120, 1, 60, -10); cloud(svg, 420, 70, 0.7, 80, -40); cloud(svg, 300, 190, 0.5, 100, -70);

  el('path', { d: 'M0 380 C 150 320, 300 350, 450 330 S 700 300, 800 340 V600 H0Z', fill: 'url(#h1)' }, svg);
  const back = el('g', {}, svg);
  for (let i = 0; i < 16; i++) stalk(back, 20 + i * 50 + (i % 2) * 12, 405 + (i % 3) * 6, 62, '#6c9a4a', (i * 0.37) % 3, 0.8);
  el('path', { d: 'M0 450 C 200 400, 380 430, 560 410 S 740 400, 800 420 V600 H0Z', fill: 'url(#h2)' }, svg);
  const mid = el('g', {}, svg);
  for (let i = 0; i < 13; i++) stalk(mid, 30 + i * 62 + (i % 2) * 18, 478 + (i % 3) * 8, 88, '#4f8c3a', (i * 0.53) % 4, 1);
  el('path', { d: 'M0 520 C 180 480, 420 520, 800 490 V600 H0Z', fill: 'url(#h3)' }, svg);
  const front = el('g', {}, svg);
  for (let i = 0; i < 9; i++) stalk(front, 10 + i * 94 + (i % 2) * 24, 590 + (i % 2) * 6, 135, '#2f7d32', (i * 0.7) % 4, 1.15);

  // drifting seeds / leaves
  const seeds = el('g', {}, svg);
  for (let i = 0; i < 9; i++) {
    const sx = 40 + Math.round(((i * 97) % 720)); const sy = 520 + (i % 3) * 20;
    const g = el('g', { transform: `translate(${sx} ${sy})` }, seeds);
    const f = el('g', { class: 'floaty', style: `--t:${8 + (i % 4) * 2}s;--d:${-i * 1.7}s;--x:${(i % 2 ? 1 : -1) * (30 + i * 9)}px;--r:${160 + i * 25}deg` }, g);
    if (i % 3 === 0) el('ellipse', { cx: 0, cy: 0, rx: 8, ry: 3.5, fill: '#fff176', transform: 'rotate(-30)' }, f);
    else if (i % 3 === 1) el('path', { d: 'M0 0 q 8 -12 18 -4 q -8 12 -18 4z', fill: '#c5e1a5' }, f);
    else el('circle', { r: 3.2, fill: '#fff59d' }, f);
  }
}

// Small animated field strip for the dashboard hero.
export function buildHeroField(svg) {
  if (!svg || svg.dataset.built) return;
  svg.dataset.built = '1';
  svg.setAttribute('viewBox', '0 0 400 56');
  svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
  el('path', { d: 'M0 40 C 90 28, 200 44, 400 30 V56 H0Z', fill: 'rgba(255,255,255,.14)' }, svg);
  const g = el('g', {}, svg);
  for (let i = 0; i < 14; i++) stalk(g, 14 + i * 29, 58, 34 + (i % 3) * 5, 'rgba(255,255,255,.55)', (i * 0.4) % 3, 0.55);
}

// Animates the first number inside each matching leaf element (keeps currency text and decimals).
export function countUp(root = document, selector = '.stat-value, .hero-sales', ms = 750) {
  if (reduced()) return;
  root.querySelectorAll(selector).forEach((node) => {
    if (node.children.length) return;
    const text = node.textContent;
    const m = text.match(/-?\d[\d,]*(\.\d+)?/);
    if (!m) return;
    const target = parseFloat(m[0].replace(/,/g, ''));
    if (!isFinite(target) || Math.abs(target) < 1) return;
    const dec = m[1] ? m[1].length - 1 : 0;
    const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const v = target * (1 - Math.pow(1 - t, 3));
      node.textContent = text.replace(m[0], fmt.format(v));
      if (t < 1) requestAnimationFrame(step); else node.textContent = text;
    };
    requestAnimationFrame(step);
  });
}

// Emoji + colour class for a product, from its category name (or product name).
const VIS = [
  [/pestic|insect|bug|mite|termite/i, '🐛', 'cv-pest'],
  [/herbi|weed/i, '🌿', 'cv-herb'],
  [/fungi/i, '🍄', 'cv-fung'],
  [/seed|beej/i, '🌱', 'cv-seed'],
  [/micro|nutri|trace|zinc|boron/i, '🧪', 'cv-micro'],
  [/growth|regulat|hormone/i, '🌼', 'cv-pgr'],
  [/fertili|urea|dap|npk|potash|nitro|phosph|compost|manure/i, '🌾', 'cv-fert'],
];
export function catVisual(categoryName = '', productName = '') {
  const hay = `${categoryName} ${productName}`;
  for (const [re, emoji, cls] of VIS) if (re.test(hay)) return { emoji, cls };
  return { emoji: '📦', cls: 'cv-other' };
}
