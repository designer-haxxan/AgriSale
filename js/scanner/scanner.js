// Camera barcode scanning: native BarcodeDetector when available, html5-qrcode (lazy-loaded) otherwise.
// Hardware (keyboard-wedge) scanners are handled by attachWedge().
import { CDN } from '../config.js';
import { loadScript, esc } from '../core/utils.js';
import * as UI from '../core/ui.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code', 'data_matrix'];

function cameraError(e) {
  // html5-qrcode reports errors as plain strings, native APIs as DOMExceptions.
  const n = e?.name || (String(e).match(/(NotAllowedError|SecurityError|NotFoundError|OverconstrainedError|NotReadableError)/) || [])[1] || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera permission was denied. Allow camera access for this site in your browser settings, or type/scan the barcode with a hardware scanner.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera was found on this device.';
  if (n === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return e?.message || String(e);
}

/**
 * Opens the scanner dialog.
 * single mode: resolves with the scanned code (or null).
 * continuous mode: calls onCode(code) for each scan and resolves null when closed.
 */
export function scan({ continuous = false, onCode = null, title = 'Scan barcode' } = {}) {
  return new Promise((resolve) => {
    let result = null; let stopFn = null; let last = { code: '', t: 0 }; let count = 0; let closed = false;
    const m = UI.modal({
      title, size: 'md',
      body: `<div class="scanner-status small text-body-secondary mb-2">Starting camera…</div>
        <div class="scanner-box mb-2 d-none"><video playsinline muted></video><div class="scan-line"></div></div>
        <div id="html5qr-region" class="mb-2"></div>
        <div class="scanner-last small mb-2"></div>
        <form class="input-group scanner-manual"><input class="form-control" inputmode="numeric" placeholder="Or type barcode" autocomplete="off"><button class="btn btn-primary">Add</button></form>`,
    });
    const $s = m.$el.find('.scanner-status');
    const handle = (code) => {
      code = String(code || '').trim();
      if (!code || closed) return;
      const now = Date.now();
      if (code === last.code && now - last.t < 1500) return;
      last = { code, t: now };
      UI.beep();
      if (continuous) {
        count++;
        m.$el.find('.scanner-last').html(`<i class="bi bi-check-circle text-success me-1"></i>${esc(code)} <span class="text-body-secondary">(${count} scanned)</span>`);
        onCode?.(code);
      } else { result = code; m.close(); }
    };
    m.$el.find('.scanner-manual').on('submit', (e) => { e.preventDefault(); const $i = $(e.target).find('input'); handle($i.val()); last = { code: '', t: 0 }; $i.val(''); });
    m.closed.then(async () => { closed = true; try { await stopFn?.(); } catch { /* ignore */ } resolve(result); });

    (async () => {
      try {
        if (!window.isSecureContext) throw new Error('Camera access requires HTTPS (or localhost).');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera access.');
        let native = false;
        if ('BarcodeDetector' in window) {
          try { native = (await window.BarcodeDetector.getSupportedFormats()).length > 0; } catch { native = false; }
        }
        if (native) stopFn = await startNative(m.$el, handle, () => closed);
        else stopFn = await startFallback(handle);
        if (closed) { await stopFn?.(); return; }
        $s.text(continuous ? 'Point the camera at barcodes. Items are added automatically.' : 'Point the camera at a barcode.');
      } catch (e) {
        $s.removeClass('text-body-secondary').addClass('text-danger').text(cameraError(e));
        m.$el.find('.scanner-manual input').trigger('focus');
      }
    })();
  });
}

async function startNative($el, handle, isClosed) {
  const supported = await window.BarcodeDetector.getSupportedFormats();
  const detector = new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  if (isClosed()) { stream.getTracks().forEach((t) => t.stop()); return null; }
  const video = $el.find('video')[0];
  $el.find('.scanner-box').removeClass('d-none');
  video.srcObject = stream;
  await video.play();
  let running = true;
  const loop = async () => {
    if (!running) return;
    try {
      if (video.readyState >= 2) {
        const codes = await detector.detect(video);
        if (codes.length) handle(codes[0].rawValue);
      }
    } catch { /* frame not ready */ }
    if (running) setTimeout(loop, 120);
  };
  loop();
  return async () => { running = false; stream.getTracks().forEach((t) => t.stop()); };
}

async function startFallback(handle) {
  await loadScript(CDN.html5qrcode);
  const H = window.Html5Qrcode;
  const F = window.Html5QrcodeSupportedFormats;
  const formats = F ? [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.CODABAR, F.ITF, F.QR_CODE] : undefined;
  const scanner = new H('html5qr-region', { formatsToSupport: formats, verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
  await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h, w) * 0.5) }) }, (text) => handle(text), () => {});
  return async () => { try { await scanner.stop(); scanner.clear(); } catch { /* ignore */ } };
}

/**
 * Detects keyboard-wedge (hardware/Bluetooth HID) scanners: rapid keystrokes ending with Enter,
 * typed while no input field has focus. Returns a detach function.
 */
export function attachWedge(onCode) {
  let buf = ''; let lastT = 0;
  const onKey = (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
    if (document.querySelector('.modal.show')) return;
    const now = Date.now();
    if (now - lastT > 60) buf = '';
    lastT = now;
    if (e.key === 'Enter') { if (buf.length >= 3) { e.preventDefault(); onCode(buf); } buf = ''; return; }
    if (e.key.length === 1) buf += e.key;
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
