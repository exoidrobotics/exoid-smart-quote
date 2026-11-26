// PDF documents. Everything comes from one calculate() result, so documents cannot disagree.
import { calculate, fmtPeso, fmtNum, fmtPct } from '../engine.js';

const ORANGE = '#F7941D', INK = '#1B1B1F', GREY = '#6B6B73', LINE = '#E3E3E8', TINT = '#FFF4E6', ZEBRA = '#FAFAFB';
const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso + (String(iso).length === 10 ? 'T00:00:00' : '')); return isNaN(d) ? '' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }); };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + (Number(n) || 0)); return d.toISOString().slice(0, 10); };

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
}
async function pdfMakeReady() {
  if (!(window.pdfMake && window.pdfMake.createPdf)) await loadScript('vendor/pdfmake/pdfmake.min.js');
  if (!(window.pdfMake.vfs && window.pdfMake.vfs['Inter-Regular.otf'])) await loadScript('vendor/pdfmake/vfs_inter.js');
  return window.pdfMake;
}
async function toDataUrl(src) {
  if (src.startsWith('data:')) return src;
  const b = await (await fetch(src)).blob();
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
}

// ---------- text helpers ----------
export function fill(text, ctx) {
  return String(text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), ctx);
    return v == null ? '' : String(v);
  });
}
function richText(text, opts = {}) {
  // Paragraphs separated by blank lines; lines starting with "- " become bullets.
  const out = []; let bullets = [];
  const flush = () => { if (bullets.length) { out.push({ ul: bullets.map((b) => ({ text: b, margin: [0, 1, 0, 1] })), margin: [0, 0, 0, 6], ...opts }); bullets = []; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*[-•]\s+/.test(line)) { bullets.push(line.replace(/^\s*[-•]\s+/, '')); continue; }
    flush();
    if (line.trim()) out.push({ text: line, margin: [0, 0, 0, 5], ...opts });
  }
  flush();
  return out;
}

// ---------- shared blocks ----------
function ctxFor(q, s, r) {
  const signer = s.signatories.find((x) => x.id === q.preparedBy) || s.signatories[0] || { name: '', position: '' };
  const contractSigner = s.signatories.find((x) => x.id === (s.contract && s.contract.signatoryId)) || signer;
  const validUntil = q.quoteDate ? addDays(q.quoteDate, q.validityDays) : '';
  const conforme = { name: (q.conforme && q.conforme.name) || q.client.name || '', title: (q.conforme && q.conforme.title) || 'Owner' };
  const scopeList = r.systems.map((x) => `- ${x.name}${x.description ? ': ' + x.description : ''}`).join('\n');
  const paymentList = r.payment.map((p) => `- ${fmtPct(p.pct)} ${p.name} (${fmtPeso(p.amount)})${p.due ? ': ' + p.due : ''}`).join('\n');
  const t = { client: q.client, project: q.project, company: s.company, quote: { number: q.number || 'DRAFT', rev: q.rev || 0 },
    total: fmtPeso(r.total), date: fmtDate(q.quoteDate), validUntil: fmtDate(validUntil), warrantyPeriod: s.texts.warrantyPeriod || '', scopeList, paymentList };
  t.warranty = fill(s.texts.warranty, t);
  return { q, s, r, signer, contractSigner, validUntil, conforme, t, ref: `${q.number || 'DRAFT'} · Rev ${q.rev || 0}` };
}
const th = (t, a) => ({ text: t, bold: true, fontSize: 7.5, color: INK, alignment: a || 'left' });
const tableLayout = { hLineWidth: (i, n) => (i === 0 || i === 1 || i === n.table.body.length ? 0.8 : 0.4), vLineWidth: () => 0,
  hLineColor: (i) => (i <= 1 ? INK : LINE), paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 4, paddingRight: () => 4,
  fillColor: (row) => (row > 0 && row % 2 === 0 ? ZEBRA : null) };
