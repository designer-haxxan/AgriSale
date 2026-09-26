// Stock: current stock, low stock, stock ledger per product, adjustments (in / out / count).
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtQty, fmtDate, fmtDateTime, today, monthStart, uuid, num, round3, debounce, AppError } from '../core/utils.js';
import { money, dateFilter, bindDateFilter, pager, expiryBadge, expiryDays, expiryState, fmtExpiry } from '../core/views.js';
import { getSettings } from '../core/settings.js';
import * as Auth from '../services/auth.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as Scanner from '../scanner/scanner.js';

const $ = window.jQuery;
export const MOVE_LABELS = { opening: 'Opening stock', sale: 'Sale', purchase: 'Purchase', sale_return: 'Sale return', purchase_return: 'Purchase return', adjust: 'Adjustment' };
const moveLink = (m) => {
  const r = { sale: `#/sales/${m.refId}`, purchase: `#/purchases/${m.refId}`, sale_return: `#/returns/sale/${m.refId}`, purchase_return: `#/returns/purchase/${m.refId}`, adjust: `#/stock/adjustment/${m.refId}` }[m.type];
  return r ? `<a href="${esc(r)}">${esc(m.refNo)}</a>` : esc(m.refNo);
};

async function renderCurrent(el) {
  const $el = $(el);
  const canAdj = Auth.can('stock.adjust');
  $el.html(UI.pageHeader('Stock', `<a class="btn btn-light btn-sm" href="#/expiry"><i class="bi bi-hourglass-split"></i><span class="d-none d-sm-inline"> Expiry</span></a>${canAdj ? '<a class="btn btn-light btn-sm" href="#/stock/adjustments"><i class="bi bi-clock-history"></i><span class="d-none d-sm-inline"> Adjustments</span></a><a class="btn btn-primary btn-sm" href="#/stock/adjust"><i class="bi bi-sliders"></i> Adjust</a>' : ''}`) + `
    <div class="row g-2 mb-3 cards"></div>
    <div class="filters"><input type="search" class="form-control flex-grow-2 q" placeholder="Search products…">
      <select class="form-select f"><option value="all">All tracked</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="neg">Negative</option></select></div>
    <div class="list-card list"></div>`);
  const tracked = () => Catalog.allProducts().filter((p) => p.active && p.trackStock !== false);
  const all = tracked();
  const value = all.reduce((s, p) => s + Math.max(0, p.stock) * (p.purchasePrice || 0), 0);
  const retail = all.reduce((s, p) => s + Math.max(0, p.stock) * (p.salePrice || 0), 0);
  const low = all.filter((p) => p.stock <= (p.minStock || 0)).length;
  const exp = Catalog.allBatches().filter((b) => b.qty > 0 && expiryState(b.expiry) === 'expired');
  const near = Catalog.allBatches().filter((b) => b.qty > 0 && expiryState(b.expiry) === 'near');
  $el.find('.cards').html([['Products', all.length], ['Stock value (cost)', money(value)], ['Retail value', money(retail)], ['Low / out of stock', low],
    ['<a href="#/expiry?f=expired" class="text-danger">Expired batches</a>', exp.length], ['<a href="#/expiry?f=near" class="text-warning-emphasis">Expiring soon</a>', near.length]]
    .map(([l, v]) => `<div class="col-6 col-md-4 col-xl-2"><div class="card stat-card"><div class="card-body py-2"><div class="stat-label">${l}</div><div class="fw-bold money">${v}</div></div></div></div>`).join(''));
  const draw = () => {
    const q = $el.find('.q').val(); const f = $el.find('.f').val();
    const ids = new Set(Catalog.searchProducts(q, { limit: Infinity }).map((p) => p.id));
    const list = tracked().filter((p) => ids.has(p.id) && (f === 'all' || (f === 'low' && p.stock <= (p.minStock || 0)) || (f === 'out' && p.stock <= 0) || (f === 'neg' && p.stock < 0)))
      .sort((a, b) => a.name.localeCompare(b.name));
    pager($el.find('.list'), list, (p) => `<a class="list-row" href="#/stock/${encodeURIComponent(p.id)}">
      <div class="main"><div class="title">${esc(p.name)}</div><div class="sub">Min ${fmtQty(p.minStock || 0)} · value ${fmtNum(Math.max(0, p.stock) * (p.purchasePrice || 0))} · ${Catalog.batches(p.id).length} batch(es) ${Catalog.nearestExpiry(p.id) ? expiryBadge(Catalog.nearestExpiry(p.id), { short: true }) : ''}</div></div>
      <div class="end"><span class="badge fs-6 ${p.stock <= 0 ? 'text-bg-danger' : p.stock <= (p.minStock || 0) ? 'text-bg-warning' : 'text-bg-light border'}">${fmtQty(p.stock)} ${esc(p.unit)}</span></div></a>`,
    60, UI.emptyState('No products match', 'boxes'));
  };
  draw();
  $el.on('input', '.q', debounce(draw, 150));
  $el.on('change', '.f', draw);
}

