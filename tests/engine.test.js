// Engine tests. MADE-UP data only. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, calcSystem, lineAmount, roundCents, toCents, pct, fmtPeso, fmtNum } from '../js/engine.js';

const L = (kind, name, qty, unitCost, people) => ({ kind, name, qty, unitCost, people });
const sys = (name, lines, extra = {}) => ({ id: name, name, enabled: true, qty: 1, unit: 'lot', lines, ...extra });

test('rounding: half away from zero, binary noise ignored', () => {
  assert.equal(roundCents(0.5), 1);
  assert.equal(roundCents(-0.5), -1);
  assert.equal(roundCents(108949.99999999999), 108950);
  assert.equal(toCents(1.005), 101);       // 100.49999999999999 in binary
  assert.equal(pct(12345, 10), 1235);      // 1234.5 -> 1235
});

test('line amounts: qty x cost, labor x people, decimal qty', () => {
  assert.equal(lineAmount(L('material', 'Rail', 3.2, 750)), 240000);
  assert.equal(lineAmount(L('labor', 'Tech', 5, 850, 2)), 850000);
  assert.equal(lineAmount(L('equipment', 'Tools', 4, 650, 3)), 260000); // people ignored outside labor
  assert.equal(lineAmount(L('material', 'Blank', '', 100)), 0);
});

test('system: sections, direct cost, system markup, qty', () => {
  const s = calcSystem(sys('Lighting', [L('material', 'Switch', 10, 1000), L('labor', 'Electrician', 10, 800), L('equipment', 'Tools', 2, 650)], { markup: { label: 'CP, OCM', pct: 15 }, qty: 2 }));
  assert.equal(s.materials, 1000000); assert.equal(s.labor, 800000); assert.equal(s.equipment, 130000);
  assert.equal(s.direct, 1930000); assert.equal(s.markupAmount, 289500); assert.equal(s.unitPrice, 2219500);
  assert.equal(s.amount, 4439000); assert.equal(s.cost, 3860000);
});

test('quote: markups on subtotal do not compound; disabled systems excluded', () => {
  const q = { systems: [sys('A', [L('material', 'x', 1, 50000)]), sys('B', [L('material', 'y', 1, 30000)], { enabled: false })],
    markups: [{ code: 'OCM', label: 'OCM', pct: 10 }, { code: 'CP', label: 'CP', pct: 20 }], payment: [{ name: 'All', pct: 100 }] };
  const r = calculate(q);
  assert.equal(r.subtotal, 5000000);
  assert.deepEqual(r.markups.map((m) => m.amount), [500000, 1000000]);
  assert.equal(r.total, 6500000);
  assert.equal(r.systems.length, 1);
});

test('discount: percent of subtotal (default), percent after markups, fixed amount', () => {
  const base = { systems: [sys('A', [L('material', 'x', 1, 100000)])], markups: [{ label: 'CP', pct: 25 }], payment: [{ name: 'All', pct: 100 }] };
  assert.equal(calculate({ ...base, discount: { mode: 'percent', value: 3 } }).total, 12500000 - 300000);
  assert.equal(calculate({ ...base, discount: { mode: 'percent', value: 10, base: 'afterMarkups' } }).total, 12500000 - 1250000);
  assert.equal(calculate({ ...base, discount: { mode: 'amount', value: 5000 } }).total, 12500000 - 500000);
});

test('rounding adjustment: to a target and down to a step', () => {
  const base = { systems: [sys('A', [L('material', 'x', 1, 141635)])], payment: [{ name: 'All', pct: 100 }] };
  const t = calculate({ ...base, rounding: { mode: 'target', value: 140000 } });
  assert.equal(t.adjustment, -163500); assert.equal(t.total, 14000000);
  const d = calculate({ ...base, rounding: { mode: 'down', value: 10000 } });
  assert.equal(d.total, 14000000);
});

test('payment stages always add up to the total (remainder on last stage)', () => {
  const q = { systems: [sys('A', [L('material', 'x', 1, 100000.01)])], payment: [{ name: 'a', pct: 33.33 }, { name: 'b', pct: 33.33 }, { name: 'c', pct: 33.34 }] };
  const r = calculate(q);
  assert.equal(r.payment.reduce((a, p) => a + p.amount, 0), r.total);
});

test('warnings: double markup, zero system, payment not 100%', () => {
  const q = { systems: [sys('A', [L('material', 'x', 1, 1000)], { markup: { pct: 10 } }), sys('Empty', [])],
    markups: [{ label: 'CP', pct: 20 }], payment: [{ name: 'a', pct: 40 }, { name: 'b', pct: 30 }] };
  const codes = calculate(q).warnings.map((w) => w.code);
  assert.ok(codes.includes('double-markup'));
  assert.ok(codes.includes('zero-system'));
  assert.ok(codes.includes('payment-100'));
});

test('formatting: peso sign, thousands, negative', () => {
  assert.equal(fmtPeso(10895000), '₱108,950.00');
  assert.equal(fmtPeso(-163500), '−₱1,635.00');
  assert.equal(fmtNum(5), '0.05');
});
