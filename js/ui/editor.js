import { api } from '../api.js';
import { app, page, handleError, silentHash } from '../main.js';
import { calculate, calcSystem, fmtPeso, fmtNum, fmtPct, KINDS } from '../engine.js';
import { h, mount, field, select, sw, toast, modal, confirmBox, uid, clone, fmtDate, addDays, download } from './dom.js';

const KIND_LABEL = { material: 'Materials', labor: 'Labor', equipment: 'Equipment' };
const KIND_ONE = { material: 'material', labor: 'labor', equipment: 'equipment' };
export const DOCS = [['proposal', 'Proposal'], ['boq', 'Bill of Quantities (Exhibit A)'], ['dupa', 'Detailed Unit Price Analysis (Exhibit B)'], ['proforma', 'Proforma Invoice'], ['contract', 'Contract (Annex A)']];

export function blankQuote() {
  const s = app.settings, d = s.defaults;
  return {
    client: { name: '', address: '', phone: '', email: '' }, project: { name: '', address: '', type: (d.projectTypes || [])[0] || '' },
    gc: { name: '', rep: '', phone: '', email: '' }, validityDays: d.validityDays || 30, quoteDate: new Date().toISOString().slice(0, 10),
    preparedBy: (s.signatories[0] || {}).id || '', conforme: { name: '', title: 'Owner' }, remarks: '',
    systems: s.systemTypes.map((t) => newSystem(t, false)),
    markups: clone((s.markupPresets[0] || { markups: [] }).markups).map((m) => ({ id: uid('mk'), ...m })),
    discount: { mode: 'none', value: '', base: 'subtotal', label: 'Discount' }, rounding: { mode: 'none', value: '' },
    payment: clone((s.paymentPresets[0] || { stages: [] }).stages).map((p) => ({ id: uid('pay'), ...p })),
    docs: { proposal: true, boq: true, dupa: true, proforma: true, contract: false },
  };
}
export function newSystem(t, enabled = true) {
  return { id: uid('sys'), key: t.key || '', name: t.name, description: t.description || '', clientDescription: t.clientDescription || '', unit: t.unit || 'lot', qty: 1, enabled, where: '', markup: { label: 'CP, OCM', pct: 0 }, lines: [] };
}
const lineFromCatalog = (it, qty = 1) => ({ id: uid('ln'), kind: it.kind, name: it.name, brand: it.brand || '', unit: it.unit, unitCost: it.unitCost, qty, people: 1, location: '', catalogId: it.id });

export async function renderEditor(id) {
  page('quotes', h('div', { class: 'empty' }, 'Loading…'));
  let q;
  try { q = id ? await api.getQuote(id) : blankQuote(); } catch (e) { return handleError(e); }
  if (!id && app.pendingDemo) {
    const d = app.pendingDemo; app.pendingDemo = null;
    Object.assign(q, { client: d.client, project: d.project });
    q.systems = q.systems.map((s) => d.systems.find((x) => x.key === s.key) || s);
  }
  editor(normalize(q));
}

function normalize(q) {
  q.systems = q.systems || []; q.markups = q.markups || []; q.payment = q.payment || [];
  for (const s of q.systems) { s.markup = s.markup || { label: 'CP, OCM', pct: 0 }; s.lines = s.lines || []; if (s.qty === undefined) s.qty = 1; }
  for (const m of q.markups) m.id = m.id || uid('mk');
  for (const p of q.payment) p.id = p.id || uid('pay');
  q.discount = q.discount || { mode: 'none', value: '', base: 'subtotal', label: 'Discount' };
  q.rounding = q.rounding || { mode: 'none', value: '' };
  q.client = q.client || {}; q.project = q.project || {}; q.gc = q.gc || {}; q.conforme = q.conforme || { name: '', title: 'Owner' };
  q.docs = q.docs || { proposal: true, boq: true, dupa: true, proforma: true, contract: false };
  return q;
}

