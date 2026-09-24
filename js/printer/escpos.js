// Minimal ESC/POS command encoder for 58mm (32 columns) and 80mm (48 columns) thermal printers.
const ESC = 0x1b; const GS = 0x1d;

export function asciiSafe(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e\n]/g, '?');
}

export class EscPos {
  constructor(width = 58) {
    this.cols = Number(width) === 80 ? 48 : 32;
    this.buf = [];
    this.raw(ESC, 0x40); // initialize
  }
  raw(...bytes) { this.buf.push(...bytes); return this; }
  text(s) { for (const ch of asciiSafe(s)) this.buf.push(ch.charCodeAt(0)); return this; }
  line(s = '') { return this.text(s).raw(0x0a); }
  align(a) { return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[a] ?? 0); }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  size(double) { return this.raw(GS, 0x21, double ? 0x11 : 0x00); }
  hr(ch = '-') { return this.line(ch.repeat(this.cols)); }
  lr(left, right, width = this.cols) {
    left = asciiSafe(left); right = asciiSafe(right);
    const space = width - left.length - right.length;
    if (space >= 1) return this.line(left + ' '.repeat(space) + right);
    return this.line(left).line(' '.repeat(Math.max(0, width - right.length)) + right);
  }
  wrap(s, width = this.cols) {
    const words = asciiSafe(s).split(/\s+/); let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > width) { if (cur) this.line(cur); cur = w.length > width ? w.slice(0, width) : w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) this.line(cur);
    return this;
  }
  feed(n = 3) { return this.raw(ESC, 0x64, n); }
  cut() { return this.raw(GS, 0x56, 0x42, 0x00); }
  bytes() { return new Uint8Array(this.buf); }
}
