// In-memory product/category/party cache for instant search. IndexedDB remains the source of truth.
import * as idb from '../db/idb.js';
import { lc, today } from '../core/utils.js';

const products = new Map();
const batchesByProduct = new Map(); // productId → batches with stock, First-Expiry-First-Out order
const categories = new Map();
const byBarcode = new Map();
const parties = { customers: new Map(), suppliers: new Map() };

function indexProduct(p) {
  const old = products.get(p.id);
  if (old?.barcode) byBarcode.delete(lc(old.barcode));
  products.set(p.id, p);
  if (p.barcode) byBarcode.set(lc(p.barcode), p);
  p._s = lc([p.name, p.sku, p.barcode, p.company, p.activeIngredient, p.packSize, categories.get(p.categoryId)?.name].filter(Boolean).join(' '));
}

const fefo = (a, b) => (a.expiry || '9999-12-31').localeCompare(b.expiry || '9999-12-31') || (a.createdAt || '').localeCompare(b.createdAt || '');
function setBatches(productId, list) {
  const live = list.filter((b) => Math.abs(b.qty || 0) > 0.0005).sort(fefo);
  if (live.length) batchesByProduct.set(productId, live); else batchesByProduct.delete(productId);
}

export async function load() {
  const [ps, cs, cus, sups, bs] = await idb.read(['products', 'categories', 'customers', 'suppliers', 'batches'], (t) =>
    Promise.all([t.getAll('products'), t.getAll('categories'), t.getAll('customers'), t.getAll('suppliers'), t.getAll('batches')]));
  products.clear(); categories.clear(); byBarcode.clear(); parties.customers.clear(); parties.suppliers.clear(); batchesByProduct.clear();
  cs.forEach((c) => categories.set(c.id, c));
  ps.forEach(indexProduct);
  const grouped = new Map();
  for (const b of bs) { if (!grouped.has(b.productId)) grouped.set(b.productId, []); grouped.get(b.productId).push(b); }
  for (const [pid, list] of grouped) setBatches(pid, list);
  cus.forEach((c) => parties.customers.set(c.id, c));
  sups.forEach((s) => parties.suppliers.set(s.id, s));
}

export async function refreshProducts(ids) {
  const [fresh, bl] = await idb.read(['products', 'batches'], (t) => Promise.all([
    Promise.all(ids.map((id) => t.get('products', id))),
    Promise.all(ids.map((id) => t.getAllByIndex('batches', 'productId', id))),
  ]));
  ids.forEach((id, i) => {
    setBatches(id, bl[i]);
    if (fresh[i]) indexProduct(fresh[i]);
    else { const old = products.get(id); if (old?.barcode) byBarcode.delete(lc(old.barcode)); products.delete(id); }
  });
}
export async function refreshCategories() {
  const cs = await idb.getAll('categories');
  categories.clear(); cs.forEach((c) => categories.set(c.id, c));
  products.forEach(indexProduct);
}
export async function refreshParty(kind, id) {
  const p = await idb.get(kind, id);
  if (p) parties[kind].set(id, p); else parties[kind].delete(id);
}

export const product = (id) => products.get(id);
export const allProducts = () => [...products.values()];
// Batches in stock for a product, earliest expiry first (the order FEFO sells them in).
export const batches = (productId) => batchesByProduct.get(productId) || [];
export const allBatches = () => [...batchesByProduct.values()].flat();
// First batch FEFO would sell today (skipping expired ones unless allowed).
export function nextBatch(productId, allowExpired = false) {
  const on = today();
  return batches(productId).find((b) => b.qty > 0 && (allowExpired || !b.expiry || b.expiry >= on)) || null;
}
// Earliest expiry among batches in stock.
export const nearestExpiry = (productId) => batches(productId).find((b) => b.qty > 0 && b.expiry)?.expiry || '';
export const category = (id) => categories.get(id);
export const allCategories = () => [...categories.values()].sort((a, b) => a.name.localeCompare(b.name));
export const party = (kind, id) => parties[kind].get(id);
export const allParties = (kind) => [...parties[kind].values()];

export function findByCode(code) {
  const c = lc(code);
  if (!c) return null;
  const p = byBarcode.get(c);
  if (p && p.active) return p;
  for (const x of products.values()) if (x.active && x.sku && lc(x.sku) === c) return x;
  return null;
}

export function searchProducts(q, { limit = 40, categoryId = null, includeInactive = false } = {}) {
  const terms = lc(q).split(/\s+/).filter(Boolean);
  const out = [];
  for (const p of products.values()) {
    if (!includeInactive && !p.active) continue;
    if (categoryId && p.categoryId !== categoryId) continue;
    if (terms.every((t) => p._s.includes(t))) {
      out.push(p);
      if (!terms.length && out.length >= limit * 4) break;
    }
  }
  const q0 = lc(q);
  out.sort((a, b) => {
    const ea = (lc(a.barcode) === q0 || lc(a.sku) === q0) ? 0 : 1;
    const eb = (lc(b.barcode) === q0 || lc(b.sku) === q0) ? 0 : 1;
    return ea - eb || a.name.localeCompare(b.name);
  });
  return out.slice(0, limit);
}

export function searchParties(kind, q, limit = 50) {
  const terms = lc(q).split(/\s+/).filter(Boolean);
  return allParties(kind)
    .filter((p) => p.active && terms.every((t) => lc(`${p.name} ${p.phone || ''} ${p.whatsapp || ''} ${p.address || ''} ${p.email || ''}`).includes(t)))
    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}
