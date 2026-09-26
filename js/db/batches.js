// Batch bookkeeping shared by the schema migration, backup restore and maintenance tools.
// Every stock movement of a stock-tracked product belongs to a batch. A batch's qty is a cache of
// the sum of its movements, exactly like product.stock is a cache of the product's movements.

const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

// Opening stock and stock that existed before batches were introduced live in this batch.
export const openingBatchId = (productId) => 'ob:' + productId;

export function openingBatch(product, now = new Date().toISOString()) {
  return {
    id: openingBatchId(product.id), productId: product.id, batchNo: 'OPENING', batchNoLc: 'opening', expiry: '', mfgDate: '',
    cost: product.purchasePrice || 0, qty: 0, refId: 'open:' + product.id, refNo: 'OPENING', createdAt: now, updatedAt: now,
  };
}

// Assigns batch-less movements to the product's opening batch and recomputes every batch qty.
// `t` is a wrapped transaction (see idb.wrap) over products, batches and stockMoves.
export async function normalizeBatches(t) {
  const [products, batches, moves] = await Promise.all([t.getAll('products'), t.getAll('batches'), t.getAll('stockMoves')]);
  const byId = new Map(batches.map((b) => [b.id, b]));
  const prodById = new Map(products.map((p) => [p.id, p]));
  const now = new Date().toISOString();
  const sums = new Map();
  let fixed = 0;
  for (const m of moves) {
    const p = prodById.get(m.productId);
    if (!m.batchId || !byId.has(m.batchId)) {
      if (!p) continue;
      const id = openingBatchId(p.id);
      if (!byId.has(id)) { const b = openingBatch(p, now); byId.set(id, b); await t.put('batches', b); }
      m.batchId = id;
      await t.put('stockMoves', m);
      fixed++;
    }
    sums.set(m.batchId, r3((sums.get(m.batchId) || 0) + m.qty));
  }
  for (const b of byId.values()) {
    const q = sums.get(b.id) || 0;
    if (Math.abs((b.qty || 0) - q) > 0.0005) { b.qty = q; b.updatedAt = now; await t.put('batches', b); fixed++; }
  }
  return fixed;
}
