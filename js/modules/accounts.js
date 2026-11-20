// Chart of accounts (cash, bank, income, expense, other) with ledgers derived from entries.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, today, monthStart } from '../core/utils.js';
import { balText, dateFilter, bindDateFilter, ledgerTable } from '../core/views.js';
import * as Auth from '../services/auth.js';
import * as Posting from '../services/posting.js';
import { printHTML } from '../printer/printer.js';
import { getSettings } from '../core/settings.js';

const $ = window.jQuery;

export async function editAccount(acc = null) {
  const a = acc || { type: 'bank' };
  return UI.formModal({
    title: acc ? `Edit account` : 'New account',
    body: `<div class="row g-2">
      <div class="col-12"><label class="form-label">Type</label><select name="type" class="form-select" ${a.system ? 'disabled' : ''}>${UI.options(Object.entries(Posting.ACCOUNT_TYPES).filter(([k]) => a.system || k !== 'equity').map(([id, name]) => ({ id, name })), a.type)}</select></div>
      <div class="col-12 bank-name"><label class="form-label">Bank Name *</label><input name="bankName" class="form-control" value="${esc(a.bankName || '')}" required></div>
      <div class="col-12 account-title"><label class="form-label">Account Title *</label><input name="accountTitle" class="form-control" value="${esc(a.accountTitle || '')}" required></div>
      <div class="col-12 account-number"><label class="form-label">Account Number</label><input name="accountNumber" class="form-control" value="${esc(a.accountNumber || '')}"></div>
      <div class="col-12 branch"><label class="form-label">Branch (Optional)</label><input name="branch" class="form-control" value="${esc(a.branch || '')}"></div>
      <div class="col-12 other-name"><label class="form-label">Name *</label><input name="name" class="form-control" value="${esc(a.name)}" ${a.system ? 'readonly' : ''} required></div>
      <div class="col-6 ob"><label class="form-label">Opening balance</label><input name="openingBalance" class="form-control" inputmode="decimal" value="${a.openingBalance || ''}" placeholder="0"></div>
      <div class="col-6 ob"><label class="form-label">As of date</label><input type="date" name="openingDate" class="form-control" value="${esc(a.openingDate || today())}"></div>
      <div class="col-12"><label class="form-label">Note</label><input name="note" class="form-control" value="${esc(a.note)}"></div>
      ${acc && !a.system ? `<div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="active" id="ac-active" ${a.active ? 'checked' : ''}><label class="form-check-label" for="ac-active">Active</label></div></div>` : ''}
    </div>`,
    onShown: ($m) => {
      const sync = () => {
        const t = $m.find('[name=type]').val();
        const isBankType = t === 'bank';
        $m.find('.bank-name, .account-title, .account-number, .branch').toggleClass('d-none', !isBankType);
        $m.find('.other-name').toggleClass('d-none', isBankType);
        $m.find('.ob').toggleClass('d-none', ['income', 'expense'].includes(t) || a.id === 'equity');
      };
      $m.on('change', '[name=type]', sync);
      sync();
      const first = $m.find('[name=bankName]:not(.d-none), [name=name]:not(.d-none)').first();
      if (first.length) first.trigger('focus');
    },
    onSubmit: (v) => {
      if (v.type === 'bank') {
        v.name = `${v.bankName} - ${v.accountTitle}${v.branch ? ' (' + v.branch + ')' : ''}`;
      }
      return Posting.saveAccount({ ...v, id: acc?.id, type: v.type || a.type, active: acc ? v.active !== false : true });
    },
  });
}

