// WhatsApp messaging through click-to-chat links (wa.me / web.whatsapp.com / whatsapp://).
// The app composes the message and opens WhatsApp with it pre-filled; the user presses Send there.
// This works offline-first without a server or WhatsApp Business API account. Every message opened
// from the app is recorded in the `waLog` store.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtQty, fmtDate, uuid, nowISO, today, round2, AppError } from '../core/utils.js';
import { getSettings } from '../core/settings.js';
import { fmtExpiry, expiryDays } from '../core/views.js';
import { CONFIG } from '../config.js';
import * as Auth from './auth.js';
import * as Catalog from './catalog.js';
import * as Posting from './posting.js';

const $ = window.jQuery;

// ---------- templates ----------
// Placeholders are written as {name}. A line whose placeholders are all empty is left out of the message.
export const TEMPLATES = {
  sale: {
    label: 'Sale invoice (to customer)',
    vars: ['shop', 'shop_phone', 'name', 'number', 'date', 'items', 'total', 'discount', 'paid', 'bill_balance', 'account_balance', 'due_date'],
    text: `*{shop}*
Dear {name},
Invoice *{number}* · {date}

{items}

Discount: {discount}
*Total: {total}*
Paid: {paid}
Unpaid on this bill: {bill_balance}
Due date: {due_date}
Your account balance: *{account_balance}*

Thank you for shopping with us.
{shop_phone}`,
  },
  saleReturn: {
    label: 'Sale return (to customer)',
    vars: ['shop', 'shop_phone', 'name', 'number', 'invoice', 'date', 'items', 'total', 'refund', 'account_balance'],
    text: `*{shop}*
Dear {name},
Return *{number}* against invoice {invoice} · {date}

{items}

*Return total: {total}*
Refunded: {refund}
Your account balance: *{account_balance}*`,
  },
  receipt: {
    label: 'Payment received (to customer)',
    vars: ['shop', 'shop_phone', 'name', 'number', 'date', 'amount', 'method', 'account_balance'],
    text: `*{shop}*
Dear {name},
We have received your payment of *{amount}* on {date}.
Receipt no: {number}
Method: {method}
Remaining balance: *{account_balance}*

Thank you!`,
  },
  payment: {
    label: 'Payment made (to supplier)',
    vars: ['shop', 'name', 'number', 'date', 'amount', 'method', 'account_balance'],
    text: `*{shop}*
Dear {name},
We have paid *{amount}* on {date}.
Voucher no: {number}
Method: {method}
Balance with you: *{account_balance}*`,
  },
  reminder: {
    label: 'Credit reminder (to customer)',
    vars: ['shop', 'shop_phone', 'name', 'account_balance', 'overdue', 'due_date', 'open_bills'],
    text: `*{shop}*
Dear {name},
This is a friendly reminder that your outstanding balance is *{account_balance}*.
Overdue amount: *{overdue}* (due since {due_date})

{open_bills}

Please clear your dues at your earliest convenience.
{shop_phone}`,
  },
  statement: {
    label: 'Ledger statement',
    vars: ['shop', 'shop_phone', 'name', 'from', 'to', 'opening', 'rows', 'debit', 'credit', 'closing'],
    text: `*{shop}* — Account statement
{name}
Period: {from} to {to}

Opening balance: {opening}
{rows}

Total debit: {debit}
Total credit: {credit}
*Closing balance: {closing}*
{shop_phone}`,
  },
};

export const template = (key) => getSettings().whatsapp.templates?.[key] || TEMPLATES[key].text;

export function render(tpl, vars) {
  const out = [];
  for (const line of tpl.split('\n')) {
    const keys = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (keys.length && keys.every((k) => vars[k] === undefined || vars[k] === null || vars[k] === '')) continue;
    out.push(line.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k]))));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- phone numbers & links ----------
