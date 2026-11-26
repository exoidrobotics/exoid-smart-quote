import { api } from '../api.js';
import { app, page, handleError } from '../main.js';
import { fmtPeso, KINDS } from '../engine.js';
import { h, mount, field, select, toast, modal, confirmBox, uid, clone } from './dom.js';

const KL = { material: 'Material', labor: 'Labor', equipment: 'Equipment' };
const sysName = (k) => (app.settings.systemTypes.find((s) => s.key === k) || { name: k || '—' }).name;
const sysOptions = () => [['', '— Any system —'], ...app.settings.systemTypes.map((s) => [s.key, s.name])];

// ---------- catalog ----------
export function renderCatalog() {
  let term = '', sys = '', kind = '', showRetired = false;
  const tbody = h('tbody'), count = h('span', { class: 'muted small' });
  const draw = () => {
    const t = term.toLowerCase();
    const rows = app.catalog.filter((c) => (showRetired || c.active !== false) && (!sys || c.system === sys) && (!kind || c.kind === kind)
      && (!t || [c.name, c.brand, c.model, c.notes].join(' ').toLowerCase().includes(t)))
      .sort((a, b) => sysName(a.system).localeCompare(sysName(b.system)) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    count.textContent = `${rows.length} of ${app.catalog.length} items`;
    mount(tbody, rows.slice(0, 500).map((c) => h('tr', { class: 'clickable', onclick: () => editItem(c) },
      h('td', null, h('div', null, c.name, c.active === false ? h('span', { class: 'chip deleted' }, ' retired') : null), h('div', { class: 'small muted' }, [c.brand, c.model].filter(Boolean).join(' · '))),
      h('td', { class: 'hide-sm' }, sysName(c.system)), h('td', null, KL[c.kind]), h('td', null, c.unit), h('td', { class: 'num' }, fmtPeso(Math.round((Number(c.unitCost) || 0) * 100))),
      h('td', { class: 'hide-sm small muted' }, c.updatedAt ? new Date(c.updatedAt).toLocaleDateString('en-PH') : ''))));
    if (!rows.length) mount(tbody, h('tr', null, h('td', { colspan: 6, class: 'empty' }, 'No items match.')));
  };
  page('catalog',
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Catalog'), h('div', { class: 'small muted' }, 'Unit costs before markup, VAT exclusive. Changing a price here never changes quotes already saved.')),
      h('button', { class: 'btn-brand', onclick: () => editItem(null) }, '+ New item')),
    h('div', { class: 'card card-pad row', style: { marginBottom: '12px' } },
      h('input', { type: 'search', placeholder: 'Search name, brand, model', style: { flex: 2, minWidth: '200px' }, oninput: (e) => { term = e.target.value; draw(); } }),
      select(sysOptions(), sys, (v) => { sys = v; draw(); }, { style: { flex: 1, minWidth: '160px' } }),
      select([['', 'All kinds'], ...KINDS.map((k) => [k, KL[k]])], kind, (v) => { kind = v; draw(); }, { style: { width: '140px' } }),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', onchange: (e) => { showRetired = e.target.checked; draw(); } }), 'Show retired'), count),
    h('div', { class: 'card table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', { class: 'hide-sm' }, 'System'), h('th', null, 'Kind'), h('th', null, 'Unit'), h('th', { class: 'num' }, 'Unit cost'), h('th', { class: 'hide-sm' }, 'Updated'))), tbody)));
  draw();

  function editItem(orig) {
    const it = orig ? clone(orig) : { id: '', system: sys, kind: kind || 'material', name: '', brand: '', model: '', unit: 'pc', unitCost: 0, active: true, notes: '' };
    const inp = (k, attrs = {}) => h('input', { ...attrs, value: it[k] ?? '', oninput: (e) => { it[k] = attrs.type === 'number' ? Number(e.target.value) : e.target.value; } });
    modal({ title: orig ? 'Edit catalog item' : 'New catalog item', body: h('div', { class: 'grid g2' },
      h('div', { class: 'span2' }, field('Name (as printed)', inp('name'))), field('System', select(sysOptions(), it.system, (v) => { it.system = v; })),
      field('Kind', select(KINDS.map((k) => [k, KL[k]]), it.kind, (v) => { it.kind = v; })), field('Brand', inp('brand')), field('Model', inp('model')),
      field('Unit', inp('unit', { list: 'units' }), 'pc, m, lot, day, man-day…'), field('Unit cost (₱, before markup)', inp('unitCost', { type: 'number', step: 'any', min: 0 })),
      h('div', { class: 'span2' }, field('Notes (internal)', inp('notes'))),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: it.active !== false, onchange: (e) => { it.active = e.target.checked; } }), 'Active (uncheck to retire)'),
      h('datalist', { id: 'units' }, ['pc', 'unit', 'set', 'lot', 'm', 'roll', 'box', 'day', 'man-day', 'man-outlet', 'man-device', 'km'].map((u) => h('option', { value: u })))),
      actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Save', class: 'btn-primary', onClick: async (c) => {
        if (!it.name.trim()) return toast('Name is required.', true);
        try { app.catalog = await api.saveCatalog([it]); c(); toast('Saved'); draw(); } catch (e) { handleError(e); }
      } }] });
  }
}

