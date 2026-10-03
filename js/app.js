// Application bootstrap: service worker, database, authentication gate, navigation and routing.
import { CONFIG } from './config.js';
import { applyTheme, getSettings } from './core/settings.js';
import * as UI from './core/ui.js';
import { esc } from './core/utils.js';
import { openDB } from './db/idb.js';
import * as Auth from './services/auth.js';
import * as Catalog from './services/catalog.js';
import { buildLoginScene } from './core/fx.js';

const $ = window.jQuery;

// Route table: name → [loader, title, permission|null, icon, menu section]
const ROUTES = {
  dashboard: [() => import('./modules/dashboard.js'), 'Dashboard', null, 'house', 'Main'],
  pos: [() => import('./modules/pos.js'), 'New Sale', 'sale.create', 'cart-plus', 'Main'],
  sales: [() => import('./modules/documents.js'), 'Sales', null, 'receipt', 'Main'],
  purchase: [() => import('./modules/pos.js'), 'New Purchase', 'purchase.manage', null, null],
  purchases: [() => import('./modules/documents.js'), 'Purchases', 'purchase.manage', 'bag', 'Main'],
  returns: [() => import('./modules/documents.js'), 'Returns', null, 'arrow-return-left', 'Main'],
  products: [() => import('./modules/products.js'), 'Products', null, 'box-seam', 'Inventory'],
  stock: [() => import('./modules/stock.js'), 'Stock', null, 'boxes', 'Inventory'],
  expiry: [() => import('./modules/stock.js'), 'Expiry & batches', null, 'hourglass-split', 'Inventory'],
  customers: [() => import('./modules/parties.js'), 'Customers', null, 'people', 'Parties'],
  suppliers: [() => import('./modules/parties.js'), 'Suppliers', 'purchase.manage', 'truck', 'Parties'],
  whatsapp: [() => import('./modules/whatsapp.js'), 'WhatsApp', null, 'whatsapp', 'Parties'],
  vouchers: [() => import('./modules/vouchers.js'), 'Cash Book & Payments', 'voucher.create', 'cash-coin', 'Accounts'],
  accounts: [() => import('./modules/accounts.js'), 'Accounts', 'account.manage', 'bank', 'Accounts'],
  reports: [() => import('./reports/reports.js'), 'Reports', 'reports.view', 'bar-chart-line', 'Accounts'],
  backup: [() => import('./modules/backup.js'), 'Backup & Restore', 'backup.export', 'cloud-arrow-down', 'Administration'],
  settings: [() => import('./modules/settings.js'), 'Settings', null, 'gear', 'Administration'],
};
const FOCUS_ROUTES = new Set(['pos', 'purchase']);

let currentModule = null;
let routeToken = 0;
let deferredInstall = null;

function showView(name) {
  $('#splash').addClass('d-none');
  $('#view-login').toggleClass('d-none', name !== 'login');
  $('#view-app').toggleClass('d-none', name !== 'app');
}

function fatal(msg) {
  $('#splash-error').text(msg);
  $('#splash .spinner-border').addClass('d-none');
}

// ---------- Service worker & install ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    const promptUpdate = (w) => {
      const $t = $(`<div class="toast show text-bg-dark border-0" role="alert"><div class="d-flex align-items-center p-2 gap-2">
        <div class="toast-body py-1">A new version is available.</div>
        <button class="btn btn-sm btn-primary ms-auto">Update</button></div></div>`);
      $t.find('button').on('click', () => w.postMessage({ type: 'SKIP_WAITING' }));
      $('#toast-container').append($t);
    };
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(w); });
    });
    setInterval(() => navigator.onLine && reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => console.warn('Service worker registration failed:', e));
  // Reload only when an update replaced an existing worker (not on the very first install).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; $('#install-btn').removeClass('d-none'); });
window.addEventListener('appinstalled', () => { deferredInstall = null; $('#install-btn').addClass('d-none'); UI.toast('App installed'); });
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null; $('#install-btn').addClass('d-none');
  return true;
}
export const canInstall = () => !!deferredInstall;

// ---------- Connection badge ----------
function renderConn(status) {
  const map = { online: ['wifi', 'Online'], offline: ['wifi-off', 'Offline'] };
  const [icon, label] = map[status] || map.offline;
  $('#conn-badge').attr('class', `badge rounded-pill conn-${status}`).html(`<i class="bi bi-${icon}"></i> <span>${label}</span>`);
  $('#login-conn').html(navigator.onLine ? '<i class="bi bi-wifi text-success"></i> Online' : '<i class="bi bi-wifi-off text-danger"></i> Offline — connect to the internet to sign in');
}
window.addEventListener('online', () => renderConn('online'));
window.addEventListener('offline', () => renderConn('offline'));

// ---------- Navigation ----------
function buildMenu() {
  let html = ''; let section = '';
  for (const [name, [, title, perm, icon, sec]] of Object.entries(ROUTES)) {
    if (!sec || (perm && !Auth.can(perm))) continue;
    if (sec !== section) { section = sec; html += `<div class="nav-section">${esc(sec)}</div>`; }
    html += `<a class="nav-link" href="#/${name}" data-route="${name}"><i class="bi bi-${icon}"></i>${esc(title)}</a>`;
  }
  $('.nav-menu').html(html);
  const u = Auth.user();
  $('#user-name').text(u.name);
  $('#user-role').text(Auth.ROLES[u.role] || u.role);
  $('#brand-name').text(getSettings().business.name || CONFIG.APP_NAME);
  $('#bottom-nav [data-route="pos"]').toggleClass('d-none', !Auth.can('sale.create'));
}