async function renderLedger(el, productId) {
  const $el = $(el);
  const p = Catalog.product(productId);
  if (!p) { $el.html(UI.pageHeader('Stock ledger', '', '#/stock') + UI.emptyState('Product not found', 'x-circle')); return; }
  let from = monthStart(); let to = today();
  $el.html(UI.pageHeader(p.name, Auth.can('stock.adjust') && p.trackStock !== false ? `<a class="btn btn-primary btn-sm" href="#/stock/adjust/${encodeURIComponent(p.id)}"><i class="bi bi-sliders"></i> Adjust</a>` : '', '#/stock') + `
    <div class="card stat-card mb-3"><div class="card-body"><div class="stat-label">Current stock</div><div class="stat-value">${p.trackStock === false ? 'Not tracked' : `${fmtQty(p.stock)} ${esc(p.unit)}`}</div>
      ${[p.company, p.packSize, p.activeIngredient, p.regNo ? 'Reg ' + p.regNo : ''].filter(Boolean).length ? `<div class="small text-body-secondary">${esc([p.company, p.packSize, p.activeIngredient, p.regNo ? 'Reg ' + p.regNo : ''].filter(Boolean).join(' · '))}</div>` : ''}</div></div>
    ${p.trackStock !== false ? `<h2 class="h6">Batches in stock <span class="small text-body-secondary fw-normal">— sold earliest expiry first</span></h2>
    <div class="list-card mb-3">${Catalog.batches(p.id).map((b, i) => `<div class="list-row"><div class="main"><div class="title">${i === 0 ? '<span class="badge text-bg-primary me-1">Next</span>' : ''}Batch ${esc(b.batchNo)}</div>
      <div class="sub">${expiryBadge(b.expiry)}${b.mfgDate ? ` · mfg ${esc(fmtExpiry(b.mfgDate))}` : ''} · cost ${fmtNum(b.cost)}${b.refNo && b.refNo !== 'OPENING' ? ` · ${esc(b.refNo)}` : ''}</div></div>
      <div class="end"><div class="fw-semibold">${fmtQty(b.qty)} ${esc(p.unit)}</div>${Auth.can('stock.adjust') ? `<a class="small" href="#/stock/adjust/${encodeURIComponent(p.id)}/${encodeURIComponent(b.id)}">Adjust</a>` : ''}</div></div>`).join('') || UI.emptyState('No stock', 'box')}</div>` : ''}
    <h2 class="h6">Stock movements</h2>
    ${dateFilter(from, to)}<div class="card"><div class="card-body p-0 ledger"></div></div>`);
  const bno = Object.fromEntries((await idb.getAllByIndex('batches', 'productId', productId)).map((b) => [b.id, b.batchNo]));
  const load = async () => {
    const [before, rows] = await idb.read(['stockMoves'], (t) => Promise.all([
      t.getAllByIndex('stockMoves', 'prodDate', IDBKeyRange.bound([productId, ''], [productId, from], false, true)),
      t.getAllByIndex('stockMoves', 'prodDate', IDBKeyRange.bound([productId, from], [productId, to])),
    ]));
    const opening = round3(before.reduce((s, m) => s + m.qty, 0));
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    let run = opening; let inQ = 0; let outQ = 0;
    const body = rows.map((m) => { run = round3(run + m.qty); if (m.qty > 0) inQ += m.qty; else outQ -= m.qty; return `<tr>
      <td class="text-nowrap">${fmtDate(m.date)}</td><td>${moveLink(m)}<div class="small text-body-secondary">${esc(MOVE_LABELS[m.type] || m.type)}${m.note && m.type === 'adjust' ? ' · ' + esc(m.note) : ''}${m.batchId ? ` · batch ${esc(bno[m.batchId] || '?')}` : ''}</div></td>
      <td class="num text-success">${m.qty > 0 ? fmtQty(m.qty) : ''}</td><td class="num text-danger">${m.qty < 0 ? fmtQty(-m.qty) : ''}</td><td class="num fw-semibold">${fmtQty(run)}</td></tr>`; }).join('');
    $el.find('.ledger').html(`<div class="table-responsive"><table class="table table-sm table-report mb-0"><thead><tr><th>Date</th><th>Reference</th><th class="num">In</th><th class="num">Out</th><th class="num">Balance</th></tr></thead>
      <tbody><tr class="table-light"><td colspan="4">Opening</td><td class="num fw-semibold">${fmtQty(opening)}</td></tr>${body || '<tr><td colspan="5" class="text-center text-body-secondary py-3">No movements in this period</td></tr>'}</tbody>
      <tfoot><tr class="fw-semibold"><td colspan="2">Totals / closing</td><td class="num">${fmtQty(inQ)}</td><td class="num">${fmtQty(outQ)}</td><td class="num">${fmtQty(run)}</td></tr></tfoot></table></div>`);
  };
  bindDateFilter($el, (f, t) => { from = f; to = t; load(); });
  await load();
}

