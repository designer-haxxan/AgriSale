// Language layer: direction, RTL Bootstrap build, and an Urdu translator for text that is not routed through t().
// In Urdu mode every text node / placeholder / title in the page (including modals and toasts that appear later)
// is looked up in the dictionary in ur-dict.js. Switching language reloads the page, so originals are not tracked.
import { getSettings } from './settings.js';
import { UR, UR_PATTERNS } from './ur-dict.js';

export const isUrdu = () => (getSettings().language || 'en') === 'ur';

const ATTRS = ['placeholder', 'title', 'aria-label', 'data-title'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT', 'SVG']);
const HAS_LATIN = /[A-Za-z]/;

const lower = new Map();
for (const k of Object.keys(UR)) lower.set(k.toLowerCase(), UR[k]);

function lookup(s) {
  if (UR[s] !== undefined) return UR[s];
  const l = lower.get(s.toLowerCase());
  if (l !== undefined) return l;
  return null;
}

function translateCore(core) {
  let out = lookup(core);
  if (out !== null) return out;
  // Trailing punctuation / required marker variants of a known phrase.
  const m = core.match(/^(.*?)(\s*[:*…]+|\s*\.\.\.)$/);
  if (m && m[1]) { const base = lookup(m[1]); if (base !== null) return base + m[2].replace('...', '…'); }
  for (const [re, fn] of UR_PATTERNS) {
    const mm = core.match(re);
    if (mm) { const r = fn(...mm.slice(1).map((x) => lookup(x) ?? x)); if (r != null) return r; }
  }
  return null;
}

export function translate(raw) {
  const lead = raw.match(/^\s*/)[0];
  const trail = raw.match(/\s*$/)[0];
  const core = raw.trim().replace(/\s+/g, ' ');
  if (!core || !HAS_LATIN.test(core)) return null;
  let out = translateCore(core);
  // "A · B · C" lines: translate each part, keep names/numbers that have no entry.
  if (out === null && core.includes(' · ')) {
    let hit = false;
    const parts = core.split(' · ').map((seg) => { const r = translateCore(seg); if (r !== null) hit = true; return r ?? seg; });
    if (hit) out = parts.join(' · ');
  }
  return out === null ? null : lead + out + trail;
}

function walk(node) {
  if (node.nodeType === 3) {
    const v = node.nodeValue;
    if (!HAS_LATIN.test(v)) return;
    const t = translate(v);
    if (t !== null && t !== v) node.nodeValue = t;
    return;
  }
  if (node.nodeType !== 1) return;
  if (SKIP.has(node.nodeName.toUpperCase()) || node.hasAttribute('data-no-tr')) return;
  for (const a of ATTRS) {
    const v = node.getAttribute(a);
    if (v && HAS_LATIN.test(v)) { const t = translate(v); if (t !== null && t !== v) node.setAttribute(a, t); }
  }
  if (node.nodeName === 'INPUT' && /^(button|submit|reset)$/.test(node.type) && HAS_LATIN.test(node.value)) {
    const t = translate(node.value); if (t !== null) node.value = t;
  }
  for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
}

export function initLang() {
  const ur = isUrdu();
  const html = document.documentElement;
  html.lang = ur ? 'ur' : 'en';
  html.dir = ur ? 'rtl' : 'ltr';
  if (!ur) return;
  const bs = document.getElementById('bs-css');
  if (bs && !bs.href.includes('.rtl.')) bs.href = bs.href.replace('bootstrap.min.css', 'bootstrap.rtl.min.css');

  const cfg = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
  let queue = [];
  let scheduled = false;
  const obs = new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => queue.push(n));
      else if (r.type === 'characterData') queue.push(r.target);
      else queue.push(r.target);
    }
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      obs.disconnect();
      const todo = queue; queue = [];
      for (const n of todo) if (n.isConnected) walk(n);
      obs.observe(document.body, cfg);
    });
  });
  walk(document.body);
  obs.observe(document.body, cfg);
}