async function route() {
  if (!Auth.user()) return;
  if (checkExpiry()) return;
  const token = ++routeToken;
  const bar = document.getElementById('route-bar');
  if (bar) { bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run'); }
  const parts = (location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard').split('/').map(decodeURIComponent);
  const name = ROUTES[parts[0]] ? parts[0] : 'dashboard';
  const [loader, title, perm] = ROUTES[name];
  try { currentModule?.destroy?.(); } catch (e) { console.warn(e); }
  currentModule = null;
  bootstrap.Offcanvas.getInstance('#menu-offcanvas')?.hide();
  $('.nav-menu .nav-link, #bottom-nav a').removeClass('active');
  $(`.nav-menu [data-route="${name}"], #bottom-nav [data-route="${name}"]`).addClass('active');
  $('body').toggleClass('focus-mode', FOCUS_ROUTES.has(name));
  $('#topbar-title').text(title);
  const $c = $('#content').off();
  if (perm && !Auth.can(perm)) { $c.html(UI.emptyState('You do not have permission to open this page.', 'shield-lock')); return; }
  $c.html(UI.spinner());
  try {
    const mod = (await loader()).default;
    if (token !== routeToken) return;
    currentModule = mod;
    window.scrollTo(0, 0);
    await mod.render($c[0], { route: name, params: parts.slice(1), setTitle: (t) => $('#topbar-title').text(t) });
  } catch (e) {
    console.error(e);
    if (token === routeToken) $c.html(UI.errorState(e));
  }
}

// ---------- Auth gate ----------
async function startApp() {
  await Catalog.load();
  buildMenu();
  showView('app');
  renderConn(navigator.onLine ? 'online' : 'offline');
  clearInterval(expiryTimer);
  expiryTimer = setInterval(checkExpiry, 60000);
  if (navigator.storage?.persist) navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });
  route();
}

async function doLogout(forced = false, reason = '') {
  if (!forced && !await UI.confirmDialog('Log out of this device? Your POS data stays on this device, but signing in again requires an internet connection.', { okLabel: 'Log out', okClass: 'btn-danger' })) return;
  clearInterval(expiryTimer);
  try { currentModule?.destroy?.(); } catch { /* ignore */ }
  currentModule = null;
  Auth.logout();
  $('#content').empty();
  showLogin(reason);
}

// Sessions are valid until expiresAt (set by the server); after that an online sign-in is required.
let expiryTimer = null;
function checkExpiry() {
  if (!Auth.sessionExpired()) return false;
  UI.toast('Your session has expired. Please sign in again.', 'warning', 6000);
  doLogout(true, 'Your session has expired. Connect to the internet and sign in again.');
  return true;
}

function showLogin(reason = '') {
  buildLoginScene(document.getElementById('login-scene'));
  showView('login');
  renderConn(navigator.onLine ? 'online' : 'offline');
  const notices = [];
  if (reason) notices.push(esc(reason));
  $('#login-notice').toggleClass('d-none', !notices.length).html(notices.join('<br>'));
  setTimeout(() => $('#login-username').trigger('focus'), 50);
}

$('#login-form').on('submit', async (e) => {
  e.preventDefault();
  const $btn = $('#login-btn').prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Signing in…');
  $('#login-error').addClass('d-none');
  try {
    await Auth.login($('#login-username').val(), $('#login-password').val());
    $('#login-password').val('');
    await startApp();
  } catch (err) {
    $('#login-error').text(err.message || String(err)).removeClass('d-none');
    $('.login-card').removeClass('shake'); void $('.login-card')[0].offsetWidth; $('.login-card').addClass('shake');
  } finally { $btn.prop('disabled', false).text('Sign in'); }
});
$('#toggle-pw').on('click', () => {
  const $i = $('#login-password'); const show = $i.attr('type') === 'password';
  $i.attr('type', show ? 'text' : 'password');
  $('#toggle-pw i').attr('class', show ? 'bi bi-eye-slash' : 'bi bi-eye');
});
$('#logout-btn').on('click', () => doLogout(false));
$('#install-btn').on('click', promptInstall);
window.addEventListener('hashchange', route);
document.addEventListener('settings:changed', () => { applyTheme(); if (Auth.user()) $('#brand-name').text(getSettings().business.name || CONFIG.APP_NAME); });
document.addEventListener('auth:changed', () => { if (Auth.user()) buildMenu(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------- Boot ----------
(async function boot() {
  applyTheme();
  registerSW();
  if (!window.jQuery || !window.bootstrap) return fatal('Required libraries failed to load. Connect to the internet once so the app can be cached for offline use.');
  try { await openDB(); } catch (e) { return fatal('Could not open the local database: ' + (e.message || e)); }
  const { user, reason } = Auth.restoreSession();
  if (user) {
    try { await startApp(); } catch (e) { console.error(e); fatal(e.message || String(e)); }
  } else showLogin(reason);
})();
