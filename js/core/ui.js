// UI helpers: toasts, modals, confirm dialogs, pickers, loading & empty states.
import { esc, debounce } from './utils.js';

const $ = window.jQuery;

export function toast(message, type = 'success', ms = 3200) {
  const icons = { success: 'check-circle-fill', danger: 'x-octagon-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' };
  const $t = $(`<div class="toast align-items-center text-bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex"><div class="toast-body"><i class="bi bi-${icons[type] || icons.info} me-2"></i>${esc(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div></div>`);
  $('#toast-container').append($t);
  const t = new bootstrap.Toast($t[0], { delay: ms });
  $t.on('hidden.bs.toast', () => $t.remove());
  t.show();
}
export const toastError = (err) => {
  console.error(err);
  toast(err?.message || String(err), 'danger', 5000);
};

export function modal({ title, body = '', footer = null, size = '', scrollable = true, fullscreenMobile = true, static: isStatic = false }) {
  const $m = $(`<div class="modal fade" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog ${size ? 'modal-' + size : ''} ${scrollable ? 'modal-dialog-scrollable' : ''} ${fullscreenMobile ? 'modal-fullscreen-sm-down' : ''} modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header py-2"><h5 class="modal-title">${esc(title)}</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body">${body}</div>
        ${footer !== null ? `<div class="modal-footer py-2">${footer}</div>` : ''}
      </div></div></div>`);
  $('body').append($m);
  const bs = new bootstrap.Modal($m[0], isStatic ? { backdrop: 'static', keyboard: false } : {});
  const closed = new Promise((res) => $m.on('hidden.bs.modal', () => { bs.dispose(); $m.remove(); res(); }));
  bs.show();
  return { $el: $m, close: () => bs.hide(), closed, bs };
}

// Form dialog. onSubmit receives (values, $el); return a value to close, throw to show an error.
export function formModal({ title, body, submitLabel = 'Save', submitClass = 'btn-primary', size = '', onSubmit, onShown }) {
  return new Promise((resolve) => {
    let result = null;
    const m = modal({
      title, size,
      body: `<form novalidate autocomplete="off">${body}<div class="alert alert-danger py-2 small d-none form-error mt-3 mb-0"></div><button type="submit" class="d-none"></button></form>`,
      footer: `<button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
               <button type="button" class="btn ${submitClass} btn-submit">${esc(submitLabel)}</button>`,
    });
    const $f = m.$el.find('form');
    m.$el.on('shown.bs.modal', () => { onShown ? onShown(m.$el) : m.$el.find('input,select,textarea').filter(':visible').first().trigger('focus'); });
    let busy = false;
    const submit = async (e) => {
      e?.preventDefault();
      if (busy) return;
      busy = true;
      const $btn = m.$el.find('.btn-submit').prop('disabled', true);
      m.$el.find('.form-error').addClass('d-none');
      try {
        const values = Object.fromEntries(new FormData($f[0]).entries());
        $f.find('input[type=checkbox]').each(function () { values[this.name] = this.checked; });
        const r = await onSubmit(values, m.$el);
        if (r !== undefined && r !== false) { result = r; m.close(); }
      } catch (err) {
        console.warn(err);
        m.$el.find('.form-error').text(err.message || String(err)).removeClass('d-none');
      } finally { busy = false; $btn.prop('disabled', false); }
    };
    $f.on('submit', submit);
    m.$el.find('.btn-submit').on('click', submit);
    m.closed.then(() => resolve(result));
  });
}

export function confirmDialog(message, { title = 'Please confirm', okLabel = 'Confirm', okClass = 'btn-primary', html = false } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal({
      title, fullscreenMobile: false, scrollable: false,
      body: html ? message : `<p class="mb-0">${esc(message)}</p>`,
      footer: `<button class="btn btn-light" data-bs-dismiss="modal">Cancel</button><button class="btn ${okClass} btn-ok">${esc(okLabel)}</button>`,
    });
    m.$el.find('.btn-ok').on('click', () => { ok = true; m.close(); });
    m.closed.then(() => resolve(ok));
  });
}