function docTitle(title, sub) {
  return { margin: [0, 0, 0, 10], columns: [{ width: '*', text: title, bold: true, fontSize: 15 }, { width: 'auto', text: sub || '', bold: true, fontSize: 8.5, color: ORANGE, margin: [0, 5, 0, 0] }] };
}
function infoBlock(c) {
  const kv = (k, v) => (v ? [{ text: k, fontSize: 7, color: GREY }, { text: v, fontSize: 8.5, margin: [0, 0, 0, 4] }] : []);
  const { q } = c;
  return { columns: [
    { width: '*', stack: [...kv('Client', q.client.name || '—'), ...kv('Project', q.project.name), ...kv('Project address', q.project.address || q.client.address)] },
    { width: '*', stack: [...kv('General contractor', q.gc && q.gc.name), ...kv('Project type', q.project.type), ...kv('Prepared by', `${c.signer.name}${c.signer.position ? ', ' + c.signer.position : ''}`)] },
    { width: 120, stack: [...kv('Quotation no.', c.ref), ...kv('Date', fmtDate(q.quoteDate)), ...kv('Valid until', fmtDate(c.validUntil))] }], columnGap: 14, margin: [0, 0, 0, 12] };
}
function totalsBlock(r, width = 260) {
  const row = (k, v, o = {}) => [{ text: k, fontSize: 8.5, color: o.c || INK }, { text: v, fontSize: 8.5, alignment: 'right', color: o.c || INK, noWrap: true }];
  const body = [row('Subtotal', fmtPeso(r.subtotal))];
  r.markups.forEach((m) => body.push(row(`${m.label || m.code} (${fmtPct(m.pct)} of subtotal)`, fmtPeso(m.amount))));
  if (r.discount) body.push(row(r.discount.label + (r.discount.mode === 'percent' ? ` (${fmtPct(r.discount.value)}${r.discount.base === 'afterMarkups' ? '' : ' of subtotal'})` : ''), fmtPeso(r.discount.amount)));
  if (r.adjustment) { body.push(row('Total before adjustment', fmtPeso(r.beforeRounding), { c: GREY })); body.push(row('Rounding adjustment', fmtPeso(r.adjustment))); }
  return { columns: [{ width: '*', text: '' }, { width, stack: [
    { table: { widths: ['*', 'auto'], body }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 2, paddingBottom: () => 2 } },
    { table: { widths: ['*', 'auto'], body: [[{ text: 'GRAND TOTAL (VAT exclusive)', bold: true, color: '#FFFFFF', fontSize: 9.5 }, { text: fmtPeso(r.total), bold: true, color: '#FFFFFF', fontSize: 11, alignment: 'right', noWrap: true }]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => INK, paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 8, paddingRight: () => 8 }, margin: [0, 4, 0, 0] }] }], margin: [0, 8, 0, 0], unbreakable: true };
}
function signatures(c, left = 'Prepared by', signer = c.signer) {
  const box = (label, name, pos) => ({ width: '*', stack: [{ text: label, fontSize: 7.5, color: GREY }, { text: ' ', margin: [0, 18, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.6, lineColor: INK }] },
    { text: name || ' ', fontSize: 8.5, bold: true, margin: [0, 3, 0, 0] }, { text: pos, fontSize: 7.5, color: GREY }] });
  return { columns: [box(left, signer.name, `${signer.position ? signer.position + ', ' : ''}${c.s.company.name}`), box('Conforme', c.conforme.name, `${c.conforme.title} · Date: ____________`)], margin: [0, 26, 0, 0], unbreakable: true };
}
const sectionLabel = (t) => ({ text: t.toUpperCase(), bold: true, fontSize: 8, color: ORANGE, characterSpacing: 0.4, margin: [0, 12, 0, 4] });

