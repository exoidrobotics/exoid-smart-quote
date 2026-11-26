import { api, session, isMock, ApiError } from './api.js';
import { DEMO_LOGIN, resetDemo } from './api-mock.js';
import { demoQuote } from './mock-data.js';
import { h, mount, toast, confirmBox, field } from './ui/dom.js';
import { fmtPeso } from './engine.js';
import { renderEditor } from './ui/editor.js';
import { renderCatalog, renderPackages } from './ui/catalog.js';
import { renderSettings } from './ui/settings.js';

export const app = { user: null, settings: null, catalog: [], packages: [], guard: null };
const root = () => document.getElementById('app');
export const LOGO = 'assets/logo.png';
export const logoSrc = () => (app.settings && app.settings.company.logo) || LOGO;

export function handleError(e) {
  if (e instanceof ApiError || e.code) {
    if (e.code === 'auth') { app.user = null; toast('Your session ended. Please sign in again.', true); location.hash = '#/login'; return; }
    toast(e.message, true);
  } else { console.error(e); toast('Something went wrong: ' + e.message, true); }
}

async function loadBoot() {
  const b = await api.bootstrap();
  Object.assign(app, { settings: b.settings, catalog: b.catalog, packages: b.packages, user: b.user });
}

function topbar(active) {
  const link = (href, label, key) => h('a', { href, class: active === key ? 'active' : '' }, label);
  return [
    isMock ? h('div', { class: 'demo-banner' }, 'Demo mode: made-up data, saved only in this browser. ',
      h('a', { href: '#', onclick: async (e) => { e.preventDefault(); if (await confirmBox('Reset demo', 'Delete all demo data in this browser and start again?', 'Reset', true)) { resetDemo(); location.hash = '#/login'; location.reload(); } } }, 'Reset demo')) : null,
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
      h('a', { class: 'brand', href: '#/quotes' }, h('img', { src: logoSrc(), alt: 'Exoid Robotics' }), h('span', null, 'Smart Quote')),
      h('nav', { class: 'nav' }, link('#/quotes', 'Quotes', 'quotes'), link('#/catalog', 'Catalog', 'catalog'), link('#/packages', 'Packages', 'packages'), link('#/settings', 'Settings', 'settings')),
      h('div', { class: 'user' }, h('span', { class: 'hide-sm' }, app.user ? app.user.name : ''),
        h('button', { class: 'btn-sm', onclick: async () => { if (app.guard && !(await app.guard())) return; await api.logout().catch(() => {}); app.user = null; location.hash = '#/login'; } }, 'Sign out')))),
  ];
}
export function page(active, ...content) { mount(root(), topbar(active), h('main', null, content)); }

// ---------- login ----------
function renderLogin() {
  const code = h('input', { autocomplete: 'username', autocapitalize: 'characters', required: true, value: isMock ? DEMO_LOGIN.code : '' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true, value: isMock ? DEMO_LOGIN.password : '' });
  const msg = h('div', { class: 'error' });
  const btn = h('button', { class: 'btn-brand', type: 'submit', style: { width: '100%', justifyContent: 'center' } }, 'Sign in');
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); msg.textContent = ''; btn.disabled = true; btn.textContent = 'Signing in…';
    try { await api.login(code.value.trim(), pw.value); pw.value = ''; await loadBoot(); location.hash = '#/quotes'; }
    catch (er) { msg.textContent = er.message || 'Sign-in failed.'; }
    finally { btn.disabled = false; btn.textContent = 'Sign in'; }
  } }, field('User code', code), field('Password', pw), msg, btn);
  mount(root(), h('div', { class: 'login-wrap' }, h('div', { class: 'card login' },
    h('img', { src: LOGO, alt: 'Exoid Robotics' }), h('h1', null, 'Smart Quote'), h('p', { class: 'muted' }, 'Exoid Robotics quotations'),
    form, isMock ? h('p', { class: 'small muted', style: { marginTop: '14px' } }, `Demo mode: user code ${DEMO_LOGIN.code}, password ${DEMO_LOGIN.password} (made up).`) : null)));
}