// Searchable list picker. search(q) => [{id, title, subtitle, right, value}]
export function pick({ title, search, noneLabel = null, placeholder = 'Search…', addNew = null }) {
  return new Promise((resolve) => {
    let result; // undefined = cancelled
    const m = modal({
      title, size: 'md',
      body: `<input type="search" class="form-control form-control-lg mb-2 pick-q" placeholder="${esc(placeholder)}" autocomplete="off">
        ${addNew ? `<button class="btn btn-outline-primary w-100 mb-2 pick-add"><i class="bi bi-plus-lg me-1"></i>${esc(addNew.label)}</button>` : ''}
        ${noneLabel ? `<button class="list-group-item list-group-item-action rounded border mb-2 w-100 text-start pick-none"><i class="bi bi-dash-circle me-2"></i>${esc(noneLabel)}</button>` : ''}
        <div class="list-group pick-list"></div>`,
    });
    let items = [];
    const render = async () => {
      items = await search(m.$el.find('.pick-q').val().trim());
      m.$el.find('.pick-list').html(items.length ? items.map((it, i) => `
        <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2" data-i="${i}">
          <div class="text-truncate me-2"><div class="fw-semibold text-truncate">${esc(it.title)}</div>${it.subtitle ? `<div class="small text-body-secondary text-truncate">${esc(it.subtitle)}</div>` : ''}</div>
          ${it.right ? `<div class="small text-nowrap">${esc(it.right)}</div>` : ''}</button>`).join('') : emptyState('No matches found', 'search'));
    };
    m.$el.on('input', '.pick-q', debounce(render, 150));
    m.$el.on('keydown', '.pick-q', (e) => { if (e.key === 'Enter' && items.length) { e.preventDefault(); result = items[0]; m.close(); } });
    m.$el.on('click', '.pick-list [data-i]', function () { result = items[+this.dataset.i]; m.close(); });
    m.$el.on('click', '.pick-none', () => { result = null; m.close(); });
    let adding = false;
    m.$el.on('click', '.pick-add', async () => {
      adding = true;
      m.close(); await m.closed;
      const created = await addNew.create();
      resolve(created || undefined);
    });
    m.$el.on('shown.bs.modal', () => m.$el.find('.pick-q').trigger('focus'));
    render();
    m.closed.then(() => { if (!adding) resolve(result); });
  });
}

export function emptyState(text, icon = 'inbox', action = '') {
  return `<div class="empty-state text-center text-body-secondary py-5"><i class="bi bi-${icon} display-6 d-block mb-2"></i><div>${esc(text)}</div>${action}</div>`;
}
export function errorState(err) {
  return `<div class="alert alert-danger m-3"><i class="bi bi-exclamation-octagon me-2"></i>${esc(err?.message || err)}</div>`;
}
export const spinner = (text = 'Loading…') => `<div class="text-center py-5 text-body-secondary"><div class="spinner-border spinner-border-sm me-2"></div>${esc(text)}</div>`;

let loadingCount = 0;
export function loading(on, text = 'Please wait…') {
  loadingCount = Math.max(0, loadingCount + (on ? 1 : -1));
  $('#loading-overlay').toggleClass('d-none', loadingCount === 0).find('.loading-text').text(text);
}
export async function withLoading(fn, text) {
  loading(true, text);
  try { return await fn(); } finally { loading(false); }
}

export function pageHeader(title, actions = '', back = null) {
  return `<div class="page-header d-flex align-items-center gap-2 mb-3">
    ${back ? `<a href="${esc(back)}" class="btn btn-light btn-sm" aria-label="Back"><i class="bi bi-arrow-left"></i></a>` : ''}
    <h1 class="h5 mb-0 flex-grow-1 text-truncate">${esc(title)}</h1>
    <div class="d-flex gap-2 flex-shrink-0">${actions}</div></div>`;
}

// Build a <select> options list.
export const options = (list, selected, valueKey = 'id', labelKey = 'name') =>
  list.map((o) => `<option value="${esc(o[valueKey])}" ${String(o[valueKey]) === String(selected) ? 'selected' : ''}>${esc(o[labelKey])}</option>`).join('');

export function beep() {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 1400; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.08);
  } catch { /* audio unavailable */ }
  if (navigator.vibrate) navigator.vibrate(40);
}