// ---------- documents ----------
function boq(c) {
  const { r } = c;
  const body = [[th('No.'), th('Item / description'), th('Qty', 'right'), th('Unit'), th('Materials', 'right'), th('Labor', 'right'), th('Equipment', 'right'), th('Unit price', 'right'), th('Amount', 'right')]];
  r.systems.forEach((x, i) => body.push([{ text: String(i + 1), bold: true },
    { stack: [{ text: x.name, bold: true }, x.description ? { text: x.description, fontSize: 7.5, color: GREY } : null, x.where ? { text: 'Where: ' + x.where, fontSize: 7, color: GREY, italics: true } : null].filter(Boolean) },
    { text: String(x.qty), alignment: 'right' }, x.unit || '', { text: fmtNum(x.materials), alignment: 'right' }, { text: fmtNum(x.labor), alignment: 'right' },
    { text: fmtNum(x.equipment), alignment: 'right' }, { text: fmtNum(x.unitPrice), alignment: 'right' }, { text: fmtNum(x.amount), alignment: 'right', bold: true }]));
  const anySysMarkup = r.systems.some((x) => x.markupPct);
  return [docTitle('Bill of Quantities', 'EXHIBIT A'), infoBlock(c),
    { table: { headerRows: 1, dontBreakRows: true, widths: [16, '*', 22, 24, 54, 48, 48, 56, 60], body }, layout: tableLayout },
    totalsBlock(r),
    { text: `Unit price = materials + labor + equipment${anySysMarkup ? ' + system markup' : ''}. Details of each item are in Exhibit B.`, fontSize: 7, color: GREY, margin: [0, 8, 0, 0] },
    c.q.remarks ? [sectionLabel('Remarks'), ...richText(c.q.remarks, { fontSize: 8.5 })] : null,
    signatures(c)];
}
function dupa(c) {
  const out = [];
  c.r.systems.forEach((x, i) => {
    const sec = (title, kind) => {
      const ls = x.lines.filter((l) => l.kind === kind);
      if (!ls.length) return [];
      const labor = kind === 'labor';
      const head = labor ? [th('Description'), th('People', 'right'), th('Qty', 'right'), th('Unit'), th('Rate', 'right'), th('Amount', 'right')]
        : [th('Description'), th('Location / notes'), th('Qty', 'right'), th('Unit'), th('Unit cost', 'right'), th('Amount', 'right')];
      const rows = ls.map((l) => labor
        ? [l.name, { text: String(l.people || 1), alignment: 'right' }, { text: String(l.qty), alignment: 'right' }, l.unit || '', { text: fmtNum(Math.round(Number(l.unitCost) * 100)), alignment: 'right' }, { text: fmtNum(l.amount), alignment: 'right' }]
        : [{ stack: [l.name, l.brand ? { text: l.brand, fontSize: 7, color: GREY } : null].filter(Boolean) }, { text: l.location || '', color: GREY, fontSize: 7.5 }, { text: String(l.qty), alignment: 'right' }, l.unit || '', { text: fmtNum(Math.round(Number(l.unitCost) * 100)), alignment: 'right' }, { text: fmtNum(l.amount), alignment: 'right' }]);
      const tot = ls.reduce((a, l) => a + l.amount, 0);
      rows.push([{ text: `Subtotal, ${title.toLowerCase()}`, bold: true, colSpan: 5 }, {}, {}, {}, {}, { text: fmtNum(tot), bold: true, alignment: 'right' }]);
      return [sectionLabel(title), { table: { headerRows: 1, dontBreakRows: true, widths: labor ? ['*', 40, 34, 56, 56, 64] : ['*', 120, 30, 34, 56, 64], body: [head, ...rows] }, layout: tableLayout }];
    };
    const sum = [['A. Materials', x.materials], ['B. Labor', x.labor], ['C. Equipment', x.equipment]].map(([k, v]) => [k, { text: fmtNum(v), alignment: 'right' }]);
    sum.push([{ text: 'Direct cost (A + B + C)', bold: true }, { text: fmtNum(x.direct), alignment: 'right', bold: true }]);
    if (x.markupPct) sum.push([`${x.markup.label || 'Markup'} (${fmtPct(x.markupPct)})`, { text: fmtNum(x.markupAmount), alignment: 'right' }]);
    sum.push([{ text: `Unit price carried to Exhibit A, item ${i + 1}`, bold: true, color: '#FFFFFF', fillColor: INK }, { text: fmtPeso(x.unitPrice), alignment: 'right', bold: true, color: '#FFFFFF', fillColor: INK, noWrap: true }]);
    out.push({ stack: [docTitle('Detailed Unit Price Analysis', `EXHIBIT B · ITEM ${i + 1}`), i === 0 ? infoBlock(c) : null,
      { text: `${i + 1}. ${x.name}${x.description ? ': ' + x.description : ''}`, bold: true, fontSize: 10.5, margin: [0, 0, 0, 2] },
      { text: `Quantity: ${x.qty} ${x.unit || ''}${x.where ? '   ·   Where: ' + x.where : ''}`, fontSize: 7.5, color: GREY },
      ...sec('Materials', 'material'), ...sec('Labor', 'labor'), ...sec('Equipment', 'equipment'),
      x.lines.length ? null : { text: 'No lines.', color: GREY, margin: [0, 8, 0, 0] },
      { columns: [{ width: '*', text: '' }, { width: 260, table: { widths: ['*', 'auto'], body: sum }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 6, paddingRight: () => 6 } }], margin: [0, 12, 0, 0], unbreakable: true },
      i === c.r.systems.length - 1 ? signatures(c) : null].filter(Boolean), pageBreak: i > 0 ? 'before' : undefined });
  });
  return out;
}
function proforma(c) {
  const { r, s } = c;
  const body = [[th('No.'), th('System'), th('Amount', 'right')], ...r.systems.map((x, i) => [String(i + 1), x.name, { text: fmtNum(x.amount), alignment: 'right' }])];
  const pb = [[th('Stage'), th('Share', 'right'), th('Amount', 'right'), th('Due')],
    ...r.payment.map((p) => [{ text: p.name, bold: true }, { text: fmtPct(p.pct), alignment: 'right' }, { text: fmtPeso(p.amount), alignment: 'right', noWrap: true }, p.due || '']),
    [{ text: 'Total', bold: true }, { text: fmtPct(r.paymentPct), alignment: 'right', bold: true }, { text: fmtPeso(r.payment.reduce((a, p) => a + p.amount, 0)), alignment: 'right', bold: true, noWrap: true }, '']];
  const b = s.bank || {};
  return [docTitle('Proforma Invoice', 'PAYMENT SCHEDULE'), infoBlock(c),
    { table: { headerRows: 1, dontBreakRows: true, widths: [24, '*', 90], body }, layout: tableLayout }, totalsBlock(r),
    r.payment.length ? [sectionLabel('Payment schedule'), { table: { headerRows: 1, dontBreakRows: true, widths: ['*', 44, 90, 170], body: pb }, layout: tableLayout }] : null,
    { margin: [0, 14, 0, 0], unbreakable: true, table: { widths: ['*'], body: [[{ stack: [{ text: 'PAYMENT CHANNEL', bold: true, fontSize: 8, color: ORANGE },
      { columns: [{ width: 'auto', stack: ['Bank', 'Account name', 'Account number'].map((k) => ({ text: k, fontSize: 8, color: GREY })) },
        { width: '*', stack: [b.bank, b.accountName, b.accountNumber].map((v) => ({ text: v || '—', fontSize: 8.5, bold: true })), margin: [12, 0, 0, 0] }], margin: [0, 4, 0, 0] },
      b.notes ? { text: b.notes, fontSize: 8, color: GREY, margin: [0, 4, 0, 0] } : null].filter(Boolean) }]] },
      layout: { hLineColor: () => LINE, vLineColor: () => LINE, fillColor: () => TINT, paddingLeft: () => 10, paddingTop: () => 8, paddingBottom: () => 8 } },
    signatures(c)];
}
function proposal(c, logo) {
  const { q, r, s, t } = c;
  const h2 = (txt) => ({ text: txt, bold: true, fontSize: 12.5, margin: [0, 14, 0, 5] });
  const cover = [
    { image: logo, fit: [130, 110], margin: [0, 10, 0, 0] },
    { text: 'Smart Home Proposal', color: '#FFFFFF', bold: true, fontSize: 30, margin: [0, 230, 0, 0] },
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 90, h: 4, color: ORANGE }], margin: [0, 14, 0, 0] },
    { text: q.project.name || 'Smart home project', color: ORANGE, fontSize: 15, bold: true, margin: [0, 14, 0, 4] },
    { text: `Prepared for ${q.client.name || '—'}`, color: '#E5E5E5', fontSize: 10.5 },
    { text: `${c.ref} · ${fmtDate(q.quoteDate)} · Valid until ${fmtDate(c.validUntil)}`, color: '#AAAAAA', fontSize: 8.5, margin: [0, 4, 0, 0] },
    { text: '', pageBreak: 'after' }];
  const included = r.systems.filter((x) => !/^general/i.test(x.key || '') && !/^general requirements$/i.test(x.name));
  const body = [
    h2('1. Overview'), ...richText(fill(s.texts.proposalIntro, t), { fontSize: 9.5, lineHeight: 1.3 }),
    h2('2. What is included'),
    ...included.map((x) => ({ margin: [0, 0, 0, 7], unbreakable: true, columns: [{ width: 8, canvas: [{ type: 'rect', x: 0, y: 2, w: 3, h: 24, color: ORANGE }] },
      { width: '*', stack: [{ text: x.name, bold: true, fontSize: 10 }, ...richText(x.clientDescription || x.description, { fontSize: 8.5, color: '#444444' }), x.where ? { text: 'Where: ' + x.where, fontSize: 8, color: GREY, italics: true } : null].filter(Boolean) }] })),
    h2('3. Investment'),
    { table: { headerRows: 1, widths: ['*', 110], body: [[th('System'), th('Amount', 'right')], ...r.systems.map((x) => [x.name, { text: fmtPeso(x.amount), alignment: 'right', noWrap: true }])] }, layout: tableLayout },
    totalsBlock(r),
    { text: 'Itemized prices are in the attached Bill of Quantities (Exhibit A) and Detailed Unit Price Analysis (Exhibit B).', fontSize: 7.5, color: GREY, margin: [0, 6, 0, 0] },
    h2('4. Payment terms'), ...richText(t.paymentList, { fontSize: 9.5 }),
    h2('5. Warranty and after-sales service'), ...richText(t.warranty, { fontSize: 9, lineHeight: 1.25 }),
    s.texts.exclusions ? [h2('6. Exclusions'), ...richText(fill(s.texts.exclusions, t), { fontSize: 9, lineHeight: 1.25 })] : null,
    { unbreakable: true, stack: [h2(s.texts.exclusions ? '7. Acceptance' : '6. Acceptance'), { text: 'By signing below, the client accepts this proposal and its attached exhibits.', fontSize: 9.5 },
      s.texts.proposalClosing ? { text: fill(s.texts.proposalClosing, t), fontSize: 9, color: GREY, margin: [0, 6, 0, 0] } : null, signatures(c)].filter(Boolean) }];
  return { cover, body };
}
function contract(c) {
  const { s, t } = c;
  const k = s.contract || { title: 'Contract', clauses: [] };
  const parties = { columns: [
    { width: '*', stack: [{ text: 'Contractor', fontSize: 7.5, color: GREY }, { text: s.company.legalName || s.company.name, bold: true }, s.company.address, [s.company.phone, s.company.email].filter(Boolean).join(' · ')].filter(Boolean) },
    { width: '*', stack: [{ text: 'Client', fontSize: 7.5, color: GREY }, { text: c.q.client.name || '—', bold: true }, c.q.client.address, [c.q.client.phone, c.q.client.email].filter(Boolean).join(' · ')].filter(Boolean) }], columnGap: 20, margin: [0, 0, 0, 6], fontSize: 8.5 };
  return [docTitle(k.title || 'Contract', 'ANNEX A'), parties,
    { text: [{ text: 'Project location: ', color: GREY }, c.q.project.address || c.q.client.address || '—'], fontSize: 8.5, margin: [0, 0, 0, 8] },
    ...k.clauses.map((cl, i) => ({ stack: [{ text: `${i + 1}. ${cl.title}`, bold: true, fontSize: 10.5, margin: [0, 8, 0, 4] }, ...richText(fill(cl.body, t), { fontSize: 9, lineHeight: 1.25 })] })),
    { text: 'Attached: Exhibit A (Bill of Quantities) and Exhibit B (Detailed Unit Price Analysis).', fontSize: 8, color: GREY, margin: [0, 10, 0, 0] },
    signatures(c, 'Contractor', c.contractSigner)];
}