// Local numbers (0300-1234567) become international digits (923001234567).
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  const cc = String(getSettings().whatsapp.countryCode || CONFIG.DEFAULT_COUNTRY_CODE).replace(/\D/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = cc + d.slice(1);
  else if (d.length <= 10 && cc && !d.startsWith(cc)) d = cc + d;
  d = d.replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : '';
}
export const partyPhone = (p) => (p ? p.whatsapp || p.phone || '' : '');

const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
export function waUrl(phone, text) {
  const mode = getSettings().whatsapp.mode;
  const t = encodeURIComponent(text);
  if (mode === 'app') return `whatsapp://send?phone=${phone}&text=${t}`;
  if (mode === 'web' || (mode === 'auto' && !isMobile())) return `https://web.whatsapp.com/send?phone=${phone}&text=${t}`;
  return `https://wa.me/${phone}?text=${t}`;
}

export function openChat(phone, text) {
  const url = waUrl(phone, text);
  // Reuse one WhatsApp Web tab on desktop instead of opening a new tab for every message.
  const w = window.open(url, url.startsWith('https://web.whatsapp.com') ? 'whatsapp-web' : '_blank');
  if (!w) location.href = url;
}

async function log(entry) {
  const u = Auth.user();
  try { await idb.write(['waLog'], (t) => t.put('waLog', { id: uuid(), at: nowISO(), userName: u?.name || '', ...entry })); } catch (e) { console.warn('WhatsApp log failed', e); }
}

// ---------- compose dialog ----------
// Opens an editable preview. Resolves true when the message was handed to WhatsApp.
export function compose({ title = 'Send on WhatsApp', name = '', phone = '', text, kind = 'message', partyKind = '', partyId = '', refId = '', refNo = '' }) {
  return new Promise((resolve) => {
    let sent = false;
    const canShare = !!navigator.share;
    const m = UI.modal({
      title,
      body: `<div class="mb-2"><label class="form-label">WhatsApp number${name ? ` — ${esc(name)}` : ''}</label>
          <input class="form-control form-control-lg wa-phone" type="tel" inputmode="tel" value="${esc(phone)}" placeholder="03xx xxxxxxx">
          <div class="form-text wa-phone-hint"></div></div>
        <label class="form-label d-flex justify-content-between"><span>Message</span><span class="small text-body-secondary wa-count"></span></label>
        <textarea class="form-control wa-text font-monospace small" rows="14">${esc(text)}</textarea>
        <div class="form-text">WhatsApp opens with this message typed in. Press <b>Send</b> in WhatsApp to deliver it.</div>
        <div class="alert alert-warning py-2 small mt-2 mb-0 d-none wa-offline"><i class="bi bi-wifi-off me-1"></i>You are offline. WhatsApp needs an internet connection to deliver the message.</div>`,
      footer: `<button class="btn btn-light wa-copy"><i class="bi bi-clipboard me-1"></i>Copy</button>
        ${canShare ? '<button class="btn btn-light wa-share"><i class="bi bi-share me-1"></i>Other app</button>' : ''}
        <button class="btn btn-success flex-grow-1 wa-send"><i class="bi bi-whatsapp me-1"></i>Open in WhatsApp</button>`,
    });
    const $m = m.$el;
    const upd = () => {
      const n = normalizePhone($m.find('.wa-phone').val());
      $m.find('.wa-phone-hint').text(n ? `Will open chat with +${n}` : 'Enter a mobile number, e.g. 0300 1234567');
      $m.find('.wa-count').text(`${$m.find('.wa-text').val().length} characters`);
      $m.find('.wa-offline').toggleClass('d-none', navigator.onLine);
    };
    $m.on('input', '.wa-phone, .wa-text', upd); upd();
    const entry = () => ({ kind, partyKind, partyId, refId, refNo, name, phone: normalizePhone($m.find('.wa-phone').val()), text: $m.find('.wa-text').val() });
    $m.find('.wa-copy').on('click', async () => {
      try { await navigator.clipboard.writeText($m.find('.wa-text').val()); UI.toast('Message copied', 'info', 1500); } catch { $m.find('.wa-text').trigger('select'); document.execCommand?.('copy'); }
    });
    $m.find('.wa-share').on('click', async () => {
      try { await navigator.share({ text: $m.find('.wa-text').val() }); await log({ ...entry(), via: 'share' }); sent = true; m.close(); } catch { /* cancelled */ }
    });
    $m.find('.wa-send').on('click', async () => {
      const e = entry();
      if (!e.phone) { $m.find('.wa-phone').addClass('is-invalid').trigger('focus'); return; }
      if (!e.text.trim()) return;
      openChat(e.phone, e.text);
      sent = true;
      m.close();
      await log({ ...e, via: 'whatsapp' });
    });
    $m.on('shown.bs.modal', () => { if (!phone) $m.find('.wa-phone').trigger('focus'); });
    m.closed.then(() => resolve(sent));
  });
}

