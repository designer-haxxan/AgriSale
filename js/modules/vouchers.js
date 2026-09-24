// Cash book: receipts, payments and transfers between cash/bank accounts.
import * as idb from '../db/idb.js';
import * as UI from '../core/ui.js';
import { esc, fmtNum, fmtDate, fmtDateTime, today, uuid, num, AppError } from '../core/utils.js';
import { money, balText, dateFilter, bindDateFilter, pager } from '../core/views.js';
import * as Auth from '../services/auth.js';
import * as Catalog from '../services/catalog.js';
import * as Posting from '../services/posting.js';
import * as Printer from '../printer/printer.js';

const $ = window.jQuery;
const TYPES = { receipt: ['Receive', 'Received from', 'arrow-down-circle', 'success'], payment: ['Pay', 'Paid to', 'arrow-up-circle', 'danger'], transfer: ['Transfer', 'To account', 'arrow-left-right', 'primary'] };

async function counterOptions(type, q) {
  const accounts = (await idb.getAll('accounts')).filter((a) => a.active);
  const bal = await Posting.allBalances();
  const ql = q.toLowerCase();
  const out = [];
  if (type === 'transfer') {
    accounts.filter((a) => ['cash', 'bank'].includes(a.type)).forEach((a) => out.push({ id: a.id, title: a.name, subtitle: 'Cash/Bank', right: fmtNum(bal.get(a.id)?.balance || 0) }));
  } else {
    Catalog.searchParties('customers', q, 30).forEach((p) => out.push({ id: 'C:' + p.id, title: p.name, subtitle: 'Customer' + (p.phone ? ' · ' + p.phone : ''), right: balText(bal.get('C:' + p.id)?.balance || 0, true).replace(/&amp;/g, '&') }));
    if (Auth.can('purchase.manage')) Catalog.searchParties('suppliers', q, 30).forEach((p) => out.push({ id: 'S:' + p.id, title: p.name, subtitle: 'Supplier' + (p.phone ? ' · ' + p.phone : ''), right: balText(bal.get('S:' + p.id)?.balance || 0, false).replace(/&amp;/g, '&') }));
    if (Auth.can('account.manage')) {
      accounts.filter((a) => !['cash', 'bank'].includes(a.type) && !['sales', 'sales_returns', 'purchases', 'purchase_returns'].includes(a.id))
        .forEach((a) => out.push({ id: a.id, title: a.name, subtitle: Posting.ACCOUNT_TYPES[a.type] + ' account', right: '' }));
    }
    // Show customers first for receipts, suppliers/expenses first for payments
    if (type === 'payment') out.sort((a, b) => (a.subtitle.startsWith('Customer') ? 1 : 0) - (b.subtitle.startsWith('Customer') ? 1 : 0));
  }
  return out.filter((o) => !ql || `${o.title} ${o.subtitle}`.toLowerCase().includes(ql)).slice(0, 60);
}

async function nameOf(accId) {
  const pa = Posting.parseAccount(accId);
  if (pa.kind === 'accounts') return (await idb.get('accounts', accId))?.name || accId;
  return Catalog.party(pa.kind, pa.id)?.name || accId;
}