// ---------- assemble ----------
export async function buildDocDefinition(keys, q, s, logoUrl) {
  const r = calculate(q);
  const c = ctxFor(q, s, r);
  const logo = await toDataUrl(logoUrl || s.company.logo || 'assets/logo.png');
  const order = ['proposal', 'boq', 'dupa', 'proforma', 'contract'].filter((k) => keys.includes(k));
  const content = []; let hasCover = false;
  order.forEach((k, i) => {
    const brk = content.length ? { text: '', pageBreak: 'before' } : null;
    if (k === 'proposal') { const p = proposal(c, logo); hasCover = i === 0; if (brk) content.push(brk); content.push(...p.cover, ...p.body); return; }
    if (brk) content.push(brk);
    content.push(...{ boq, dupa, proforma, contract }[k](c).flat().filter(Boolean));
  });
  return {
    pageSize: 'A4', pageMargins: [40, 86, 40, 44], info: { title: `${c.ref} ${q.client.name || ''}`.trim(), author: s.company.name, subject: 'Quotation' },
    defaultStyle: { font: 'Inter', fontSize: 8.5, color: INK, lineHeight: 1.15 },
    background: (page) => (hasCover && page === 1 ? { stack: [{ canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 841.89, color: INK }] },
      { text: [s.company.name, s.company.phone, s.company.email, s.company.website].filter(Boolean).join('   ·   '), color: '#999999', fontSize: 8, absolutePosition: { x: 40, y: 800 } }] } : null),
    header: (page) => (hasCover && page === 1 ? null : { margin: [40, 22, 40, 0], stack: [
      { columns: [{ image: logo, fit: [70, 40], width: 76 },
        { width: '*', stack: [{ text: (s.company.name || '').toUpperCase(), bold: true, fontSize: 11, characterSpacing: 1.2 }, { text: [s.company.phone, s.company.email, s.company.website].filter(Boolean).join('  ·  '), fontSize: 7, color: GREY, margin: [0, 2, 0, 0] }], margin: [4, 8, 0, 0] },
        { width: 'auto', alignment: 'right', stack: [{ text: c.ref, bold: true, fontSize: 9 }, { text: q.client.name || '', fontSize: 7.5, color: GREY, margin: [0, 2, 0, 0] }], margin: [0, 8, 0, 0] }] },
      { canvas: [{ type: 'rect', x: 0, y: 6, w: 515.28, h: 2, color: ORANGE }] }] }),
    footer: (page, count) => (hasCover && page === 1 ? null : { margin: [40, 10, 40, 0], columns: [
      { text: 'All amounts in Philippine pesos, VAT exclusive. No VAT is charged.', fontSize: 7, color: GREY },
      { text: `Page ${page} of ${count}`, fontSize: 7, color: GREY, alignment: 'right' }] }),
    content,
  };
}

export async function buildPdf(keys, q, s) {
  const pdfMake = await pdfMakeReady();
  const dd = await buildDocDefinition(keys, q, s);
  const name = `${q.number || 'DRAFT'} Rev${q.rev || 0} ${q.client.name || ''}`.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf';
  const blob = await new Promise((res, rej) => { try { pdfMake.createPdf(dd).getBlob(res); } catch (e) { rej(e); } });
  return { blob, name };
}
