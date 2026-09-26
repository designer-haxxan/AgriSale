// IndexedDB schema definition and migrations.
import { normalizeBatches } from './batches.js';

export const DB_NAME = 'saleapp_pos';
export const DB_VERSION = 2;

// Stores that make up the business data (included in backups).
export const DATA_STORES = [
  'categories', 'products', 'customers', 'suppliers', 'accounts',
  'sales', 'saleItems', 'purchases', 'purchaseItems', 'saleReturns', 'purchaseReturns',
  'vouchers', 'entries', 'stockMoves', 'adjustments', 'holds', 'auditLog', 'meta', 'batches', 'waLog',
];

const STORES = {
  meta: { keyPath: 'key', indexes: {} },
  categories: { indexes: { nameLc: 'nameLc' } },
  products: { indexes: { nameLc: 'nameLc', barcode: 'barcode', sku: 'sku', categoryId: 'categoryId' } },
  customers: { indexes: { nameLc: 'nameLc', phone: 'phone' } },
  suppliers: { indexes: { nameLc: 'nameLc', phone: 'phone' } },
  accounts: { indexes: { type: 'type' } },
  sales: { indexes: { number: ['number', true], date: 'date', customerId: 'customerId' } },
  saleItems: { indexes: { saleId: 'saleId', productId: 'productId', date: 'date' } },
  purchases: { indexes: { number: ['number', true], date: 'date', supplierId: 'supplierId' } },
  purchaseItems: { indexes: { purchaseId: 'purchaseId', productId: 'productId', date: 'date' } },
  saleReturns: { indexes: { number: ['number', true], date: 'date', saleId: 'saleId', customerId: 'customerId' } },
  purchaseReturns: { indexes: { number: ['number', true], date: 'date', purchaseId: 'purchaseId', supplierId: 'supplierId' } },
  vouchers: { indexes: { number: ['number', true], date: 'date', type: 'type' } },
  entries: { indexes: { accountId: 'accountId', txnId: 'txnId', date: 'date', acctDate: [['accountId', 'date'], false] } },
  stockMoves: { indexes: { productId: 'productId', refId: 'refId', date: 'date', prodDate: [['productId', 'date'], false] } },
  adjustments: { indexes: { number: ['number', true], date: 'date' } },
  holds: { indexes: { createdAt: 'createdAt' } },
  auditLog: { indexes: { at: 'at' } },
};

// Added in version 2: batches with expiry dates, and a log of WhatsApp messages.
const STORES_V2 = {
  batches: { indexes: { productId: 'productId', expiry: 'expiry', refId: 'refId' } },
  waLog: { indexes: { at: 'at', partyId: 'partyId' } },
};

export const DEFAULT_CATEGORIES = ['Fertilizer', 'Insecticide', 'Herbicide / Weedicide', 'Fungicide', 'Seed', 'Micronutrient', 'Plant growth regulator'];

export const SYSTEM_ACCOUNTS = [
  { id: 'cash', name: 'Cash in Hand', type: 'cash' },
  { id: 'sales', name: 'Sales', type: 'income' },
  { id: 'sales_returns', name: 'Sales Returns', type: 'income' },
  { id: 'purchases', name: 'Purchases', type: 'expense' },
  { id: 'purchase_returns', name: 'Purchase Returns', type: 'expense' },
  { id: 'tax', name: 'Sales Tax Payable', type: 'liability' },
  { id: 'equity', name: 'Opening Balance Equity', type: 'equity' },
  { id: 'income', name: 'Other Income', type: 'income' },
  { id: 'expense', name: 'General Expenses', type: 'expense' },
];

function createStores(db, defs) {
  for (const [name, def] of Object.entries(defs)) {
    const os = db.createObjectStore(name, { keyPath: def.keyPath || 'id' });
    for (const [idx, spec] of Object.entries(def.indexes)) {
      const [keyPath, unique] = Array.isArray(spec) ? spec : [spec, false];
      os.createIndex(idx, keyPath, { unique: !!unique });
    }
  }
}

// `t` is the raw versionchange transaction, `wt` the same transaction wrapped by idb.wrap.
export function upgrade(db, oldVersion, t, wt) {
  if (oldVersion < 1) {
    createStores(db, STORES);
    const now = new Date().toISOString();
    const acc = t.objectStore('accounts');
    for (const a of SYSTEM_ACCOUNTS) acc.put({ ...a, system: true, active: 1, createdAt: now, updatedAt: now });
    t.objectStore('meta').put({ key: 'schemaVersion', value: 1 });
    t.objectStore('meta').put({ key: 'createdAt', value: now });
  }
  if (oldVersion < 2) {
    createStores(db, STORES_V2);
    t.objectStore('stockMoves').createIndex('batchId', 'batchId', { unique: false });
    t.objectStore('meta').put({ key: 'schemaVersion', value: 2 });
    // Existing stock moves into each product's opening batch; seed crop-input categories on empty databases.
    (async () => {
      await normalizeBatches(wt);
      if (!(await wt.getAll('categories')).length) {
        const now = new Date().toISOString();
        for (const name of DEFAULT_CATEGORIES) {
          await wt.put('categories', { id: crypto.randomUUID ? crypto.randomUUID() : `cat-${name}`, name, nameLc: name.toLowerCase(), createdAt: now, updatedAt: now });
        }
      }
    })().catch((e) => { console.error('Migration to v2 failed', e); t.abort(); });
  }
  // Future migrations: if (oldVersion < 3) { ... }
}