// ---------- message builders ----------
const shopVars = () => { const b = getSettings().business; return { shop: b.name, shop_phone: b.phone ? `Contact: ${b.phone}` : '' }; };
const cur = () => getSettings().currency;
const amt = (n) => `${cur()} ${fmtNum(n)}`;
const expShort = (e) => (e ? fmtExpiry(e) : '');

// Customer balance: positive = customer owes the shop. Supplier balance: positive = the shop owes the supplier.
export function balanceText(kind, bal) {
  const v = kind === 'customers' ? bal : -bal;
  if (Math.abs(v) < 0.005) return amt(0);
  return v > 0 ? amt(v) : `${amt(-v)} (advance)`;
}
async function partyBalance(kind, id) { return id ? Posting.accountBalance(Posting.partyAccount(kind, id)) : 0; }

function itemsText(items) {
  return items.map((i, n) => {
    const lines = [`${n + 1}. ${i.name}`, `   ${fmtQty(i.qty)} ${i.unit || ''} × ${fmtNum(i.rate)} = ${fmtNum(i.amount)}${i.discount ? ` (disc ${fmtNum(i.discount)})` : ''}`];
    const bs = (i.batches || []).filter((b) => b.batchNo !== 'OPENING' || b.expiry);
    if (bs.length) lines.push('   ' + bs.map((b) => `Batch ${b.batchNo}${b.expiry ? ` · Exp ${expShort(b.expiry)}` : ''}${bs.length > 1 ? ` (${fmtQty(b.qty)})` : ''}`).join('; '));
    return lines.join('\n');
  }).join('\n');
}

export async function saleMessage(doc) {
  const items = (doc.status === 'void' ? doc.voidedItems || [] : await idb.getAllByIndex('saleItems', 'saleId', doc.id)).sort((a, b) => a.line - b.line);
  const c = doc.customerId ? Catalog.party('customers', doc.customerId) : null;
  const text = render(template('sale'), {
    ...shopVars(), name: doc.customerName, number: doc.number, date: fmtDate(doc.date), items: itemsText(items),
    total: amt(doc.total), discount: doc.discount ? amt(doc.discount) : '', paid: amt(doc.paid), bill_balance: doc.balance > 0.004 ? amt(doc.balance) : '',
    account_balance: c ? balanceText('customers', await partyBalance('customers', c.id)) : '', due_date: doc.dueDate && doc.balance > 0.004 ? fmtDate(doc.dueDate) : '',
  });
  return { text, name: doc.customerName, phone: partyPhone(c), partyKind: c ? 'customers' : '', partyId: c?.id || '', kind: 'sale', refId: doc.id, refNo: doc.number };
}

export async function returnMessage(kind, doc) {
  const partyKind = kind === 'sale' ? 'customers' : 'suppliers';
  const pid = doc.customerId || doc.supplierId || '';
  const p = pid ? Catalog.party(partyKind, pid) : null;
  const text = render(template('saleReturn'), {
    ...shopVars(), name: doc.partyName, number: doc.number, invoice: doc.docNo, date: fmtDate(doc.date), items: itemsText(doc.items),
    total: amt(doc.total), refund: amt(doc.refund), account_balance: p ? balanceText(partyKind, await partyBalance(partyKind, pid)) : '',
  });
  return { text, name: doc.partyName, phone: partyPhone(p), partyKind: p ? partyKind : '', partyId: pid, kind: kind + 'Return', refId: doc.id, refNo: doc.number };
}

