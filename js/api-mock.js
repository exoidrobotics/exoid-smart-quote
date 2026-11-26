// DEMO backend that runs in the browser (made-up data, saved in this browser only).
// Mirrors the real server's rules: token check on every call, version conflicts, frozen revisions.
import { demoData } from './mock-data.js';

export const DEMO_LOGIN = { code: 'DEMO', password: 'demo1234' };   // made-up demo credentials, not a real account
const KEY = 'exoid-sq-demo-db-v1';
const err = (code, message, data) => Object.assign(new Error(message), { code, data });
const now = () => new Date().toISOString();
const rid = (p) => p + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = (o) => JSON.parse(JSON.stringify(o));
let mem = null;

function load() {
  if (mem) return mem;
  try { mem = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { mem = null; }
  if (!mem) mem = { ...demoData(), sessions: {} };
  return mem;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* private mode: keep in memory */ } }

function summary(q) {
  return { id: q.id, number: q.number, rev: q.rev, status: q.status, deleted: !!q.deleted, client: q.client && q.client.name,
    project: q.project && q.project.name, total: q.summary ? q.summary.total : 0, quoteDate: q.quoteDate, updatedAt: q.updatedAt,
    updatedBy: q.updatedBy, preparedBy: q.preparedBy, revisions: (q.revisions || []).length };
}

export async function mockApi(action, p, token) {
  await new Promise((r) => setTimeout(r, 120));           // feel like a network call
  const db = load();
  if (action === 'login') {
    if (String(p.code || '').trim().toUpperCase() !== DEMO_LOGIN.code || p.password !== DEMO_LOGIN.password) {
      throw err('bad-login', 'Wrong user code or password.');
    }
    const t = rid('tok'), expires = Date.now() + 12 * 3600 * 1000;
    db.sessions[t] = { code: DEMO_LOGIN.code, expires }; save();
    return { token: t, expires, user: { code: DEMO_LOGIN.code, name: 'Demo User' } };
  }
  const s = token && db.sessions[token];
  if (!s || s.expires < Date.now()) { if (s) { delete db.sessions[token]; save(); } throw err('auth', 'Please sign in again.'); }
  const user = s.code;

  switch (action) {
    case 'logout': delete db.sessions[token]; save(); return true;
    case 'bootstrap': return { settings: db.settings, catalog: db.catalog, packages: db.packages, user: { code: user, name: 'Demo User' } };
    case 'listQuotes': return Object.values(db.quotes).filter((q) => p && p.trash ? q.deleted : !q.deleted).map(summary)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    case 'getQuote': { const q = db.quotes[p.id]; if (!q) throw err('not-found', 'Quote not found.'); return clone(q); }
    case 'getRevision': { const r = db.revisions[p.id + ':' + p.rev]; if (!r) throw err('not-found', 'Revision not found.'); return clone(r); }
    case 'saveQuote': {
      const q = clone(p.quote);
      if (!q.id) {
        const d = db.settings.defaults, year = new Date().getFullYear();
        q.id = rid('q'); q.number = `${d.quotePrefix}-${year}-${String(d.nextNumber).padStart(4, '0')}`; d.nextNumber++;
        q.rev = 0; q.status = 'draft'; q.version = 0; q.createdAt = now(); q.createdBy = user; q.revisions = [];
        q.quoteDate = q.quoteDate || now().slice(0, 10);
      } else {
        const cur = db.quotes[q.id];
        if (!cur) throw err('not-found', 'Quote not found.');
        if (cur.version !== q.version) throw err('conflict', `This quote was changed by ${cur.updatedBy} at ${new Date(cur.updatedAt).toLocaleString()}. Reload it, or save your version as a copy.`, { updatedBy: cur.updatedBy, updatedAt: cur.updatedAt });
        if (cur.status !== 'draft') throw err('frozen', 'This revision was sent and is frozen. Create a new revision to change it.');
        q.number = cur.number; q.rev = cur.rev; q.quoteDate = cur.quoteDate; q.createdAt = cur.createdAt; q.revisions = cur.revisions; q.status = cur.status;
      }
      q.version = (q.version || 0) + 1; q.updatedAt = now(); q.updatedBy = user;
      db.quotes[q.id] = q; save(); return clone(q);
    }
    case 'markSent': {
      const q = db.quotes[p.id]; if (q.version !== p.version) throw err('conflict', 'Save or reload before marking as sent.');
      q.status = 'sent'; q.sentAt = now(); q.version++; q.updatedAt = now(); q.updatedBy = user;
      q.revisions = [...(q.revisions || []), { rev: q.rev, sentAt: q.sentAt, total: q.summary ? q.summary.total : 0 }];
      db.revisions[q.id + ':' + q.rev] = clone(q); save(); return clone(q);
    }
    case 'newRevision': {
      const q = db.quotes[p.id]; if (q.status === 'draft') throw err('bad', 'This revision is still a draft.');
      q.rev += 1; q.status = 'draft'; q.sentAt = null; q.version++; q.updatedAt = now(); q.updatedBy = user; save(); return clone(q);
    }
    case 'setStatus': { const q = db.quotes[p.id]; if (q.version !== p.version) throw err('conflict', 'Reload first.'); q.status = p.status; q.version++; q.updatedAt = now(); q.updatedBy = user; save(); return clone(q); }
    case 'duplicateQuote': {
      const src = clone(db.quotes[p.id]); const d = db.settings.defaults, year = new Date().getFullYear();
      Object.assign(src, { id: rid('q'), number: `${d.quotePrefix}-${year}-${String(d.nextNumber).padStart(4, '0')}`, rev: 0, status: 'draft', version: 1,
        revisions: [], createdAt: now(), quoteDate: now().slice(0, 10), updatedAt: now(), updatedBy: user, sentAt: null, deleted: false });
      d.nextNumber++; src.project = { ...src.project, name: (src.project.name || '') + ' (copy)' }; db.quotes[src.id] = src; save(); return clone(src);
    }
    case 'deleteQuote': db.quotes[p.id].deleted = true; db.quotes[p.id].updatedAt = now(); save(); return true;
    case 'restoreQuote': db.quotes[p.id].deleted = false; save(); return true;
    case 'saveCatalog': {
      for (const it of p.items) { if (!it.id) it.id = rid('cat'); const i = db.catalog.findIndex((c) => c.id === it.id); it.updatedAt = now(); if (i >= 0) db.catalog[i] = it; else db.catalog.push(it); }
      save(); return db.catalog;
    }
    case 'savePackages': db.packages = p.packages; save(); return db.packages;
    case 'saveSettings': db.settings = p.settings; save(); return db.settings;
    case 'exportAll': return { format: 'exoid-smart-quote', version: 1, exportedAt: now(), settings: db.settings, catalog: db.catalog, packages: db.packages, quotes: db.quotes, revisions: db.revisions };
    case 'importAll': {
      const d = p.data; if (!d || d.format !== 'exoid-smart-quote') throw err('bad', 'Not an Exoid Smart Quote file.');
      if (d.settings) db.settings = d.settings; if (d.catalog) db.catalog = d.catalog; if (d.packages) db.packages = d.packages;
      if (d.quotes) Object.assign(db.quotes, d.quotes); if (d.revisions) Object.assign(db.revisions, d.revisions);
      save(); return true;
    }
    default: throw err('bad', 'Unknown action ' + action);
  }
}

export function resetDemo() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } mem = null; }