// ---------- quote list ----------
async function renderQuotes(trash) {
  page('quotes', h('div', { class: 'empty' }, 'Loading…'));
  let list;
  try { list = await api.listQuotes({ trash }); } catch (e) { return handleError(e); }
  let q = '', status = 'all';
  const tbody = h('tbody');
  const counts = (s) => list.filter((x) => s === 'all' || x.status === s).length;
  const draw = () => {
    const t = q.toLowerCase();
    const rows = list.filter((x) => (status === 'all' || x.status === status) && (!t || [x.number, x.client, x.project].join(' ').toLowerCase().includes(t)));
    mount(tbody, rows.length ? rows.map((x) => h('tr', { class: 'clickable', onclick: () => { location.hash = '#/q/' + x.id; } },
      h('td', { class: 'nowrap' }, h('strong', null, x.number), x.rev ? h('span', { class: 'muted small' }, ` Rev ${x.rev}`) : null),
      h('td', null, h('div', null, x.client || h('span', { class: 'muted' }, '(no client)')), h('div', { class: 'small muted' }, x.project || '')),
      h('td', { class: 'num' }, fmtPeso(x.total || 0)),
      h('td', null, h('span', { class: 'chip ' + x.status }, x.status)),
      h('td', { class: 'hide-sm small muted nowrap' }, x.updatedAt ? new Date(x.updatedAt).toLocaleDateString('en-PH') : ''),
      h('td', { class: 'right nowrap', onclick: (e) => e.stopPropagation() },
        trash ? h('button', { class: 'btn-sm', onclick: async () => { try { await api.restoreQuote(x.id); toast('Restored'); renderQuotes(true); } catch (e) { handleError(e); } } }, 'Restore')
          : [h('button', { class: 'btn-sm btn-ghost', title: 'Duplicate', onclick: async () => { try { const d = await api.duplicateQuote(x.id); toast('Duplicated as ' + d.number); location.hash = '#/q/' + d.id; } catch (e) { handleError(e); } } }, 'Duplicate'),
            h('button', { class: 'btn-sm btn-ghost btn-danger', title: 'Move to trash', onclick: async () => { if (!(await confirmBox('Delete quote', `Move ${x.number} to the trash? You can restore it later.`, 'Delete', true))) return; try { await api.deleteQuote(x.id); toast('Moved to trash'); renderQuotes(false); } catch (e) { handleError(e); } } }, 'Delete')])))
      : h('tr', null, h('td', { colspan: 6, class: 'empty' }, list.length ? 'No quotes match.' : trash ? 'Trash is empty.' : 'No quotes yet. Click "New quote" to start.')));
  };
  const filters = h('div', { class: 'tabs' });
  const drawFilters = () => mount(filters, ['all', 'draft', 'sent', 'accepted', 'lost'].map((s) =>
    h('button', { class: status === s ? 'active' : '', onclick: () => { status = s; drawFilters(); draw(); } }, s[0].toUpperCase() + s.slice(1), ' ', h('span', { class: 'muted small' }, counts(s)))));
  if (!trash) drawFilters();
  page('quotes',
    h('div', { class: 'page-head' }, h('h1', null, trash ? 'Trash' : 'Quotes'),
      h('div', { class: 'row' },
        h('input', { type: 'search', placeholder: 'Search number, client, project', style: { width: '260px' }, oninput: (e) => { q = e.target.value; draw(); } }),
        trash ? h('a', { class: 'btn', href: '#/quotes' }, '← Back to quotes') : h('a', { class: 'btn', href: '#/quotes/trash' }, 'Trash'),
        trash || !isMock ? null : h('button', { onclick: () => { app.pendingDemo = demoQuote(app.settings, app.catalog); location.hash = '#/q/new'; } }, 'Sample quote'),
        trash ? null : h('a', { class: 'btn btn-brand', href: '#/q/new' }, '+ New quote'))),
    trash ? null : filters,
    h('div', { class: 'card table-wrap' }, h('table', null, h('thead', null, h('tr', null, h('th', null, 'Quote'), h('th', null, 'Client / project'), h('th', { class: 'num' }, 'Total (VAT ex.)'), h('th', null, 'Status'), h('th', { class: 'hide-sm' }, 'Updated'), h('th'))), tbody)));
  draw();
}

// ---------- router ----------
let lastHash = location.hash;
export function silentHash(hh) { if (location.hash !== hh) history.replaceState(null, '', hh); lastHash = hh; }
async function route() {
  const hash = location.hash || '#/quotes';
  if (app.guard && hash !== lastHash) {
    const ok = await app.guard();
    if (!ok) { history.replaceState(null, '', lastHash); return; }
  }
  app.guard = null; lastHash = hash;
  if (!session()) { app.user = null; if (hash !== '#/login') { location.hash = '#/login'; return; } return renderLogin(); }
  if (!app.settings) { try { await loadBoot(); } catch (e) { handleError(e); if (!session()) return renderLogin(); return; } }
  const [, a, b] = hash.split('/');
  if (a === 'login') { location.hash = '#/quotes'; return; }
  if (a === 'q') return renderEditor(b === 'new' ? null : b);
  if (a === 'catalog') return renderCatalog();
  if (a === 'packages') return renderPackages();
  if (a === 'settings') return renderSettings();
  return renderQuotes(b === 'trash');
}
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => { if (app.dirty) { e.preventDefault(); e.returnValue = ''; } });
route();