export async function voucherMessage(v) {
  const pa = Posting.parseAccount(v.counterAccountId);
  if (pa.kind === 'accounts') throw new AppError('Only receipts from customers and payments to suppliers can be shared.');
  const p = Catalog.party(pa.kind, pa.id);
  const key = pa.kind === 'customers' ? 'receipt' : 'payment';
  const text = render(template(key), {
    ...shopVars(), name: v.counterName, number: v.number, date: fmtDate(v.date), amount: amt(v.amount), method: v.method || v.accountName,
    account_balance: balanceText(pa.kind, await partyBalance(pa.kind, pa.id)),
  });
  return { text, name: v.counterName, phone: partyPhone(p), partyKind: pa.kind, partyId: pa.id, kind: key, refId: v.id, refNo: v.number };
}

export async function reminderMessage(customerId, aging = null) {
  const c = Catalog.party('customers', customerId);
  if (!c) throw new AppError('Customer not found.');
  const a = aging || (await Posting.customerAging()).get(customerId) || { balance: 0, open: [], overdue: 0 };
  const bal = await partyBalance('customers', customerId);
  const bills = a.open.slice(-10).map((o) => `• ${o.refNo || 'Opening'} (${fmtDate(o.date)}): ${fmtNum(o.amount)}${o.dueDate ? ` · due ${fmtDate(o.dueDate)}` : ''}`);
  const text = render(template('reminder'), {
    ...shopVars(), name: c.name, account_balance: balanceText('customers', bal), overdue: a.overdue > 0.004 ? amt(a.overdue) : '',
    due_date: a.oldestDue ? fmtDate(a.oldestDue) : '', open_bills: bills.length ? `Unpaid bills:\n${bills.join('\n')}` : '',
  });
  return { text, name: c.name, phone: partyPhone(c), partyKind: 'customers', partyId: c.id, kind: 'reminder' };
}

export async function statementMessage(kind, id, from, to) {
  const p = Catalog.party(kind, id);
  if (!p) throw new AppError('Party not found.');
  const led = await Posting.ledger(Posting.partyAccount(kind, id), from, to);
  const max = Math.max(5, Number(getSettings().whatsapp.statementRows) || 30);
  const rows = led.rows.slice(-max).map((e) => `${fmtDate(e.date)} ${e.refNo || ''} ${e.memo || ''}\n   ${e.debit ? 'Dr ' + fmtNum(e.debit) : 'Cr ' + fmtNum(e.credit)} → ${balanceText(kind, e.running)}`);
  if (led.rows.length > max) rows.unshift(`… ${led.rows.length - max} earlier entries not shown`);
  const text = render(template('statement'), {
    ...shopVars(), name: p.name, from: fmtDate(from), to: fmtDate(to), opening: balanceText(kind, led.opening),
    rows: rows.join('\n') || 'No transactions in this period.', debit: amt(led.debit), credit: amt(led.credit), closing: balanceText(kind, led.closing),
  });
  return { text, name: p.name, phone: partyPhone(p), partyKind: kind, partyId: id, kind: 'statement' };
}