// ---------- packages ----------
export function renderPackages() {
  const list = h('div', { class: 'stack' });
  const draw = () => mount(list, app.packages.length ? app.packages.map((p) => h('div', { class: 'card card-pad row between clickable', style: { cursor: 'pointer' }, onclick: () => editPkg(p) },
    h('div', null, h('strong', null, p.name), h('div', { class: 'small muted' }, `${sysName(p.system)} · ${p.lines.length} lines · ${fmtPeso(pkgTotal(p))} direct cost at today's catalog prices`)),
    h('span', { class: 'muted' }, '›'))) : h('div', { class: 'card empty' }, 'No packages yet. A package is a ready set of catalog items for one system, e.g. "Smart lighting, 3-bedroom house".'));
  page('packages', h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Packages'), h('div', { class: 'small muted' }, 'Apply a package inside a quote, then adjust quantities.')),
    h('button', { class: 'btn-brand', onclick: () => editPkg(null) }, '+ New package')), list);
  draw();

  function pkgTotal(p) { return p.lines.reduce((a, l) => { const c = app.catalog.find((x) => x.id === l.catalogId); return a + (c ? Math.round(c.unitCost * 100 * (Number(l.qty) || 0)) : 0); }, 0); }
  function editPkg(orig) {
    const p = orig ? clone(orig) : { id: uid('pkg'), name: '', system: '', lines: [] };
    const linesEl = h('div');
    const drawLines = () => mount(linesEl, p.lines.length ? h('table', { class: 'lines' }, h('tbody', null, p.lines.map((l) => {
      const c = app.catalog.find((x) => x.id === l.catalogId);
      return h('tr', null, h('td', null, c ? c.name : h('span', { class: 'error' }, 'Missing catalog item'), h('div', { class: 'small muted' }, c ? `${KL[c.kind]} · ${c.unit} · ${fmtPeso(Math.round(c.unitCost * 100))}` : '')),
        h('td', { style: { width: '90px' } }, h('input', { type: 'number', class: 'num', min: 0, step: 'any', value: l.qty, oninput: (e) => { l.qty = Number(e.target.value); } })),
        h('td', { class: 'c-x' }, h('button', { class: 'icon-btn', onclick: () => { p.lines = p.lines.filter((x) => x !== l); drawLines(); } }, '✕')));
    }))) : h('div', { class: 'small muted' }, 'No items yet.'));
    let term = '';
    const results = h('div', { class: 'pick-list', style: { maxHeight: '220px' } });
    const drawResults = () => {
      const t = term.toLowerCase();
      mount(results, app.catalog.filter((c) => c.active !== false && (!p.system || c.system === p.system || c.system === 'general') && (!t || c.name.toLowerCase().includes(t))).slice(0, 80).map((c) =>
        h('div', { class: 'pick-item' }, h('div', { class: 'grow' }, c.name, h('div', { class: 'small muted' }, `${KL[c.kind]} · ${c.unit}`)), h('button', { class: 'btn-sm', onclick: () => { p.lines.push({ catalogId: c.id, qty: 1 }); drawLines(); } }, 'Add'))));
    };
    modal({ title: orig ? 'Edit package' : 'New package', wide: true, body: h('div', { class: 'stack' },
      h('div', { class: 'grid g2' }, field('Package name', h('input', { value: p.name, oninput: (e) => { p.name = e.target.value; } })),
        field('System', select(sysOptions(), p.system, (v) => { p.system = v; drawResults(); }))),
      h('h3', null, 'Items and default quantities'), linesEl,
      h('h3', null, 'Add from catalog'), h('input', { type: 'search', placeholder: 'Search catalog', oninput: (e) => { term = e.target.value; drawResults(); } }), results),
      actions: [
        orig ? { label: 'Delete', class: 'btn-danger', onClick: async (c) => { if (!(await confirmBox('Delete package', `Delete "${p.name}"? Quotes that used it are not affected.`, 'Delete', true))) return; try { app.packages = await api.savePackages(app.packages.filter((x) => x.id !== p.id)); c(); draw(); } catch (e) { handleError(e); } } } : null,
        { label: 'Cancel', onClick: (c) => c() },
        { label: 'Save', class: 'btn-primary', onClick: async (c) => {
          if (!p.name.trim()) return toast('Name is required.', true);
          const next = orig ? app.packages.map((x) => (x.id === p.id ? p : x)) : [...app.packages, p];
          try { app.packages = await api.savePackages(next); c(); toast('Saved'); draw(); } catch (e) { handleError(e); }
        } }].filter(Boolean) });
    drawLines(); drawResults();
  }
}