// Opens the voucher dialog. Returns the saved voucher or null.
export async function newVoucher({ type = 'receipt', counterAccountId = null, accountId = null } = {}) {
  const payAccounts = (await idb.getAll('accounts')).filter((a) => ['cash', 'bank'].includes(a.type) && a.active);
  let counter = counterAccountId ? { id: counterAccountId, title: await nameOf(counterAccountId) } : null;
  const id = uuid();
  const allowed = Object.keys(TYPES).filter((t) => Auth.can(t === 'receipt' ? 'voucher.create' : 'account.manage'));
  if (!allowed.includes(type)) type = allowed[0];
  let saved = null;
  await UI.formModal({
    title: 'Cash book entry', submitLabel: 'Save',
    body: `<div class="btn-group w-100 mb-3" role="group">${allowed.map((t) => `<input type="radio" class="btn-check" name="type" id="vt-${t}" value="${t}" ${t === type ? 'checked' : ''}><label class="btn btn-outline-${TYPES[t][3]}" for="vt-${t}"><i class="bi bi-${TYPES[t][2]} me-1"></i>${TYPES[t][0]}</label>`).join('')}</div>
      <label class="form-label v-counter-label"></label>
      <button type="button" class="btn btn-light w-100 text-start mb-2 v-counter"><span></span><i class="bi bi-chevron-right float-end"></i></button>
      <div class="row g-2">
        <div class="col-6"><label class="form-label v-acc-label">Account</label><select name="accountId" class="form-select">${UI.options(payAccounts, accountId || 'cash')}</select></div>
        <div class="col-6"><label class="form-label">Amount</label><input name="amount" class="form-control money" inputmode="decimal" required></div>
        <div class="col-6"><label class="form-label">Date</label><input type="date" name="date" class="form-control" value="${today()}" ${Auth.can('account.manage') ? '' : 'readonly'} max="${today()}"></div>
        <div class="col-6"><label class="form-label">Method / Ref</label><input name="method" class="form-control" placeholder="Cash, cheque no…"></div>
        <div class="col-12"><label class="form-label">Note</label><input name="note" class="form-control"></div>
        <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="print" id="v-print"><label class="form-check-label" for="v-print">Print receipt</label></div></div>
      </div>`,
    onShown: ($m) => {
      const sync = () => {
        const t = $m.find('[name=type]:checked').val();
        $m.find('.v-counter-label').text(TYPES[t][1]);
        $m.find('.v-acc-label').text(t === 'transfer' ? 'From account' : t === 'receipt' ? 'Into account' : 'From account');
        $m.find('.v-counter span').html(counter ? esc(counter.title) : '<span class="text-body-secondary">Select…</span>');
      };
      $m.on('change', '[name=type]', () => { counter = null; sync(); });
      $m.find('.v-counter').on('click', async () => {
        const t = $m.find('[name=type]:checked').val();
        const bs = bootstrap.Modal.getInstance($m[0]);
        // Temporarily hide this dialog while picking to avoid stacked modals.
        $m.addClass('d-none'); $('.modal-backdrop').last().addClass('d-none');
        const r = await UI.pick({ title: TYPES[t][1], search: (q) => counterOptions(t, q) });
        $m.removeClass('d-none'); $('.modal-backdrop').first().removeClass('d-none');
        if (r) counter = r;
        sync();
        bs?.handleUpdate();
        $m.find('[name=amount]').trigger('focus');
      });
      sync();
      if (counter) $m.find('[name=amount]').trigger('focus');
    },
    onSubmit: async (v) => {
      if (!counter) throw new AppError('Select who/what this entry is for.');
      if (!(num(v.amount) > 0)) throw new AppError('Enter an amount greater than zero.');
      const { doc } = await Posting.saveVoucher({ id, type: v.type, date: v.date, accountId: v.accountId, counterAccountId: counter.id, amount: v.amount, method: v.method, note: v.note });
      saved = doc;
      UI.toast(`${doc.number} saved`);
      if (v.print) setTimeout(() => Printer.printDocument('voucher', doc), 300);
      return doc;
    },
  });
  return saved;
}