// ---------- owner alerts ----------
export async function dailySummaryMessage(date = today()) {
  const { todayFigures } = await import('../modules/dashboard.js');
  const f = await todayFigures(date);
  const aging = await Posting.customerAging(date);
  let rec = 0; let overdue = 0;
  for (const a of aging.values()) { if (a.balance > 0) rec += a.balance; overdue += a.overdue; }
  const s = getSettings();
  const exp = expiryCounts();
  const lines = [`*${s.business.name}* — Daily summary`, fmtDate(date), '',
    `Sales: ${amt(f.sales)} (${f.salesCount} bills)`, f.saleReturns ? `Sale returns: ${amt(f.saleReturns)}` : '',
    `Cash/bank received: ${amt(f.cashIn)}`, `Cash/bank paid: ${amt(f.cashOut)}`,
    f.purchases ? `Purchases: ${amt(f.purchases)}` : '', '',
    `Total receivable: ${amt(rec)}`, overdue > 0.004 ? `Overdue: ${amt(overdue)}` : '',
    exp.expired ? `⚠ Expired batches in stock: ${exp.expired}` : '', exp.near ? `⏳ Expiring within ${s.nearExpiryDays} days: ${exp.near}` : ''];
  return { text: lines.filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n').trim(), name: 'Owner', phone: s.whatsapp.ownerPhone, kind: 'owner_summary' };
}

export function expiryCounts() {
  const days = Number(getSettings().nearExpiryDays || 0);
  let expired = 0; let near = 0;
  for (const b of Catalog.allBatches()) {
    if (!(b.qty > 0) || !b.expiry) continue;
    const d = expiryDays(b.expiry);
    if (d < 0) expired++; else if (d <= days) near++;
  }
  return { expired, near };
}

export function expiryAlertMessage() {
  const s = getSettings();
  const days = Number(s.nearExpiryDays || 0);
  const list = Catalog.allBatches().filter((b) => b.qty > 0 && b.expiry && expiryDays(b.expiry) <= days)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const line = (b) => `• ${Catalog.product(b.productId)?.name || '?'} — batch ${b.batchNo}, ${fmtQty(b.qty)} ${Catalog.product(b.productId)?.unit || ''}, exp ${expShort(b.expiry)}`;
  const expired = list.filter((b) => expiryDays(b.expiry) < 0); const near = list.filter((b) => expiryDays(b.expiry) >= 0);
  const text = [`*${s.business.name}* — Expiry alert`, fmtDate(today()), '',
    expired.length ? `*Expired (${expired.length}):*\n${expired.slice(0, 40).map(line).join('\n')}` : 'No expired stock.', '',
    near.length ? `*Expiring within ${days} days (${near.length}):*\n${near.slice(0, 40).map(line).join('\n')}` : `Nothing expires within ${days} days.`].join('\n');
  return { text, name: 'Owner', phone: s.whatsapp.ownerPhone, kind: 'owner_expiry' };
}

export function lowStockMessage() {
  const s = getSettings();
  const low = Catalog.allProducts().filter((p) => p.active && p.trackStock !== false && p.stock <= (p.minStock || 0)).sort((a, b) => a.stock - b.stock);
  const text = [`*${s.business.name}* — Low stock`, fmtDate(today()), '',
    low.length ? low.slice(0, 60).map((p) => `• ${p.name}: ${fmtQty(p.stock)} ${p.unit} (min ${fmtQty(p.minStock || 0)})`).join('\n') : 'All stock levels are fine.'].join('\n');
  return { text, name: 'Owner', phone: s.whatsapp.ownerPhone, kind: 'owner_lowstock' };
}

// ---------- one-call helpers used by screens ----------
async function send(builder, title) {
  try {
    const msg = await builder();
    return await compose({ ...msg, title });
  } catch (e) { UI.toastError(e); return false; }
}
export const shareSale = (doc) => send(() => saleMessage(doc), `Send ${doc.number}`);
export const shareReturn = (kind, doc) => send(() => returnMessage(kind, doc), `Send ${doc.number}`);
export const shareVoucher = (v) => send(() => voucherMessage(v), `Send ${v.number}`);
export const sendReminder = (customerId, aging) => send(() => reminderMessage(customerId, aging), 'Credit reminder');
export const sendStatement = (kind, id, from, to) => send(() => statementMessage(kind, id, from, to), 'Send statement');

// Last message per party and kind (for "reminded 3 days ago").
export async function lastSent(kind) {
  const map = new Map();
  for (const e of await idb.getAll('waLog')) if (e.kind === kind && e.partyId && (!map.get(e.partyId) || e.at > map.get(e.partyId))) map.set(e.partyId, e.at);
  return map;
}
export const money = (n) => amt(round2(n));