// Expiry & batches: every batch in stock with its expiry, filterable, with write-off shortcuts.
async function renderExpiry(el) {
  const $el = $(el);
  const days = Number(getSettings().nearExpiryDays || 0);
  const f0 = new URLSearchParams(location.hash.split('?')[1] || '').get('f') || 'near';
  $el.html(UI.pageHeader('Expiry & batches', `<button class="btn btn-success btn-sm btn-wa"><i class="bi bi-whatsapp"></i><span class="d-none d-sm-inline"> Send alert</span></button>`, '#/stock') + `
    <div class="row g-2 mb-3 cards"></div>
    <div class="filters"><input type="search" class="form-control flex-grow-2 q" placeholder="Search product, company, batch…">
      <select class="form-select f"><option value="near">Expired + expiring within ${days} days</option><option value="expired">Expired only</option><option value="d90">Expiring within 90 days</option><option value="d180">Expiring within 180 days</option><option value="all">All batches in stock</option><option value="none">Batches without expiry</option></select></div>
    <div class="list-card list"></div>`);
  $el.find('.f').val(f0);
  if (!$el.find('.f').val()) $el.find('.f').val('near');
  const rows = () => Catalog.allBatches().filter((b) => b.qty > 0).map((b) => ({ b, p: Catalog.product(b.productId), d: expiryDays(b.expiry) })).filter((r) => r.p);
  const all = rows();
  const sumv = (list) => list.reduce((s, r) => s + r.b.qty * (r.b.cost || r.p.purchasePrice || 0), 0);
  const ex = all.filter((r) => r.d !== null && r.d < 0); const nr = all.filter((r) => r.d !== null && r.d >= 0 && r.d <= days);
  $el.find('.cards').html([['Expired batches', ex.length, 'danger'], ['Expired value (cost)', money(sumv(ex)), 'danger'], [`Expiring ≤ ${days} days`, nr.length, 'warning'], ['Value at risk', money(sumv(nr)), 'warning']]
    .map(([l, v, c]) => `<div class="col-6 col-md-3"><div class="card stat-card border-${c}-subtle"><div class="card-body py-2"><div class="stat-label">${l}</div><div class="fw-bold money text-${c}-emphasis">${v}</div></div></div></div>`).join(''));
  const draw = () => {
    const q = $el.find('.q').val().toLowerCase(); const f = $el.find('.f').val();
    const lim = { near: days, d90: 90, d180: 180 }[f];
    const list = rows().filter((r) => {
      if (q && !`${r.p.name} ${r.p.company || ''} ${r.b.batchNo}`.toLowerCase().includes(q)) return false;
      if (f === 'all') return true;
      if (f === 'none') return r.d === null;
      if (r.d === null) return false;
      if (f === 'expired') return r.d < 0;
      return r.d <= lim;
    }).sort((a, b) => (a.b.expiry || '9999').localeCompare(b.b.expiry || '9999'));
    pager($el.find('.list'), list, ({ b, p, d }) => `<div class="list-row flex-wrap">
      <div class="main" style="min-width:180px"><div class="title"><a href="#/stock/${encodeURIComponent(p.id)}">${esc(p.name)}</a></div>
        <div class="sub">Batch ${esc(b.batchNo)}${p.company ? ' · ' + esc(p.company) : ''} · value ${fmtNum(b.qty * (b.cost || p.purchasePrice || 0))}</div><div>${expiryBadge(b.expiry)}</div></div>
      <div class="end"><div class="fw-semibold">${fmtQty(b.qty)} ${esc(p.unit)}</div>
        ${d !== null && d < 0 && Auth.can('stock.adjust') ? `<a class="btn btn-sm btn-outline-danger mt-1" href="#/stock/adjust/${encodeURIComponent(p.id)}/${encodeURIComponent(b.id)}/writeoff">Write off</a>` : ''}</div></div>`, 60, UI.emptyState('No batches match this filter', 'hourglass'));
  };
  draw();
  $el.on('input', '.q', debounce(draw, 150));
  $el.on('change', '.f', draw);
  $el.on('click', '.btn-wa', async () => { const WA = await import('../services/whatsapp.js'); await WA.compose({ ...WA.expiryAlertMessage(), title: 'Expiry alert' }); });
}