function editor(q) {
  let orig = JSON.stringify(q);
  let tab = 'systems', showProfit = false, saving = false;
  const open = new Set(q.systems.filter((s) => s.enabled).slice(0, 1).map((s) => s.id));
  const ro = () => q.status && q.status !== 'draft';
  const dirty = () => (q.id ? JSON.stringify(q) !== orig : !!(q.client.name || q.project.name || q.systems.some((x) => x.enabled)));
  const refs = {};                       // live-updating text nodes
  app.guard = async () => !dirty() || confirmBox('Unsaved changes', 'You have unsaved changes. Leave without saving?', 'Leave', true);
  const markDirty = () => { app.dirty = dirty(); refresh(); };

  // ----- inputs bound to the model -----
  const bind = (obj, key, attrs = {}, cast) => h(attrs.multiline ? 'textarea' : 'input', { ...attrs, multiline: null, value: obj[key] ?? '', disabled: ro(),
    oninput: (e) => { obj[key] = cast ? cast(e.target.value) : e.target.value; markDirty(); } });
  const numIn = (obj, key, attrs = {}) => bind(obj, key, { type: 'number', step: 'any', inputmode: 'decimal', class: 'num', ...attrs }, (v) => (v === '' ? '' : Number(v)));

  // ----- header & layout -----
  const title = h('div');
  const saveBtn = h('button', { class: 'btn-brand', onclick: () => doSave() }, 'Save');
  const tabsEl = h('div', { class: 'tabs' });
  const body = h('div');
  const summary = h('div', { class: 'card card-pad summary stack' });
  const mobileTotal = h('div', { class: 'mobile-total' });
  const frozenBar = h('div');
  const head = h('div', { class: 'page-head' }, h('div', { class: 'row' }, h('a', { href: '#/quotes', class: 'btn btn-ghost' }, '←'), title), h('div', { class: 'row' }, saveBtn));
  page('quotes', head, frozenBar, h('div', { class: 'editor' }, h('div', null, tabsEl, body), summary), mobileTotal);
  document.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && document.body.contains(saveBtn)) { e.preventDefault(); doSave(); } };

  function drawHead() {
    mount(title, h('div', null, h('h1', null, q.number ? `${q.number}` : 'New quote', q.rev ? h('span', { class: 'muted' }, ` · Rev ${q.rev}`) : null, ' ', q.status ? h('span', { class: 'chip ' + q.status }, q.status) : null),
      h('div', { class: 'small muted' }, [q.client.name, q.project.name].filter(Boolean).join(' · ') || 'Fill in the client and tick the systems')));
    saveBtn.disabled = ro() || saving; saveBtn.textContent = saving ? 'Saving…' : dirty() || !q.id ? 'Save' : 'Saved';
    mount(frozenBar, ro() ? h('div', { class: 'card card-pad row between', style: { marginBottom: '12px', background: '#EEF4FB', borderColor: '#C9DCF2' } },
      h('div', null, h('strong', null, `Revision ${q.rev} was marked as ${q.status}${q.sentAt ? ' on ' + fmtDate(q.sentAt) : ''}.`), ' It is frozen exactly as sent.'),
      h('div', { class: 'row' }, statusSelect(), h('button', { class: 'btn-primary', onclick: newRevision }, 'Create revision ' + ((q.rev || 0) + 1)))) : null);
  }
  function drawTabs() {
    const r = calculate(q), errs = r.warnings.filter((w) => w.level === 'error').length;
    mount(tabsEl, [['details', 'Client & project'], ['systems', `Systems (${r.systems.length})`], ['pricing', 'Pricing & payment'], ['documents', 'Documents']].map(([k, l]) =>
      h('button', { class: tab === k ? 'active' : '', onclick: () => { tab = k; drawTabs(); drawBody(); } }, l, k === 'pricing' && errs ? h('span', { class: 'badge' }, errs) : null)));
  }
  function drawBody() { mount(body, { details, systems, pricing, documents }[tab]()); refresh(); }

  // ----- live refresh (no re-render of inputs) -----
  function refresh() {
    const r = calculate(q);
    for (const s of r.allSystems) {
      if (refs['sys' + s.id]) refs['sys' + s.id].textContent = s.enabled === false ? 'off' : fmtPeso(s.amount);
      for (const k of KINDS) if (refs['sec' + s.id + k]) refs['sec' + s.id + k].textContent = fmtNum(s[k === 'material' ? 'materials' : k]);
      for (const l of s.lines) if (refs['ln' + l.id]) refs['ln' + l.id].textContent = fmtNum(l.amount);
      if (refs['dir' + s.id]) mount(refs['dir' + s.id], sysTotals(s));
    }
    for (const m of r.markups) if (refs['mk' + m.id]) refs['mk' + m.id].textContent = fmtPeso(m.amount);
    for (const p of r.payment) if (refs['pay' + p.id]) refs['pay' + p.id].textContent = fmtPeso(p.amount);
    if (refs.payPct) { refs.payPct.textContent = fmtPct(r.paymentPct); refs.payPct.style.color = Math.abs(r.paymentPct - 100) < 1e-9 ? 'var(--ok)' : 'var(--err)'; }
    if (refs.pricing) mount(refs.pricing, totalsRows(r));
    drawSummary(r); drawHead();
    mount(mobileTotal, h('span', null, 'Total (VAT ex.)'), h('span', null, fmtPeso(r.total)));
  }
  function totalsRows(r) {
    const row = (k, v, cls) => h('div', { class: 'sum-row ' + (cls || '') }, h('span', null, k), h('span', { class: 'num' }, v));
    return [row('Subtotal', fmtPeso(r.subtotal)), ...r.markups.map((m) => row(`${m.label || m.code} (${fmtPct(m.pct)})`, fmtPeso(m.amount))),
      r.discount ? row(r.discount.label + (r.discount.mode === 'percent' ? ` (${fmtPct(r.discount.value)})` : ''), fmtPeso(r.discount.amount)) : null,
      r.adjustment ? row('Rounding adjustment', fmtPeso(r.adjustment)) : null, row('Grand total (VAT exclusive)', fmtPeso(r.total), 'big')];
  }
  function drawSummary(r) {
    const order = { error: 0, warn: 1, info: 2 };
    const w = [...r.warnings].sort((a, b) => order[a.level] - order[b.level]);
    mount(summary,
      h('div', null, h('div', { class: 'small muted' }, 'Grand total (VAT exclusive)'), h('div', { class: 'total' }, fmtPeso(r.total))),
      h('div', null, totalsRows(r)),
      r.payment.length ? h('div', { class: 'small' }, h('div', { class: 'muted' }, 'Payment'), r.payment.map((p) => h('div', { class: 'sum-row' }, h('span', null, `${p.name || 'Stage'} ${fmtPct(p.pct)}`), h('span', { class: 'num' }, fmtPeso(p.amount))))) : null,
      w.length ? h('ul', { class: 'warn-list' }, w.slice(0, 6).map((x) => h('li', { class: x.level }, x.text)), w.length > 6 ? h('li', { class: 'info' }, `+${w.length - 6} more`) : null) : h('div', { class: 'small', style: { color: 'var(--ok)' } }, '✓ No warnings'),
      h('div', null, h('button', { class: 'btn-sm btn-ghost', onclick: () => { showProfit = !showProfit; refresh(); } }, showProfit ? 'Hide internal profit' : 'Show internal profit'),
        showProfit ? h('div', { class: 'profit', style: { marginTop: '6px' } }, h('div', { class: 'sum-row' }, h('span', null, 'Direct cost (lines)'), h('span', { class: 'num' }, fmtPeso(r.profit.cost))),
          h('div', { class: 'sum-row' }, h('span', null, 'Markups and adjustments'), h('span', { class: 'num' }, fmtPeso(r.profit.margin))),
          h('div', { class: 'sum-row', style: { color: '#fff', fontWeight: 700 } }, h('span', null, 'Margin on price'), h('span', { class: 'num' }, r.profit.marginPct.toFixed(1) + '%')),
          h('div', { class: 'small', style: { color: '#aaa', marginTop: '4px' } }, 'Internal only. Never printed.')) : null),
      h('div', { class: 'row' }, h('button', { class: 'btn-primary', style: { flex: 1, justifyContent: 'center' }, onclick: () => { tab = 'documents'; drawTabs(); drawBody(); } }, 'Documents →')));
  }

  // ----- tab: details -----
  function details() {
    const s = app.settings;
    const validTo = q.quoteDate ? addDays(q.quoteDate, q.validityDays) : '';
    return h('div', { class: 'stack' },
      h('div', { class: 'card card-pad stack' }, h('h2', null, 'Client'), h('div', { class: 'grid g2' },
        field('Client name', bind(q.client, 'name', { placeholder: 'e.g. Mr. and Mrs. …' })), field('Phone', bind(q.client, 'phone')),
        field('Address', bind(q.client, 'address')), field('Email', bind(q.client, 'email', { type: 'email' })))),
      h('div', { class: 'card card-pad stack' }, h('h2', null, 'Project'), h('div', { class: 'grid g2' },
        field('Project name', bind(q.project, 'name', { placeholder: 'e.g. Two-storey residence smart home' })),
        field('Project type', h('div', null, bind(q.project, 'type', { list: 'ptypes' }), h('datalist', { id: 'ptypes' }, (s.defaults.projectTypes || []).map((t) => h('option', { value: t }))))),
        h('div', { class: 'span2' }, field('Project address', h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, bind(q.project, 'address'),
          ro() ? null : h('button', { class: 'btn-sm', onclick: () => { q.project.address = q.client.address; markDirty(); drawBody(); } }, 'Same as client')))))),
      h('details', { class: 'card card-pad', open: !!q.gc.name }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'General contractor (optional)'),
        h('div', { class: 'grid g2', style: { marginTop: '12px' } }, field('Company', bind(q.gc, 'name')), field('Representative', bind(q.gc, 'rep')), field('Phone', bind(q.gc, 'phone')), field('Email', bind(q.gc, 'email')))),
      h('div', { class: 'card card-pad stack' }, h('h2', null, 'Quote'), h('div', { class: 'grid g3' },
        field('Quote date', q.id ? h('input', { value: fmtDate(q.quoteDate), disabled: true }) : bind(q, 'quoteDate', { type: 'date' }), q.id ? 'Fixed when the quote was first saved' : 'Fixed on first save'),
        field('Valid for (days)', numIn(q, 'validityDays', { min: 1 }), validTo ? 'Until ' + fmtDate(validTo) : ''),
        field('Prepared by', ro() ? h('input', { disabled: true, value: (s.signatories.find((x) => x.id === q.preparedBy) || {}).name || '' }) :
          select([['', '—'], ...s.signatories.map((x) => [x.id, `${x.name} (${x.position})`])], q.preparedBy, (v) => { q.preparedBy = v; markDirty(); })),
        field('Conforme name', bind(q.conforme, 'name', { placeholder: q.client.name || 'Client name' }), 'Leave blank to use the client name'),
        field('Conforme title', bind(q.conforme, 'title')))),
      h('div', { class: 'card card-pad stack' }, h('h2', null, 'Remarks'), field('Printed under the Bill of Quantities', bind(q, 'remarks', { multiline: true, rows: 4, placeholder: 'e.g. Automatic lighting when presence is detected in: stairs, all T&B…' }))));
  }

  // ----- tab: systems -----
  function systems() {
    const wrap = h('div');
    const types = app.settings.systemTypes;
    const addBar = ro() ? null : h('div', { class: 'row', style: { marginTop: '10px' } },
      select([['', '+ Add another system…'], ...types.map((t) => [t.key, t.name]), ['__custom', 'Custom system…']], '', (v) => {
        if (!v) return; const t = v === '__custom' ? { name: 'New system', unit: 'lot' } : types.find((x) => x.key === v);
        const ns = newSystem(t, true); if (v !== '__custom') ns.name = t.name + (q.systems.some((s) => s.key === v) ? ' (2)' : '');
        q.systems.push(ns); open.add(ns.id); markDirty(); drawBody(); }, { style: { maxWidth: '320px' } }));
    mount(wrap, h('p', { class: 'small muted', style: { marginTop: 0 } }, 'Switch on the systems for this project. Open one to add items from the catalog, apply a package, or type custom lines. Only switched-on systems are priced and printed.'),
      q.systems.map(sysCard), addBar);
    return wrap;
  }
  function sysCard(s) {
    const isOpen = open.has(s.id);
    const amount = h('span', { class: 'num' }); refs['sys' + s.id] = amount;
    const card = h('div', { class: 'sys' + (s.enabled ? '' : ' off') + (isOpen ? ' open' : '') },
      h('div', { class: 'sys-head', onclick: () => { isOpen ? open.delete(s.id) : open.add(s.id); drawBody(); } },
        h('span', { class: 'chev' }, '▶'), sw(s.enabled, (v) => { if (ro()) return drawBody(); s.enabled = v; if (v) open.add(s.id); markDirty(); drawBody(); }, 'Include this system'),
        h('div', { class: 'sys-name' }, s.name, h('span', { class: 'small muted' }, `${s.lines.length} line${s.lines.length === 1 ? '' : 's'}${s.where ? ' · ' + s.where : ''}`)), amount),
      isOpen ? sysBody(s) : null);
    return card;
  }
  function sysBody(s) {
    const pk = app.packages.filter((p) => !p.system || p.system === s.key);
    const dir = h('div', { class: 'grid g4', style: { marginTop: '12px', background: '#FBFBFC', padding: '10px', borderRadius: '8px' } }); refs['dir' + s.id] = dir;
    return h('div', { class: 'sys-body' },
      h('div', { class: 'grid g4' },
        h('div', { class: 'span2' }, field('System name (printed)', bind(s, 'name'))), field('Quantity', numIn(s, 'qty', { min: 0 })), field('Unit', bind(s, 'unit')),
        h('div', { class: 'span2' }, field('Short description (BOQ)', bind(s, 'description'))),
        h('div', { class: 'span2' }, field('Where (rooms / areas)', bind(s, 'where', { placeholder: 'e.g. Living, dining, 3 bedrooms' })))),
      ro() ? null : h('div', { class: 'row', style: { marginTop: '10px' } },
        pk.length ? select([['', 'Apply a package…'], ...pk.map((p) => [p.id, p.name])], '', (v) => { if (v) applyPackage(s, app.packages.find((p) => p.id === v)); }, { style: { maxWidth: '300px' } }) : h('span', { class: 'small muted' }, 'No packages for this system yet.'),
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'btn-sm btn-ghost btn-danger', onclick: async () => { if (await confirmBox('Remove system', `Remove "${s.name}" and its ${s.lines.length} lines from this quote?`, 'Remove', true)) { q.systems = q.systems.filter((x) => x !== s); markDirty(); drawBody(); } } }, 'Remove system')),
      KINDS.map((k) => linesTable(s, k)),
      h('details', { style: { marginTop: '12px' }, open: !!Number(s.markup && s.markup.pct) },
        h('summary', { class: 'small', style: { cursor: 'pointer' } }, 'System markup (inside Exhibit B) and client description'),
        h('div', { class: 'grid g3', style: { marginTop: '8px' } },
          field('Markup label', bind(s.markup, 'label')), field('Markup %', numIn(s.markup, 'pct', { min: 0 }), 'Usually 0 when markup is on the whole quote'),
          h('div', { class: 'span3' }, field('Client-friendly description (Proposal)', bind(s, 'clientDescription', { multiline: true, rows: 3 }))))),
      dir);
  }
  function sysTotals(c) {
    const cell = (k, v, b) => h('div', null, h('div', { class: 'small muted' }, k), h('div', { class: 'num', style: { textAlign: 'left', fontWeight: b ? 700 : 500 } }, v));
    return [cell('Direct cost (M + L + E)', fmtPeso(c.direct)), cell('System markup', c.markupPct ? `${fmtPct(c.markupPct)} · ${fmtPeso(c.markupAmount)}` : '—'),
      cell('Unit price', fmtPeso(c.unitPrice)), cell(`Amount (× ${c.qty} ${c.unit || ''})`, fmtPeso(c.amount), true)];
  }
  function linesTable(s, kind) {
    const lines = s.lines.filter((l) => l.kind === kind);
    const sub = h('span'); refs['sec' + s.id + kind] = sub;
    const labor = kind === 'labor';
    const rows = lines.map((l) => {
      const amt = h('td', { class: 'num c-amt' }); refs['ln' + l.id] = amt;
      return h('tr', null,
        h('td', { class: 'c-name' }, bind(l, 'name', { placeholder: 'Description' })),
        labor ? h('td', { class: 'c-ppl' }, numIn(l, 'people', { min: 0, title: 'People' })) : h('td', { class: 'c-loc hide-sm' }, bind(l, 'location', { placeholder: 'Where' })),
        h('td', { class: 'c-qty' }, numIn(l, 'qty', { min: 0 })), h('td', { class: 'c-unit' }, bind(l, 'unit')),
        h('td', { class: 'c-cost' }, numIn(l, 'unitCost', { min: 0 })), amt,
        h('td', { class: 'c-x' }, ro() ? null : h('button', { class: 'icon-btn', title: 'Remove line', 'aria-label': 'Remove line', onclick: () => { s.lines = s.lines.filter((x) => x !== l); markDirty(); drawBody(); } }, '✕')));
    });
    return h('div', null,
      h('div', { class: 'sec-title' }, h('span', null, KIND_LABEL[kind]), ro() ? null : h('span', { class: 'row' },
        h('button', { class: 'btn-sm', onclick: () => pickCatalog(s, kind) }, '+ From catalog'),
        h('button', { class: 'btn-sm', onclick: () => { s.lines.push({ id: uid('ln'), kind, name: '', unit: labor ? 'man-day' : kind === 'equipment' ? 'day' : 'pc', qty: 1, unitCost: 0, people: 1, location: '' }); markDirty(); drawBody(); } }, '+ Custom'))),
      lines.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'lines' },
        h('thead', null, h('tr', null, h('th', null, 'Description'), labor ? h('th', { class: 'num' }, 'People') : h('th', { class: 'hide-sm' }, 'Location / notes'), h('th', { class: 'num' }, 'Qty'), h('th', null, 'Unit'), h('th', { class: 'num' }, labor ? 'Rate' : 'Unit cost'), h('th', { class: 'num' }, 'Amount'), h('th'))),
        h('tbody', null, rows), h('tfoot', null, h('tr', null, h('td', { colspan: 5 }, `Subtotal, ${KIND_ONE[kind]}`), h('td', { class: 'num' }, sub), h('td'))))) : h('div', { class: 'small muted', style: { padding: '4px 0 6px' } }, `No ${KIND_ONE[kind]} lines.`));
  }
  function pickCatalog(s, kind) {
    let term = '', allSys = false, k = kind;
    const list = h('div', { class: 'pick-list' });
    const draw = () => {
      const t = term.toLowerCase();
      const items = app.catalog.filter((c) => c.active !== false && (!k || c.kind === k) && (allSys || !s.key || c.system === s.key || c.system === 'general')
        && (!t || [c.name, c.brand, c.model].join(' ').toLowerCase().includes(t)))
        .sort((a, b) => (a.system === s.key ? 0 : 1) - (b.system === s.key ? 0 : 1) || a.name.localeCompare(b.name)).slice(0, 200);
      mount(list, items.length ? items.map((c) => {
        const b = h('button', { class: 'btn-sm', onclick: () => { s.lines.push(lineFromCatalog(c)); markDirty(); b.textContent = 'Added ✓'; b.disabled = true; setTimeout(() => { b.textContent = 'Add'; b.disabled = false; }, 900); } }, 'Add');
        return h('div', { class: 'pick-item' }, h('div', { class: 'grow' }, h('div', null, c.name), h('div', { class: 'small muted' }, [c.brand, c.unit, KIND_LABEL[c.kind]].filter(Boolean).join(' · '))), h('div', { class: 'num' }, fmtPeso(Math.round(c.unitCost * 100))), b);
      }) : h('div', { class: 'empty' }, 'Nothing found. Try "All systems", or add it to the catalog.'));
    };
    modal({ title: `Add to ${s.name}`, wide: true, body: () => h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('input', { type: 'search', placeholder: 'Search catalog', oninput: (e) => { term = e.target.value; draw(); }, style: { flex: 1, minWidth: '180px' } }),
        select([['', 'All kinds'], ...KINDS.map((x) => [x, KIND_LABEL[x]])], k, (v) => { k = v; draw(); }, { style: { width: '150px' } }),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', onchange: (e) => { allSys = e.target.checked; draw(); } }), 'All systems')), list),
      actions: [{ label: 'Done', class: 'btn-primary', onClick: (c) => { c(); drawBody(); } }] });
    draw();
  }
  function applyPackage(s, p) {
    let added = 0, missing = 0;
    for (const pl of p.lines) {
      const it = app.catalog.find((c) => c.id === pl.catalogId);
      if (it) { s.lines.push(lineFromCatalog(it, pl.qty)); added++; } else if (pl.name) { s.lines.push({ id: uid('ln'), kind: pl.kind || 'material', name: pl.name, unit: pl.unit || 'pc', unitCost: pl.unitCost || 0, qty: pl.qty || 1, people: 1, location: '' }); added++; } else missing++;
    }
    toast(`Added ${added} lines from "${p.name}"${missing ? `, ${missing} catalog items no longer exist` : ''}. Adjust quantities as needed.`);
    markDirty(); drawBody();
  }

  // ----- tab: pricing -----
  function pricing() {
    const s = app.settings;
    const totals = h('div'); refs.pricing = totals;
    const mkRows = q.markups.map((m) => {
      const amt = h('td', { class: 'num' }); refs['mk' + m.id] = amt;
      return h('tr', null, h('td', null, bind(m, 'label')), h('td', { style: { width: '90px' } }, numIn(m, 'pct', { min: 0 })), amt,
        h('td', { class: 'c-x' }, ro() ? null : h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => { q.markups = q.markups.filter((x) => x !== m); markDirty(); drawBody(); } }, '✕')));
    });
    const enabled = q.systems.filter((x) => x.enabled);
    const payRows = q.payment.map((p, i) => {
      const amt = h('td', { class: 'num' }); refs['pay' + p.id] = amt;
      return h('tr', null, h('td', null, bind(p, 'name')), h('td', { style: { width: '90px' } }, numIn(p, 'pct', { min: 0 })), h('td', null, bind(p, 'due')), amt,
        h('td', { class: 'c-x nowrap' }, ro() ? null : [h('button', { class: 'icon-btn', title: 'Move up', disabled: i === 0, onclick: () => { q.payment.splice(i - 1, 0, q.payment.splice(i, 1)[0]); markDirty(); drawBody(); } }, '↑'),
          h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => { q.payment = q.payment.filter((x) => x !== p); markDirty(); drawBody(); } }, '✕')]));
    });
    const payPct = h('strong'); refs.payPct = payPct;
    return h('div', { class: 'stack' },
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Markup on the whole quote'), h('div', { class: 'small muted' }, 'BOQ level. Each % is applied to the subtotal; they do not stack.')),
        ro() ? null : select([['', 'Use a preset…'], ...s.markupPresets.map((p) => [p.id, p.name])], '', (v) => { const p = s.markupPresets.find((x) => x.id === v); if (!p) return; q.markups = clone(p.markups).map((m) => ({ id: uid('mk'), ...m })); markDirty(); drawBody(); }, { style: { width: '240px' } })),
        h('div', { class: 'table-wrap' }, h('table', { class: 'lines' }, h('thead', null, h('tr', null, h('th', null, 'Printed label'), h('th', { class: 'num' }, '%'), h('th', { class: 'num' }, 'Amount'), h('th'))), h('tbody', null, mkRows))),
        ro() ? null : h('div', { class: 'card-pad row' },
          h('button', { class: 'btn-sm', onclick: () => { q.markups.push({ id: uid('mk'), code: 'OCM', label: 'OCM (Overhead, Miscellaneous & Contingencies)', pct: 0 }); markDirty(); drawBody(); } }, '+ OCM'),
          h('button', { class: 'btn-sm', onclick: () => { q.markups.push({ id: uid('mk'), code: 'CP', label: "CP (Contractor's Profit)", pct: 0 }); markDirty(); drawBody(); } }, '+ CP'),
          h('button', { class: 'btn-sm', onclick: () => { q.markups.push({ id: uid('mk'), code: 'custom', label: 'Other', pct: 0 }); markDirty(); drawBody(); } }, '+ Other'))),
      h('div', { class: 'card card-pad stack' }, h('div', null, h('h2', null, 'Markup inside systems'), h('div', { class: 'small muted' }, 'Exhibit B level: added inside each system’s unit price. Leave at 0 when using markup on the whole quote.')),
        enabled.length ? h('div', { class: 'grid g3' }, enabled.map((x) => field(x.name, numIn(x.markup, 'pct', { min: 0 }), x.markup.label + ' %'))) : h('div', { class: 'small muted' }, 'No systems switched on.')),
      h('div', { class: 'grid g2' },
        h('div', { class: 'card card-pad stack' }, h('h2', null, 'Discount'), h('div', { class: 'grid g2' },
          field('Type', ro() ? h('input', { disabled: true, value: q.discount.mode }) : select([['none', 'No discount'], ['percent', 'Percent'], ['amount', 'Fixed amount (₱)']], q.discount.mode, (v) => { q.discount.mode = v; markDirty(); drawBody(); })),
          q.discount.mode !== 'none' ? field(q.discount.mode === 'percent' ? 'Discount %' : 'Amount (₱)', numIn(q.discount, 'value', { min: 0 })) : h('span'),
          q.discount.mode === 'percent' ? field('Applied to', ro() ? h('input', { disabled: true, value: q.discount.base }) : select([['subtotal', 'Subtotal (before markup)'], ['afterMarkups', 'Total after markup']], q.discount.base || 'subtotal', (v) => { q.discount.base = v; markDirty(); })) : null,
          q.discount.mode !== 'none' ? field('Printed label', bind(q.discount, 'label')) : null)),
        h('div', { class: 'card card-pad stack' }, h('h2', null, 'Round the total'), h('div', { class: 'grid g2' },
          field('Rounding', ro() ? h('input', { disabled: true, value: q.rounding.mode }) : select([['none', 'No rounding'], ['down', 'Round down to nearest…'], ['target', 'Set exact total…']], q.rounding.mode, (v) => { q.rounding.mode = v; markDirty(); drawBody(); })),
          q.rounding.mode === 'down' ? field('Nearest (₱)', numIn(q.rounding, 'value', { min: 1, placeholder: 'e.g. 1000' })) : q.rounding.mode === 'target' ? field('Total (₱)', numIn(q.rounding, 'value', { min: 0 })) : h('span')),
          h('div', { class: 'small muted' }, 'Prints as a "Rounding adjustment" line (the old "Less").'))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', null, h('h2', null, 'Payment schedule'), h('div', { class: 'small' }, 'Total: ', payPct, h('span', { class: 'muted' }, ' (must be 100%)'))),
        ro() ? null : select([['', 'Use a preset…'], ...s.paymentPresets.map((p) => [p.id, p.name])], '', (v) => { const p = s.paymentPresets.find((x) => x.id === v); if (!p) return; q.payment = clone(p.stages).map((x) => ({ id: uid('pay'), ...x })); markDirty(); drawBody(); }, { style: { width: '240px' } })),
        h('div', { class: 'table-wrap' }, h('table', { class: 'lines' }, h('thead', null, h('tr', null, h('th', null, 'Stage'), h('th', { class: 'num' }, '%'), h('th', null, 'Due'), h('th', { class: 'num' }, 'Amount'), h('th'))), h('tbody', null, payRows))),
        ro() ? null : h('div', { class: 'card-pad' }, h('button', { class: 'btn-sm', onclick: () => { q.payment.push({ id: uid('pay'), name: 'Progress billing', pct: 0, due: '' }); markDirty(); drawBody(); } }, '+ Add stage'))),
      h('div', { class: 'card card-pad' }, h('h2', { style: { marginBottom: '8px' } }, 'Totals'), totals));
  }

  // ----- tab: documents -----
  function statusSelect() {
    return select([['sent', 'Sent'], ['accepted', 'Accepted'], ['lost', 'Lost']], q.status, async (v) => {
      try { Object.assign(q, await api.setStatus(q.id, v, q.version)); orig = JSON.stringify(q); toast('Status: ' + v); drawHead(); } catch (e) { handleError(e); }
    }, { style: { width: '130px' } });
  }
  function documents() {
    const r = calculate(q), errs = r.warnings.filter((w) => w.level === 'error');
    const chosen = () => DOCS.map(([k]) => k).filter((k) => q.docs[k]);
    return h('div', { class: 'stack' },
      h('div', { class: 'card card-pad stack' }, h('h2', null, 'Client documents'),
        h('div', { class: 'small muted' }, 'All documents use the same totals. The internal profit view is never printed.'),
        DOCS.map(([k, label]) => h('div', { class: 'row between', style: { borderBottom: '1px solid var(--line-2)', padding: '6px 0' } },
          h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!q.docs[k], onchange: (e) => { q.docs[k] = e.target.checked; markDirty(); } }), label,
            k === 'dupa' ? h('span', { class: 'small muted' }, ` (${r.systems.length} system${r.systems.length === 1 ? '' : 's'})`) : null),
          h('div', { class: 'row' }, h('button', { class: 'btn-sm', onclick: () => makePdf([k], 'open') }, 'Preview'), h('button', { class: 'btn-sm', onclick: () => makePdf([k], 'download') }, 'Download')))),
        errs.length ? h('ul', { class: 'warn-list' }, errs.map((x) => h('li', { class: 'error' }, x.text))) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn-brand', onclick: () => makePdf(chosen(), 'download') }, 'Download selected as one PDF'), h('button', { onclick: () => makePdf(chosen(), 'open') }, 'Preview selected'))),
      h('div', { class: 'card card-pad stack' }, h('h2', null, 'Send and revisions'),
        !q.id ? h('div', { class: 'small muted' }, 'Save the quote first.') : q.status === 'draft' ?
          h('div', { class: 'stack' }, h('div', { class: 'small muted' }, `"Mark as sent" freezes revision ${q.rev || 0} exactly as it is, so you can always see what the client received. Later changes go into a new revision.`),
            h('div', null, h('button', { class: 'btn-primary', disabled: dirty() || errs.length > 0, onclick: markSent }, dirty() ? 'Save before marking as sent' : errs.length ? 'Fix errors before marking as sent' : `Mark revision ${q.rev || 0} as sent`)))
          : h('div', { class: 'row' }, 'Status: ', statusSelect(), h('button', { onclick: newRevision }, 'Create revision ' + ((q.rev || 0) + 1))),
        (q.revisions || []).length ? h('table', null, h('thead', null, h('tr', null, h('th', null, 'Revision'), h('th', null, 'Sent'), h('th', { class: 'num' }, 'Total'), h('th'))),
          h('tbody', null, q.revisions.map((rv) => h('tr', null, h('td', null, 'Rev ' + rv.rev), h('td', null, fmtDate(rv.sentAt)), h('td', { class: 'num' }, fmtPeso(rv.total)),
            h('td', { class: 'right' }, h('button', { class: 'btn-sm', onclick: async () => { try { const old = await api.getRevision(q.id, rv.rev); makePdf(chosen(), 'open', old); } catch (e) { handleError(e); } } }, 'Open sent PDFs')))))) : null));
  }

  async function makePdf(keys, mode, src) {
    if (!keys.length) return toast('Choose at least one document.', true);
    try {
      toast('Preparing PDF…');
      const { buildPdf } = await import('../pdf/docs.js');
      const { blob, name } = await buildPdf(keys, src || q, app.settings);
      const url = URL.createObjectURL(blob);
      const narrow = window.matchMedia('(max-width: 760px)').matches;
      if (mode === 'download' || narrow) { download(name, blob); setTimeout(() => URL.revokeObjectURL(url), 60000); return; }
      modal({ title: name, wide: true, body: h('iframe', { src: url, title: 'PDF preview', style: { width: '100%', height: '72vh', border: '1px solid var(--line)', borderRadius: '8px' } }),
        actions: [{ label: 'Close', onClick: (c) => { c(); URL.revokeObjectURL(url); } }, { label: 'Download', class: 'btn-primary', onClick: () => download(name, blob) }] });
    } catch (e) { handleError(e); }
  }

  // ----- save / send / revisions -----
  async function doSave(asCopy) {
    if (ro() || saving) return;
    saving = true; drawHead();
    try {
      const out = clone(q); out.summary = { total: calculate(q).total };
      if (asCopy) { delete out.id; delete out.number; delete out.version; out.status = undefined; }
      const saved = await api.saveQuote(out);
      Object.assign(q, saved); orig = JSON.stringify(q); app.dirty = false;
      silentHash('#/q/' + q.id); toast(asCopy ? 'Saved as new quote ' + q.number : 'Saved');
    } catch (e) {
      if (e.code === 'conflict') {
        modal({ title: 'Someone else changed this quote', body: h('p', null, e.message), actions: [
          { label: 'Reload theirs (lose my changes)', onClick: (c) => { c(); app.dirty = false; renderEditor(q.id); } },
          { label: 'Save mine as a new quote', class: 'btn-primary', onClick: (c) => { c(); saving = false; doSave(true); } }] });
      } else handleError(e);
    } finally { saving = false; drawHead(); }
  }
  async function markSent() {
    if (!(await confirmBox('Mark as sent', `Freeze revision ${q.rev || 0} as sent to the client? You will not be able to edit it; changes go into a new revision.`, 'Mark as sent'))) return;
    try { Object.assign(q, await api.markSent(q.id, q.version)); orig = JSON.stringify(q); toast('Marked as sent'); drawTabs(); drawBody(); } catch (e) { handleError(e); }
  }
  async function newRevision() {
    if (!(await confirmBox('New revision', `Create revision ${(q.rev || 0) + 1}? Revision ${q.rev || 0} stays frozen as sent.`, 'Create'))) return;
    try { Object.assign(q, await api.newRevision(q.id)); orig = JSON.stringify(q); toast('Revision ' + q.rev + ' created'); drawTabs(); drawBody(); } catch (e) { handleError(e); }
  }

  if (!q.id) tab = 'details';
  drawTabs(); drawBody();
}
