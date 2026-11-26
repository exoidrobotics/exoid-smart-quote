import { api, isMock } from '../api.js';
import { app, page, handleError, LOGO } from '../main.js';
import { h, mount, field, select, toast, confirmBox, uid, clone, download } from './dom.js';

export function renderSettings() {
  const s = clone(app.settings);
  let section = 'company';
  const body = h('div');
  const nav = h('div', { class: 'tabs' });
  const saveBtn = h('button', { class: 'btn-brand', onclick: save }, 'Save settings');
  const sections = [['company', 'Company'], ['people', 'Signatories'], ['bank', 'Payment channel'], ['systems', 'Systems'], ['presets', 'Markup & payment presets'], ['texts', 'Document wording'], ['contract', 'Contract'], ['defaults', 'Defaults'], ['data', 'Backup & import']];
  page('settings', h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Settings'), h('div', { class: 'small muted' }, 'Shared by everyone. Saved in the private Google Sheet.')), saveBtn), nav, body);
  const drawNav = () => mount(nav, sections.map(([k, l]) => h('button', { class: section === k ? 'active' : '', onclick: () => { section = k; drawNav(); draw(); } }, l)));
  const t = (obj, key, attrs = {}) => h(attrs.multiline ? 'textarea' : 'input', { ...attrs, multiline: null, value: obj[key] ?? '', oninput: (e) => { obj[key] = attrs.type === 'number' ? Number(e.target.value) : e.target.value; } });
  const rm = (arr, x, redraw) => h('button', { class: 'icon-btn', 'aria-label': 'Remove', onclick: () => { arr.splice(arr.indexOf(x), 1); redraw(); } }, '✕');
  drawNav(); draw();

  function draw() { mount(body, { company, people, bank, systems, presets, texts, contract, defaults, data }[section]()); }

  function company() {
    const c = s.company;
    const img = h('img', { src: c.logo || LOGO, alt: 'Logo', style: { height: '64px', background: '#fafafa', padding: '6px', border: '1px solid var(--line)', borderRadius: '8px' } });
    return h('div', { class: 'card card-pad stack' }, h('div', { class: 'grid g2' },
      field('Trade name (header)', t(c, 'name')), field('Registered business name (contract)', t(c, 'legalName')),
      h('div', { class: 'span2' }, field('Business address', t(c, 'address'))), field('Phone', t(c, 'phone')), field('Email', t(c, 'email')), field('Website', t(c, 'website'))),
      h('div', { class: 'row' }, img, h('label', { class: 'btn' }, 'Change logo…', h('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'hidden', onchange: (e) => loadLogo(e.target.files[0], img) })),
        c.logo ? h('button', { class: 'btn-ghost', onclick: () => { c.logo = ''; img.src = LOGO; } }, 'Use default logo') : null));
  }
  function loadLogo(file, img) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { const im = new Image(); im.onload = () => {
      const scale = Math.min(1, 600 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
      cv.width = Math.round(im.width * scale); cv.height = Math.round(im.height * scale); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      s.company.logo = cv.toDataURL('image/png'); img.src = s.company.logo; toast('Logo loaded. Click "Save settings".');
    }; im.src = r.result; };
    r.readAsDataURL(file);
  }
  function people() {
    const wrap = h('div', { class: 'card card-pad stack' });
    const redraw = () => mount(wrap, h('div', { class: 'small muted' }, 'People who can be chosen as "Prepared by" on a quote. Sign-in user codes are managed from the Google Sheet menu.'),
      s.signatories.map((p) => h('div', { class: 'grid g2', style: { alignItems: 'end' } }, field('Name', t(p, 'name')), h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, field('Position', t(p, 'position')), rm(s.signatories, p, redraw)))),
      h('div', null, h('button', { class: 'btn-sm', onclick: () => { s.signatories.push({ id: uid('sig'), name: '', position: '' }); redraw(); } }, '+ Add person')));
    redraw(); return wrap;
  }
  function bank() {
    return h('div', { class: 'card card-pad stack' }, h('div', { class: 'small muted' }, 'Printed on the Proforma Invoice only.'), h('div', { class: 'grid g2' },
      field('Bank', t(s.bank, 'bank')), field('Account name', t(s.bank, 'accountName')), field('Account number', t(s.bank, 'accountNumber')), field('Other instructions', t(s.bank, 'notes'))));
  }
  function systems() {
    const wrap = h('div', { class: 'stack' });
    const redraw = () => mount(wrap, h('div', { class: 'small muted' }, 'Systems offered on every new quote (switched off until ticked). The client-friendly description is used in the Proposal.'),
      s.systemTypes.map((x, i) => h('div', { class: 'card card-pad grid g4' },
        h('div', { class: 'span2' }, field('Name', t(x, 'name'))), field('Unit', t(x, 'unit')),
        h('div', { class: 'row', style: { alignItems: 'end', justifyContent: 'flex-end' } },
          h('button', { class: 'btn-sm', disabled: i === 0, onclick: () => { s.systemTypes.splice(i - 1, 0, s.systemTypes.splice(i, 1)[0]); redraw(); } }, '↑'), rm(s.systemTypes, x, redraw)),
        h('div', { class: 'span2' }, field('Short description (BOQ)', t(x, 'description'))),
        h('div', { class: 'span2' }, field('Client-friendly description (Proposal)', t(x, 'clientDescription', { multiline: true, rows: 2 }))))),
      h('div', null, h('button', { class: 'btn-sm', onclick: () => { s.systemTypes.push({ key: uid('st'), name: 'New system', unit: 'lot', description: '', clientDescription: '' }); redraw(); } }, '+ Add system')));
    redraw(); return wrap;
  }
  function presets() {
    const wrap = h('div', { class: 'stack' });
    const redraw = () => mount(wrap,
      h('h2', null, 'Markup presets'), h('div', { class: 'small muted' }, 'Each % applies to the subtotal. Use OCM (Overhead, Miscellaneous & Contingencies) and CP (Contractor’s Profit).'),
      s.markupPresets.map((p) => h('div', { class: 'card card-pad stack' }, h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, field('Preset name', t(p, 'name')), rm(s.markupPresets, p, redraw)),
        p.markups.map((m) => h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'end' } }, field('Printed label', t(m, 'label')), h('div', { style: { width: '100px' } }, field('%', t(m, 'pct', { type: 'number', step: 'any' }))), rm(p.markups, m, redraw))),
        h('div', { class: 'row' }, h('button', { class: 'btn-sm', onclick: () => { p.markups.push({ code: 'OCM', label: 'OCM (Overhead, Miscellaneous & Contingencies)', pct: 0 }); redraw(); } }, '+ OCM'),
          h('button', { class: 'btn-sm', onclick: () => { p.markups.push({ code: 'CP', label: "CP (Contractor's Profit)", pct: 0 }); redraw(); } }, '+ CP')))),
      h('div', null, h('button', { class: 'btn-sm', onclick: () => { s.markupPresets.push({ id: uid('mp'), name: 'New markup preset', markups: [] }); redraw(); } }, '+ Add markup preset')),
      h('h2', { style: { marginTop: '12px' } }, 'Payment presets'),
      s.paymentPresets.map((p) => {
        const tot = () => p.stages.reduce((a, x) => a + (Number(x.pct) || 0), 0);
        return h('div', { class: 'card card-pad stack' }, h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, field('Preset name', t(p, 'name')), rm(s.paymentPresets, p, redraw)),
          p.stages.map((x) => h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'end' } }, field('Stage', t(x, 'name')), h('div', { style: { width: '90px' } }, field('%', t(x, 'pct', { type: 'number', step: 'any' }))), field('Due', t(x, 'due')), rm(p.stages, x, redraw))),
          h('div', { class: 'row' }, h('button', { class: 'btn-sm', onclick: () => { p.stages.push({ name: '', pct: 0, due: '' }); redraw(); } }, '+ Stage'), h('span', { class: 'small muted' }, `Currently ${tot()}% (refresh by adding/removing)`)));
      }),
      h('div', null, h('button', { class: 'btn-sm', onclick: () => { s.paymentPresets.push({ id: uid('pp'), name: 'New payment preset', stages: [] }); redraw(); } }, '+ Add payment preset')));
    redraw(); return wrap;
  }
  const placeholders = 'Placeholders: {{client.name}}, {{client.address}}, {{project.name}}, {{project.address}}, {{company.name}}, {{company.legalName}}, {{company.address}}, {{total}}, {{date}}, {{validUntil}}, {{quote.number}}, {{warrantyPeriod}}, {{warranty}}, {{scopeList}}, {{paymentList}}';
  function texts() {
    const x = s.texts;
    return h('div', { class: 'card card-pad stack' }, h('div', { class: 'small muted' }, placeholders),
      field('Proposal: overview paragraph', t(x, 'proposalIntro', { multiline: true, rows: 3 })),
      field('Warranty period', t(x, 'warrantyPeriod'), 'Used as {{warrantyPeriod}}, e.g. "6 months" or "1 year"'),
      field('Warranty and after-sales service', t(x, 'warranty', { multiline: true, rows: 8 })),
      field('Exclusions', t(x, 'exclusions', { multiline: true, rows: 6 })),
      field('Proposal: closing paragraph', t(x, 'proposalClosing', { multiline: true, rows: 2 })));
  }
  function contract() {
    const wrap = h('div', { class: 'stack' });
    const redraw = () => mount(wrap, h('div', { class: 'card card-pad stack' }, h('div', { class: 'grid g2' }, field('Title', t(s.contract, 'title')),
      field('Signs for the company', select([['', 'Same as "Prepared by"'], ...s.signatories.map((x) => [x.id, `${x.name} (${x.position})`])], s.contract.signatoryId || '', (v) => { s.contract.signatoryId = v; }))),
      h('div', { class: 'small muted' }, placeholders, '. Lines starting with "- " print as bullets.')),
      s.contract.clauses.map((c, i) => h('div', { class: 'card card-pad stack' },
        h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'end' } }, field(`Clause ${i + 1} title`, t(c, 'title')),
          h('button', { class: 'btn-sm', disabled: i === 0, onclick: () => { s.contract.clauses.splice(i - 1, 0, s.contract.clauses.splice(i, 1)[0]); redraw(); } }, '↑'), rm(s.contract.clauses, c, redraw)),
        t(c, 'body', { multiline: true, rows: 5 }))),
      h('div', null, h('button', { class: 'btn-sm', onclick: () => { s.contract.clauses.push({ title: 'New clause', body: '' }); redraw(); } }, '+ Add clause')));
    redraw(); return wrap;
  }
  function defaults() {
    const d = s.defaults;
    const types = h('input', { value: (d.projectTypes || []).join(', '), oninput: (e) => { d.projectTypes = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); } });
    return h('div', { class: 'card card-pad grid g2' }, field('Default validity (days)', t(d, 'validityDays', { type: 'number', min: 1 })),
      field('Quote number prefix', t(d, 'quotePrefix'), 'Numbers look like PREFIX-2026-0001'), field('Next quote number', t(d, 'nextNumber', { type: 'number', min: 1 }), 'Issued by the server, so two people never get the same number'),
      field('Project types (comma separated)', types));
  }
  function data() {
    return h('div', { class: 'card card-pad stack' },
      h('h2', null, 'Export everything'), h('div', { class: 'small muted' }, 'Downloads settings, catalog, packages and all quotes (with sent revisions) as one JSON file. Keep it somewhere private. Daily dated backups of the Sheet are also made automatically in Google Drive.'),
      h('div', null, h('button', { onclick: async () => { try { const d = await api.exportAll(); download(`exoid-smart-quote-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 1)); } catch (e) { handleError(e); } } }, 'Download backup (JSON)')),
      h('h2', { style: { marginTop: '12px' } }, 'Import'), h('div', { class: 'small muted' }, 'Restore a backup, or load the initial catalog and settings file. Settings, catalog and packages in the file replace the current ones; quotes in the file are added or replaced by id.'),
      h('label', { class: 'btn', style: { alignSelf: 'flex-start' } }, 'Choose JSON file…', h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', onchange: (e) => importFile(e.target.files[0]) })),
      isMock ? h('p', { class: 'small muted' }, 'Demo mode: imported data stays in this browser only.') : null);
  }
  async function importFile(file) {
    if (!file) return;
    let d; try { d = JSON.parse(await file.text()); } catch { return toast('That file is not valid JSON.', true); }
    const parts = ['settings', 'catalog', 'packages', 'quotes'].filter((k) => d[k]).map((k) => k === 'catalog' ? `${d.catalog.length} catalog items` : k === 'quotes' ? `${Object.keys(d.quotes).length} quotes` : k);
    if (!(await confirmBox('Import', `Import ${parts.join(', ')}? This replaces the current settings/catalog/packages that are in the file.`, 'Import', true))) return;
    try { await api.importAll(d); const b = await api.bootstrap(); Object.assign(app, { settings: b.settings, catalog: b.catalog, packages: b.packages }); toast('Imported'); renderSettings(); } catch (e) { handleError(e); }
  }
  async function save() {
    try { app.settings = await api.saveSettings(s); toast('Settings saved'); } catch (e) { handleError(e); }
  }
}