async function renderAdjust(el, productId, batchId = null, preset = null) {
  Auth.require('stock.adjust');
  const $el = $(el);
  const lines = [];
  const id = uuid();
  const REASONS = ['Stock count correction', 'Damaged', 'Expired', 'Lost / theft', 'Found', 'Internal use', 'Stock in (other)', 'Other'];
  $el.html(UI.pageHeader('Stock adjustment', '', '#/stock') + `
    <div class="card mb-3"><div class="card-body">
      <div class="input-group mb-2"><input type="search" class="form-control q" placeholder="Search product to add…"><button class="btn btn-outline-secondary btn-scan" aria-label="Scan"><i class="bi bi-upc-scan"></i></button></div>
      <div class="list-card results mb-2 d-none"></div>
      <div class="lines"></div>
      <div class="row g-2 mt-2">
        <div class="col-6"><label class="form-label">Reason</label><select class="form-select reason">${REASONS.map((r) => `<option>${r}</option>`).join('')}</select></div>
        <div class="col-6"><label class="form-label">Date</label><input type="date" class="form-control date" value="${today()}" max="${today()}"></div>
        <div class="col-12"><label class="form-label">Note</label><input class="form-control note"></div>
      </div>
      <button class="btn btn-primary btn-lg w-100 mt-3 btn-save">Save adjustment</button>
    </div></div>`);
  // Line: { productId, mode: in|out|set, qty, batchId: '' (automatic) | batch id | '__new', newBatchNo, newExpiry }
  const base = (l) => { const p = Catalog.product(l.productId); const b = l.batchId && l.batchId !== '__new' ? Catalog.batches(p.id).find((x) => x.id === l.batchId) : null; return l.batchId && l.batchId !== '__new' ? (b?.qty || 0) : l.batchId === '__new' ? 0 : p.stock; };
  const change = (l) => (l.mode === 'set' ? round3(num(l.qty) - base(l)) : l.mode === 'out' ? -num(l.qty) : num(l.qty));
  const drawLines = () => {
    $el.find('.lines').html(lines.length ? `<div class="list-card">${lines.map((l, i) => {
      const p = Catalog.product(l.productId);
      const c = change(l); const b0 = base(l);
      const bs = Catalog.batches(p.id);
      return `<div class="list-row flex-wrap" data-i="${i}"><div class="main" style="min-width:140px"><div class="title">${esc(p.name)}</div><div class="sub">${l.batchId ? 'Batch' : 'Product'} ${fmtQty(b0)} → <b>${fmtQty(b0 + c)}</b> (${c >= 0 ? '+' : ''}${fmtQty(c)})</div></div>
        <select class="form-select form-select-sm bsel" style="width:auto;max-width:220px"><option value="">${l.mode === 'in' ? 'Opening batch' : 'Auto (earliest expiry first)'}</option>
          ${bs.map((b) => `<option value="${esc(b.id)}" ${l.batchId === b.id ? 'selected' : ''}>${esc(b.batchNo)} · ${b.expiry ? esc(fmtExpiry(b.expiry)) : 'no exp'} · ${fmtQty(b.qty)}</option>`).join('')}
          ${l.mode === 'in' ? `<option value="__new" ${l.batchId === '__new' ? 'selected' : ''}>+ New batch…</option>` : ''}</select>
        <select class="form-select form-select-sm mode" style="width:auto"><option value="in" ${l.mode === 'in' ? 'selected' : ''}>Add (+)</option><option value="out" ${l.mode === 'out' ? 'selected' : ''}>Remove (−)</option><option value="set" ${l.mode === 'set' ? 'selected' : ''}>Set count</option></select>
        <input class="form-control form-control-sm qty text-end" style="width:90px" inputmode="decimal" value="${esc(l.qty)}" placeholder="Qty">
        <button class="btn btn-sm btn-light rm" aria-label="Remove"><i class="bi bi-x-lg"></i></button>
        ${l.batchId === '__new' ? `<div class="w-100 d-flex gap-2 mt-1"><input class="form-control form-control-sm nb-no" placeholder="Batch no." value="${esc(l.newBatchNo || '')}"><input type="date" class="form-control form-control-sm nb-exp" value="${esc(l.newExpiry || '')}" title="Expiry date"></div>` : ''}</div>`;
    }).join('')}</div>` : UI.emptyState('Add products to adjust', 'sliders'));
  };
  const add = (p, bId = '', mode = 'set', qty = '') => {
    if (!p) return;
    if (p.trackStock === false) return UI.toast('This product does not track stock', 'warning');
    if (!lines.some((l) => l.productId === p.id && l.batchId === bId)) lines.push({ productId: p.id, mode, qty, batchId: bId });
    $el.find('.q').val(''); $el.find('.results').addClass('d-none'); drawLines();
    $el.find('.qty').last().trigger('focus');
  };
  drawLines();
  if (productId) {
    const b = batchId && Catalog.batches(productId).find((x) => x.id === batchId);
    if (preset === 'writeoff' && b) { add(Catalog.product(productId), b.id, 'out', String(b.qty)); $el.find('.reason').val('Expired'); }
    else add(Catalog.product(productId), b ? b.id : '');
  }
  $el.on('change', '.bsel', function () { const l = lines[+$(this).closest('[data-i]').data('i')]; l.batchId = this.value; drawLines(); });
  $el.on('input', '.nb-no', function () { lines[+$(this).closest('[data-i]').data('i')].newBatchNo = this.value; });
  $el.on('change', '.nb-exp', function () { lines[+$(this).closest('[data-i]').data('i')].newExpiry = this.value; });
  let res = [];
  $el.on('input', '.q', debounce(() => {
    const q = $el.find('.q').val().trim();
    if (!q) return $el.find('.results').addClass('d-none');
    res = Catalog.searchProducts(q, { limit: 10 }).filter((p) => p.trackStock !== false);
    $el.find('.results').removeClass('d-none').html(res.map((p, i) => `<button class="list-row" data-r="${i}"><div class="main"><div class="title">${esc(p.name)}</div></div><div class="end">${fmtQty(p.stock)}</div></button>`).join('') || '<div class="p-2 small text-body-secondary">No match</div>');
  }, 150));
  $el.on('keydown', '.q', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(Catalog.findByCode($el.find('.q').val()) || res[0]); } });
  $el.on('click', '[data-r]', function () { add(res[+this.dataset.r]); });
  $el.on('click', '.btn-scan', async () => { const c = await Scanner.scan(); if (c) { const p = Catalog.findByCode(c); if (p) add(p); else UI.toast('No product for ' + c, 'warning'); } });
  $el.on('change', '.mode', function () { const l = lines[+$(this).closest('[data-i]').data('i')]; l.mode = this.value; if (l.mode !== 'in' && l.batchId === '__new') l.batchId = ''; drawLines(); });
  $el.on('input', '.qty', function () { lines[+$(this).closest('[data-i]').data('i')].qty = this.value; });
  $el.on('change', '.qty', drawLines);
  $el.on('click', '.rm', function () { lines.splice(+$(this).closest('[data-i]').data('i'), 1); drawLines(); });
  let busy = false;
  $el.on('click', '.btn-save', async function () {
    if (busy) return; busy = true; $(this).prop('disabled', true);
    try {
      const out = lines.map((l) => {
        const p = Catalog.product(l.productId);
        if (l.qty === '' || num(l.qty) < 0) throw new AppError(`Enter a valid quantity for ${p.name}.`);
        if (l.batchId === '__new' && p.hasExpiry !== false && !l.newExpiry) throw new AppError(`Enter the expiry date of the new batch of ${p.name}.`);
        return { productId: l.productId, qty: change(l), batchId: l.batchId && l.batchId !== '__new' ? l.batchId : null,
          newBatch: l.batchId === '__new' ? { batchNo: l.newBatchNo || '', expiry: l.newExpiry || '' } : null };
      });
      const { doc } = await Posting.saveAdjustment({ id, date: $el.find('.date').val(), reason: $el.find('.reason').val(), note: $el.find('.note').val(), lines: out });
      UI.toast(`${doc.number} saved`);
      location.hash = `#/stock/adjustment/${doc.id}`;
    } catch (e) { UI.toastError(e); } finally { busy = false; $(this).prop('disabled', false); }
  });
}