async function renderList(el) {
  const $el = $(el);
  $el.html(UI.pageHeader('Accounts', `<a class="btn btn-light btn-sm" href="#/vouchers"><i class="bi bi-cash-coin"></i> Cash book</a><button class="btn btn-primary btn-sm btn-add"><i class="bi bi-plus-lg"></i> Add</button>`) + '<div class="groups"></div>');
  const load = async () => {
    const [accs, bal, customers, suppliers] = await Promise.all([idb.getAll('accounts'), Posting.allBalances(), idb.getAll('customers'), idb.getAll('suppliers')]);
    const custMap = new Map(customers.filter((c) => c.active).map((c) => [c.id, c]));
    const suppMap = new Map(suppliers.filter((s) => s.active).map((s) => [s.id, s]));
    let rec = 0; let pay = 0;
    for (const [id, b] of bal) {
      if (id.startsWith('C:') && custMap.has(id.slice(2))) rec += b.balance;
      else if (id.startsWith('S:') && suppMap.has(id.slice(2))) pay -= b.balance;
    }
    const groups = Object.entries(Posting.ACCOUNT_TYPES).map(([type, label]) => {
      const list = accs.filter((a) => a.type === type).sort((a, b) => a.name.localeCompare(b.name));
      if (!list.length) return '';
      const dn = Posting.isDebitNormal(type);
      return `<h2 class="h6 mt-3">${esc(label)}</h2><div class="list-card">${list.map((a) => `<a class="list-row" href="#/accounts/${encodeURIComponent(a.id)}">
        <div class="main"><div class="title">${esc(a.name)} ${a.system ? '<span class="badge text-bg-light border">System</span>' : ''} ${a.active ? '' : '<span class="badge text-bg-secondary">Inactive</span>'}</div>${a.note ? `<div class="sub">${esc(a.note)}</div>` : ''}</div>
        <div class="end fw-semibold money">${balText(bal.get(a.id)?.balance || 0, dn)}</div></a>`).join('')}</div>`;
    }).join('');
    $el.find('.groups').html(`<div class="list-card">
        <a class="list-row" href="#/reports/receivables"><div class="main"><div class="title">Customer receivables</div><div class="sub">All customer accounts</div></div><div class="end fw-semibold money">${balText(rec, true)}</div></a>
        <a class="list-row" href="#/reports/payables"><div class="main"><div class="title">Supplier payables</div><div class="sub">All supplier accounts</div></div><div class="end fw-semibold money">${balText(-pay, false)}</div></a></div>` + groups);
  };
  await load();
  $el.on('click', '.btn-add', async () => { if (await editAccount()) load(); });
  document.addEventListener('data:changed', load);
}

async function renderDetail(el, id) {
  const $el = $(el).off();
  const a = await idb.get('accounts', id);
  if (!a) { $el.html(UI.pageHeader('Account', '', '#/accounts') + UI.emptyState('Account not found', 'x-circle')); return; }
  const dn = Posting.isDebitNormal(a.type);
  let from = monthStart(); let to = today(); let led;
  $el.html(UI.pageHeader(a.name, `<button class="btn btn-light btn-sm btn-edit"><i class="bi bi-pencil"></i></button>
    ${a.system ? '' : '<button class="btn btn-light btn-sm btn-del"><i class="bi bi-trash"></i></button>'}
    <button class="btn btn-light btn-sm btn-print"><i class="bi bi-printer"></i></button>`, '#/accounts') + `
    <div class="card stat-card mb-3"><div class="card-body"><div class="stat-label">${esc(Posting.ACCOUNT_TYPES[a.type])} · current balance</div><div class="stat-value money bal"></div></div></div>
    ${dateFilter(from, to)}<div class="card"><div class="card-body p-0 ledger"></div></div>`);
  const load = async () => {
    $el.find('.bal').html(balText(await Posting.accountBalance(id), dn));
    led = await Posting.ledger(id, from, to);
    $el.find('.ledger').html(ledgerTable(led, { debitNormal: dn }));
  };
  await load();
  bindDateFilter($el, (f, t) => { from = f; to = t; load(); });
  $el.on('click', '.btn-edit', async () => { if (await editAccount(a)) renderDetail(el, id); });
  $el.on('click', '.btn-del', async () => {
    if (!await UI.confirmDialog(`Delete account "${a.name}" and ALL transactions permanently? This cannot be undone.`, { okLabel: 'Delete permanently', okClass: 'btn-danger' })) return;
    try {
      console.log('Starting account deletion for:', id);
      const r = await Posting.deleteAccount(id);
      console.log('Delete result:', r);
      UI.toast('✅ Account and all transactions deleted permanently', 'success');
      document.dispatchEvent(new CustomEvent('data:changed'));
      await new Promise(resolve => setTimeout(resolve, 500));
      location.hash = '#/accounts';
    } catch (e) {
      console.error('Delete error:', e);
      UI.toastError(e);
    }
  });
  $el.on('click', '.btn-print', () => printHTML(`<div class="print-report"><h2>${esc(getSettings().business.name)}</h2><div>Account ledger: <b>${esc(a.name)}</b></div><div>Period: ${from} to ${to}</div><br>${ledgerTable(led, { debitNormal: dn })}</div>`, { page: 'A4' }));
}

export default {
  async render(el, { params }) {
    Auth.require('account.manage');
    if (params[0]) await renderDetail(el, params[0]); else await renderList(el);
  },
};
