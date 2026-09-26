// WhatsApp center: credit reminders (one by one or as a queue), owner alerts and the sent-message log.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtDate, fmtDateTime, debounce } from '../core/utils.js';
import { money } from '../core/views.js';
import { getSettings } from '../core/settings.js';
import * as Auth from '../services/auth.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as WA from '../services/whatsapp.js';

const $ = window.jQuery;
const KIND_LABELS = { sale: 'Invoice', saleReturn: 'Sale return', purchaseReturn: 'Purchase return', receipt: 'Payment receipt', payment: 'Supplier payment', reminder: 'Credit reminder',
  statement: 'Statement', message: 'Message', owner_summary: 'Daily summary', owner_expiry: 'Expiry alert', owner_lowstock: 'Low stock alert' };
const ago = (iso) => { if (!iso) return ''; const d = Math.floor((Date.now() - new Date(iso)) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };

async function renderReminders($box) {
  $box.html(UI.spinner('Calculating balances…'));
  const [aging, last] = await Promise.all([Posting.customerAging(), WA.lastSent('reminder')]);
  let rows = [];
  for (const [id, a] of aging) {
    const c = Catalog.party('customers', id);
    if (!c || !c.active || a.balance < 0.995) continue;
    rows.push({ c, a, phone: WA.normalizePhone(WA.partyPhone(c)), last: last.get(id) || '' });
  }
  rows.sort((x, y) => (y.a.overdue - x.a.overdue) || (y.a.balance - x.a.balance));
  const total = rows.reduce((s, r) => s + r.a.balance, 0); const od = rows.reduce((s, r) => s + r.a.overdue, 0);
  $box.html(`<div class="row g-2 mb-3">
      <div class="col-6 col-md-3"><div class="card stat-card"><div class="card-body py-2"><div class="stat-label">Customers with credit</div><div class="fw-bold">${rows.length}</div></div></div></div>
      <div class="col-6 col-md-3"><div class="card stat-card"><div class="card-body py-2"><div class="stat-label">Total receivable</div><div class="fw-bold money">${money(total)}</div></div></div></div>
      <div class="col-6 col-md-3"><div class="card stat-card"><div class="card-body py-2"><div class="stat-label">Overdue</div><div class="fw-bold money text-danger">${money(od)}</div></div></div></div>
      <div class="col-6 col-md-3"><div class="card stat-card"><div class="card-body py-2"><div class="stat-label">No WhatsApp number</div><div class="fw-bold">${rows.filter((r) => !r.phone).length}</div></div></div></div></div>
    <div class="filters"><input type="search" class="form-control flex-grow-2 q" placeholder="Search customer…">
      <select class="form-select f"><option value="overdue">Overdue only</option><option value="all">All with balance</option><option value="notsent">Not reminded in 7 days</option></select>
      <button class="btn btn-success btn-queue" style="flex:0 0 auto"><i class="bi bi-send me-1"></i>Send one by one</button></div>
    <div class="small text-body-secondary mb-2">Browsers only allow one WhatsApp window per click, so reminders are sent one at a time: check the message, press <b>Open in WhatsApp</b>, send it there, then come back for the next one.</div>
    <div class="list-card list"></div>`);
  if (!rows.some((r) => r.a.overdue > 0.004)) $box.find('.f').val('all');
  const filtered = () => {
    const q = $box.find('.q').val().toLowerCase(); const f = $box.find('.f').val();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    return rows.filter((r) => (!q || `${r.c.name} ${r.c.phone || ''} ${r.c.address || ''}`.toLowerCase().includes(q))
      && (f === 'all' || (f === 'overdue' && r.a.overdue > 0.004) || (f === 'notsent' && (!r.last || r.last < weekAgo))));
  };
  const draw = () => {
    const list = filtered();
    $box.find('.btn-queue').prop('disabled', !list.some((r) => r.phone));
    $box.find('.list').html(list.map((r, i) => `<div class="list-row" data-i="${i}">
      <div class="thumb"><i class="bi bi-person"></i></div>
      <div class="main"><div class="title"><a href="#/customers/${encodeURIComponent(r.c.id)}">${esc(r.c.name)}</a> ${r.a.overdue > 0.004 ? `<span class="badge text-bg-danger">Overdue ${fmtNum(r.a.overdue)}</span>` : ''}</div>
        <div class="sub">${r.phone ? '+' + esc(r.phone) : '<span class="text-danger">no number</span>'}${r.a.oldestDue ? ` · due since ${fmtDate(r.a.oldestDue)}` : ''}${r.last ? ` · reminded ${ago(r.last)}` : ''}</div></div>
      <div class="end"><div class="fw-semibold money">${fmtNum(r.a.balance)}</div><button class="btn btn-sm btn-outline-success mt-1 btn-one"><i class="bi bi-whatsapp"></i> Send</button></div></div>`).join('')
      || UI.emptyState('No customers match. Credit sales with a due date show up here once overdue.', 'check2-circle'));
  };
  draw();
  $box.on('input', '.q', debounce(draw, 150));
  $box.on('change', '.f', draw);
  const sendOne = async (r) => { const ok = await WA.sendReminder(r.c.id, r.a); if (ok) { r.last = new Date().toISOString(); draw(); } return ok; };
  $box.on('click', '.btn-one', function () { sendOne(filtered()[+$(this).closest('[data-i]').data('i')]); });
  $box.on('click', '.btn-queue', async () => {
    const queue = filtered().filter((r) => r.phone);
    let n = 0;
    for (const r of queue) {
      if (!await sendOne(r)) break;
      n++;
      if (n < queue.length && !await UI.confirmDialog(`${n} of ${queue.length} opened. Send the next reminder to ${queue[n].c.name}?`, { title: 'Next reminder', okLabel: 'Next', okClass: 'btn-success' })) break;
    }
    if (n) UI.toast(`${n} reminder(s) opened in WhatsApp`);
  });
}

function renderOwner($box) {
  const s = getSettings();
  const exp = WA.expiryCounts();
  const low = Catalog.allProducts().filter((p) => p.active && p.trackStock !== false && p.stock <= (p.minStock || 0)).length;
  const card = (key, icon, color, title, sub) => `<div class="col-md-4"><div class="card h-100"><div class="card-body d-flex flex-column">
    <div class="d-flex align-items-center gap-2 mb-1"><i class="bi bi-${icon} text-${color} fs-4"></i><div class="fw-semibold">${title}</div></div>
    <div class="small text-body-secondary flex-grow-1">${sub}</div>
    <button class="btn btn-success mt-2 btn-owner" data-k="${key}"><i class="bi bi-whatsapp me-1"></i>Prepare message</button></div></div></div>`;
  $box.html(`${s.whatsapp.ownerPhone ? `<div class="small mb-2">Owner / manager number: <b>+${esc(WA.normalizePhone(s.whatsapp.ownerPhone))}</b> <a href="#/settings">change</a></div>`
      : '<div class="alert alert-info py-2 small">Set the owner\'s WhatsApp number in <a href="#/settings">Settings → WhatsApp</a> to have it filled in automatically.</div>'}
    <div class="row g-3">
      ${card('summary', 'clipboard-data', 'primary', "Today's summary", 'Sales, returns, cash in/out, receivables and expiry warnings for today.')}
      ${card('expiry', 'hourglass-split', exp.expired ? 'danger' : 'warning', 'Expiry alert', `${exp.expired} expired batch(es) and ${exp.near} expiring within ${s.nearExpiryDays} days.`)}
      ${card('lowstock', 'exclamation-triangle', low ? 'danger' : 'success', 'Low stock alert', `${low} product(s) at or below minimum stock.`)}
    </div>`);
  $box.on('click', '.btn-owner', async function () {
    const k = this.dataset.k;
    try {
      const msg = k === 'summary' ? await WA.dailySummaryMessage() : k === 'expiry' ? WA.expiryAlertMessage() : WA.lowStockMessage();
      await WA.compose({ ...msg, title: $(this).closest('.card').find('.fw-semibold').text() });
    } catch (e) { UI.toastError(e); }
  });
}

async function renderLog($box) {
  const list = (await idb.getAll('waLog')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
  $box.html(`<div class="small text-body-secondary mb-2">Messages opened in WhatsApp from this device (latest ${list.length}). Tap one to send it again.</div>
    <div class="list-card">${list.map((e, i) => `<button class="list-row" data-i="${i}"><div class="thumb text-success"><i class="bi bi-whatsapp"></i></div>
      <div class="main"><div class="title">${esc(e.name || '+' + e.phone)} <span class="badge text-bg-light border">${esc(KIND_LABELS[e.kind] || e.kind)}</span></div>
        <div class="sub">${esc(fmtDateTime(e.at))}${e.refNo ? ' · ' + esc(e.refNo) : ''}${e.phone ? ' · +' + esc(e.phone) : ''}${e.via === 'share' ? ' · shared' : ''}</div></div></button>`).join('')
      || UI.emptyState('No messages sent yet', 'whatsapp')}</div>`);
  $box.on('click', '[data-i]', function () { const e = list[+this.dataset.i]; WA.compose({ ...e, phone: e.phone, title: 'Send again' }); });
}

export default {
  async render(el, { params }) {
    const $el = $(el);
    const tab = params[0] || 'reminders';
    const tabs = [['reminders', 'Credit reminders', 'bell'], ['owner', 'Owner alerts', 'person-badge'], ['log', 'Sent log', 'clock-history']];
    $el.html(UI.pageHeader('WhatsApp', `<button class="btn btn-success btn-sm btn-new"><i class="bi bi-chat-dots"></i><span class="d-none d-sm-inline"> New message</span></button>`) + `
      <ul class="nav nav-pills mb-3 flex-nowrap overflow-auto">${tabs.map(([k, l, i]) => `<li class="nav-item"><a class="nav-link text-nowrap ${k === tab ? 'active' : ''}" href="#/whatsapp/${k}"><i class="bi bi-${i} me-1"></i>${l}</a></li>`).join('')}</ul>
      <div class="wa-box"></div>`);
    const $box = $el.find('.wa-box');
    if (tab === 'owner') renderOwner($box);
    else if (tab === 'log') await renderLog($box);
    else await renderReminders($box);
    $el.on('click', '.btn-new', async () => {
      const kinds = [['customers', 'Customer'], ...(Auth.can('purchase.manage') ? [['suppliers', 'Supplier']] : [])];
      const r = await UI.pick({ title: 'Send to', noneLabel: 'Any number (type it in)', search: async (q) => kinds.flatMap(([k, l]) => Catalog.searchParties(k, q, 30).map((p) => ({ id: p.id, title: p.name, subtitle: `${l}${WA.partyPhone(p) ? ' · ' + WA.partyPhone(p) : ' · no number'}`, value: { k, p } }))) });
      if (r === undefined) return;
      const shop = getSettings().business.name;
      WA.compose(r ? { name: r.value.p.name, phone: WA.partyPhone(r.value.p), partyKind: r.value.k, partyId: r.value.p.id, text: `Dear ${r.value.p.name},\n\n— ${shop}` } : { text: `\n\n— ${shop}` });
    });
  },
};