async function renderList(el) {
  const $el = $(el);
  let from = today(); let to = today();
  const btn = (t) => Auth.can(t === 'receipt' ? 'voucher.create' : 'account.manage') ? `<button class="btn btn-sm btn-${TYPES[t][3]} btn-new" data-type="${t}"><i class="bi bi-${TYPES[t][2]}"></i><span class="d-none d-sm-inline ms-1">${TYPES[t][0]}</span></button>` : '';
  $el.html(UI.pageHeader('Cash Book', btn('receipt') + btn('payment') + btn('transfer')) + `
    <div class="row g-2 mb-3 acc-cards"></div>
    ${dateFilter(from, to, `<div><label class="form-label small mb-0">Type</label><select name="type" class="form-select form-select-sm"><option value="">All</option><option value="receipt">Receipts</option><option value="payment">Payments</option><option value="transfer">Transfers</option></select></div>`)}
    <div class="small text-body-secondary mb-2 summary"></div>
    <div class="list-card list"></div>`);
  const load = async (type = '') => {
    const bal = await Posting.allBalances();
    const accs = (await idb.getAll('accounts')).filter((a) => ['cash', 'bank'].includes(a.type) && a.active);
    $el.find('.acc-cards').html(accs.map((a) => `<div class="col-6 col-md-3"><a class="card stat-card text-decoration-none" href="${Auth.can('account.manage') ? `#/accounts/${encodeURIComponent(a.id)}` : '#/vouchers'}"><div class="card-body py-2">
      <div class="stat-label text-truncate">${esc(a.name)}</div><div class="stat-value money">${money(bal.get(a.id)?.balance || 0)}</div></div></a></div>`).join(''));
    const list = (await idb.getAllByIndex('vouchers', 'date', IDBKeyRange.bound(from, to))).filter((v) => !type || v.type === type)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const live = list.filter((v) => v.status !== 'void');
    const sum = (t) => live.filter((v) => v.type === t).reduce((s, v) => s + v.amount, 0);
    $el.find('.summary').html(`${list.length} entries · Received <b>${money(sum('receipt'))}</b> · Paid <b>${money(sum('payment'))}</b>`);
    pager($el.find('.list'), list, (v) => `<a class="list-row" href="#/vouchers/${encodeURIComponent(v.id)}">
      <div class="thumb text-${TYPES[v.type][3]}"><i class="bi bi-${TYPES[v.type][2]}"></i></div>
      <div class="main"><div class="title">${esc(v.counterName)} ${v.status === 'void' ? '<span class="badge text-bg-danger">Void</span>' : ''}</div><div class="sub">${esc(v.number)} · ${fmtDate(v.date)} · ${esc(v.accountName)}${v.note ? ' · ' + esc(v.note) : ''}</div></div>
      <div class="end fw-semibold money text-${TYPES[v.type][3]}">${v.type === 'payment' ? '−' : ''}${fmtNum(v.amount)}</div></a>`, 50, UI.emptyState('No cash book entries in this period', 'cash-coin'));
  };
  bindDateFilter($el, (f, t, fd) => { from = f; to = t; load(fd.type); });
  $el.on('click', '.btn-new', async function () { if (await newVoucher({ type: this.dataset.type })) load($el.find('[name=type]').val()); });
  await load();
}

async function renderDetail(el, id) {
  const $el = $(el).off();
  const v = await idb.get('vouchers', id);
  if (!v) { $el.html(UI.pageHeader('Voucher', '', '#/vouchers') + UI.emptyState('Voucher not found', 'x-circle')); return; }
  const [, partyLabel, icon, color] = TYPES[v.type];
  const entries = await idb.getAllByIndex('entries', 'txnId', v.id);
  const cp = Posting.parseAccount(v.counterAccountId);
  const counterLink = cp.kind === 'accounts' ? (Auth.can('account.manage') ? `#/accounts/${encodeURIComponent(v.counterAccountId)}` : null) : `#/${cp.kind}/${encodeURIComponent(cp.id)}`;
  $el.html(UI.pageHeader(v.number, `<button class="btn btn-light btn-sm btn-print"><i class="bi bi-printer"></i> Print</button>
      ${v.status !== 'void' && Auth.can('voucher.void') ? `<button class="btn btn-outline-danger btn-sm btn-void"><i class="bi bi-x-circle"></i> Void</button>` : ''}`, '#/vouchers') + `
    ${v.status === 'void' ? `<div class="alert alert-danger">Voided ${fmtDateTime(v.voidedAt)} by ${esc(v.voidedBy)}${v.voidReason ? ': ' + esc(v.voidReason) : ''}</div>` : ''}
    <div class="card mb-3"><div class="card-body">
      <div class="d-flex align-items-center gap-3 mb-3"><i class="bi bi-${icon} text-${color} display-6"></i><div><div class="text-body-secondary small">${{ receipt: 'Money received', payment: 'Payment made', transfer: 'Transfer' }[v.type]}</div><div class="h4 mb-0 money">${money(v.amount)}</div></div></div>
      <dl class="row mb-0 small">
        <dt class="col-5 col-sm-3">${partyLabel}</dt><dd class="col-7 col-sm-9">${counterLink ? `<a href="${counterLink}">${esc(v.counterName)}</a>` : esc(v.counterName)}</dd>
        <dt class="col-5 col-sm-3">${v.type === 'receipt' ? 'Into account' : 'From account'}</dt><dd class="col-7 col-sm-9">${esc(v.accountName)}</dd>
        <dt class="col-5 col-sm-3">Date</dt><dd class="col-7 col-sm-9">${fmtDate(v.date)}</dd>
        ${v.method ? `<dt class="col-5 col-sm-3">Method / Ref</dt><dd class="col-7 col-sm-9">${esc(v.method)}</dd>` : ''}
        ${v.note ? `<dt class="col-5 col-sm-3">Note</dt><dd class="col-7 col-sm-9">${esc(v.note)}</dd>` : ''}
        <dt class="col-5 col-sm-3">Entered by</dt><dd class="col-7 col-sm-9">${esc(v.userName)} · ${fmtDateTime(v.createdAt)}</dd>
      </dl></div></div>
    ${entries.length ? `<h2 class="h6">Ledger entries</h2><div class="list-card mb-3">${(await Promise.all(entries.map(async (e) => `<div class="list-row"><div class="main"><div class="title">${esc(await nameOf(e.accountId))}</div><div class="sub">${esc(e.memo)}</div></div><div class="end money">${e.debit ? 'Dr ' + fmtNum(e.debit) : 'Cr ' + fmtNum(e.credit)}</div></div>`))).join('')}</div>` : ''}`);
  $el.on('click', '.btn-print', () => Printer.printDocument('voucher', v));
  $el.on('click', '.btn-void', async () => {
    if (!await UI.confirmDialog(`Void ${v.number}? Its ledger entries will be reversed. This cannot be undone.`, { okLabel: 'Void', okClass: 'btn-danger' })) return;
    try { await Posting.voidDocument('voucher', v.id); UI.toast('Voucher voided'); renderDetail(el, id); } catch (e) { UI.toastError(e); }
  });
}

export default {
  async render(el, { params }) {
    if (params[0]) await renderDetail(el, params[0]); else await renderList(el);
  },
};

