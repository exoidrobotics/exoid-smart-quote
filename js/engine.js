// Calculation engine: the ONLY place totals are computed. Every screen and document calls calculate().
// Money is integer centavos. Percentages are plain numbers (10 = 10%).
// Rounding rule: half away from zero, to the centavo, at every line and every percentage.

export const KINDS = ['material', 'labor', 'equipment'];

export function roundCents(x) {
  // Guard against binary noise such as 1089.4999999999 before rounding.
  const v = Number(Number(x).toFixed(6));
  return Math.sign(v) * Math.round(Math.abs(v));
}
export const toCents = (pesos) => roundCents((Number(pesos) || 0) * 100);
export const pct = (cents, percent) => roundCents((cents * (Number(percent) || 0)) / 100);

export function lineAmount(line) {
  const people = line.kind === 'labor' ? (Number(line.people) || 1) : 1;
  return roundCents(toCents(line.unitCost) * (Number(line.qty) || 0) * people);
}

export function calcSystem(sys) {
  const lines = (sys.lines || []).map((l) => ({ ...l, amount: lineAmount(l) }));
  const by = (k) => lines.filter((l) => l.kind === k).reduce((a, l) => a + l.amount, 0);
  const materials = by('material'), labor = by('labor'), equipment = by('equipment');
  const direct = materials + labor + equipment;
  const markupPct = sys.markup && Number(sys.markup.pct) ? Number(sys.markup.pct) : 0;
  const markupAmount = pct(direct, markupPct);
  const unitPrice = direct + markupAmount;
  const qty = sys.qty === undefined || sys.qty === '' ? 1 : Number(sys.qty) || 0;
  return { ...sys, lines, materials, labor, equipment, direct, markupPct, markupAmount, unitPrice, qty,
    amount: roundCents(unitPrice * qty), cost: roundCents(direct * qty) };
}

export function calculate(quote) {
  const all = (quote.systems || []).map(calcSystem);
  const systems = all.filter((s) => s.enabled !== false);
  const subtotal = systems.reduce((a, s) => a + s.amount, 0);

  // Quote-level markups: each on the subtotal, never compounded.
  const markups = (quote.markups || []).filter((m) => Number(m.pct)).map((m) => ({ ...m, amount: pct(subtotal, m.pct) }));
  const markupTotal = markups.reduce((a, m) => a + m.amount, 0);
  const afterMarkups = subtotal + markupTotal;

  let discount = null;
  const d = quote.discount || {};
  if (d.mode === 'percent' && Number(d.value)) {
    const base = d.base === 'afterMarkups' ? afterMarkups : subtotal;
    discount = { label: d.label || 'Discount', mode: 'percent', value: Number(d.value), base: d.base || 'subtotal', amount: -pct(base, d.value) };
  } else if (d.mode === 'amount' && Number(d.value)) {
    discount = { label: d.label || 'Discount', mode: 'amount', value: Number(d.value), amount: -toCents(Math.abs(d.value)) };
  }
  const beforeRounding = afterMarkups + (discount ? discount.amount : 0);

  let adjustment = 0;
  const r = quote.rounding || {};
  if (r.mode === 'target' && r.value !== '' && r.value !== undefined && r.value !== null) {
    adjustment = toCents(r.value) - beforeRounding;
  } else if (r.mode === 'down' && Number(r.value) > 0) {
    const step = toCents(r.value);
    adjustment = Math.floor(beforeRounding / step) * step - beforeRounding;
  }
  const total = beforeRounding + adjustment;

  // Payment stages: last stage absorbs the centavo remainder so stages always sum to the total.
  const stages = (quote.payment || []).map((p) => ({ ...p, amount: pct(total, p.pct) }));
  if (stages.length) {
    const sum = stages.reduce((a, p) => a + p.amount, 0);
    const pctSum = stages.reduce((a, p) => a + (Number(p.pct) || 0), 0);
    if (Math.abs(pctSum - 100) < 1e-9) stages[stages.length - 1].amount += total - sum;
  }
  const paymentPct = stages.reduce((a, p) => a + (Number(p.pct) || 0), 0);

  const cost = systems.reduce((a, s) => a + s.cost, 0);
  const result = { systems, allSystems: all, subtotal, markups, markupTotal, afterMarkups, discount, beforeRounding,
    adjustment, total, payment: stages, paymentPct, profit: { cost, margin: total - cost, marginPct: total ? ((total - cost) / total) * 100 : 0 } };
  result.warnings = warnings(quote, result);
  return result;
}

export function warnings(quote, r) {
  const w = [];
  if (!r.systems.length) w.push({ level: 'error', code: 'no-systems', text: 'No system is switched on.' });
  const sysMarkup = r.systems.some((s) => s.markupPct), quoteMarkup = r.markups.length > 0;
  if (sysMarkup && quoteMarkup) w.push({ level: 'warn', code: 'double-markup', text: 'Markup is applied at both levels (inside a system and on the whole quote). Check this is intended.' });
  for (const s of r.systems) {
    if (s.amount === 0) w.push({ level: 'warn', code: 'zero-system', text: `"${s.name}" is switched on but priced at ₱0.` });
    for (const l of s.lines) {
      if (!Number(l.qty) || !Number(l.unitCost)) w.push({ level: 'info', code: 'zero-line', text: `"${s.name}": line "${l.name || '(no name)'}" has zero quantity or cost.` });
    }
  }
  if (r.payment.length && Math.abs(r.paymentPct - 100) > 1e-9) w.push({ level: 'error', code: 'payment-100', text: `Payment stages total ${fmtPct(r.paymentPct)}, not 100%.` });
  if (!r.payment.length) w.push({ level: 'warn', code: 'no-payment', text: 'No payment schedule.' });
  if (r.discount && -r.discount.amount > r.afterMarkups) w.push({ level: 'error', code: 'discount-big', text: 'Discount is larger than the total.' });
  if (r.total < 0) w.push({ level: 'error', code: 'negative', text: 'Grand total is negative.' });
  if (quote.rounding && quote.rounding.mode && quote.rounding.mode !== 'none' && Math.abs(r.adjustment) > Math.abs(r.beforeRounding) * 0.2)
    w.push({ level: 'warn', code: 'big-adjustment', text: 'The rounding adjustment is more than 20% of the total.' });
  return w;
}

// ---------- formatting ----------
const nf = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtNum = (cents) => (cents < 0 ? '−' : '') + nf.format(Math.abs(cents) / 100);
export const fmtPeso = (cents) => (cents < 0 ? '−' : '') + '₱' + nf.format(Math.abs(cents) / 100);
export const fmtPct = (p) => `${Number((Number(p) || 0).toFixed(4))}%`;