async function renderAdjustments(el) {
  const $el = $(el);
  let from = monthStart(); let to = today();
  $el.html(UI.pageHeader('Stock adjustments', '<a class="btn btn-primary btn-sm" href="#/stock/adjust"><i class="bi bi-plus-lg"></i> New</a>', '#/stock') + dateFilter(from, to) + '<div class="list-card list"></div>');
  const load = async () => {
    const list = (await idb.getAllByIndex('adjustments', 'date', IDBKeyRange.bound(from, to))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    pager($el.find('.list'), list, (a) => `<a class="list-row" href="#/stock/adjustment/${encodeURIComponent(a.id)}"><div class="main"><div class="title">${esc(a.number)} ${a.status === 'void' ? '<span class="badge text-bg-danger">Void</span>' : ''}</div><div class="sub">${fmtDate(a.date)} · ${esc(a.reason)} · ${a.items.length} product(s)</div></div></a>`, 50, UI.emptyState('No adjustments in this period', 'sliders'));
  };
  bindDateFilter($el, (f, t) => { from = f; to = t; load(); });
  await load();
}

async function renderAdjustment(el, id) {
  const $el = $(el).off();
  const a = await idb.get('adjustments', id);
  if (!a) { $el.html(UI.pageHeader('Adjustment', '', '#/stock/adjustments') + UI.emptyState('Not found', 'x-circle')); return; }
  $el.html(UI.pageHeader(a.number, a.status !== 'void' && Auth.can('stock.adjust') ? '<button class="btn btn-outline-danger btn-sm btn-void"><i class="bi bi-x-circle"></i> Void</button>' : '', '#/stock/adjustments') + `
    ${a.status === 'void' ? `<div class="alert alert-danger">Voided ${fmtDateTime(a.voidedAt)} by ${esc(a.voidedBy)}</div>` : ''}
    <div class="card"><div class="card-body"><div class="mb-2">${fmtDate(a.date)} · <b>${esc(a.reason)}</b>${a.note ? ' · ' + esc(a.note) : ''}</div>
    <table class="table table-sm table-report"><thead><tr><th>Product</th><th class="num">Before</th><th class="num">Change</th><th class="num">Value</th></tr></thead>
    <tbody>${a.items.map((i) => `<tr><td><a href="#/stock/${encodeURIComponent(i.productId)}">${esc(i.name)}</a>${(i.batches || []).length ? `<div class="small text-body-secondary">${i.batches.map((b) => `Batch ${esc(b.batchNo)}${b.expiry ? ' exp ' + esc(fmtExpiry(b.expiry)) : ''}: ${fmtQty(b.qty)}`).join('; ')}</div>` : ''}</td><td class="num">${fmtQty(i.before)}</td><td class="num ${i.qty < 0 ? 'text-danger' : 'text-success'}">${i.qty > 0 ? '+' : ''}${fmtQty(i.qty)}</td><td class="num">${fmtNum(i.qty * i.cost)}</td></tr>`).join('')}</tbody></table>
    <div class="small text-body-secondary">By ${esc(a.userName)} · ${fmtDateTime(a.createdAt)}</div></div></div>`);
  $el.on('click', '.btn-void', async () => {
    if (!await UI.confirmDialog(`Void ${a.number}? Stock changes will be reversed.`, { okLabel: 'Void', okClass: 'btn-danger' })) return;
    try { await Posting.voidDocument('adjustment', id); UI.toast('Adjustment voided'); renderAdjustment(el, id); } catch (e) { UI.toastError(e); }
  });
}

export default {
  async render(el, { route, params }) {
    const [a, b, c, d] = params;
    if (route === 'expiry') return renderExpiry(el);
    if (!a) return renderCurrent(el);
    if (a.startsWith('expiry')) return renderExpiry(el);
    if (a === 'adjust') return renderAdjust(el, b, c, d);
    if (a === 'adjustments') return renderAdjustments(el);
    if (a === 'adjustment') return renderAdjustment(el, b);
    return renderLedger(el, a);
  },
};
