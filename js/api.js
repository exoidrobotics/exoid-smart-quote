// Backend client. Same interface for the real Apps Script backend and the demo (mock) backend.
import { API_URL } from './config.js';
import { mockApi } from './api-mock.js';

const TOKEN_KEY = 'exoid-sq-session';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch { return null; } },
  set(v) { try { v ? localStorage.setItem(TOKEN_KEY, JSON.stringify(v)) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } },
};

export const isMock = !API_URL || new URLSearchParams(location.search).has('mock');

export class ApiError extends Error { constructor(code, message, data) { super(message); this.code = code; this.data = data; } }

async function call(action, payload = {}) {
  const sess = store.get();
  if (isMock) {
    try { return await mockApi(action, payload, sess && sess.token); }
    catch (e) { if (e.code === 'auth') store.set(null); throw e; }
  }
  let res;
  try {
    res = await fetch(API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: sess && sess.token, payload }) });
  } catch { throw new ApiError('network', 'Cannot reach the server. Check your internet connection.'); }
  let out;
  try { out = await res.json(); } catch { throw new ApiError('server', 'Unexpected response from the server.'); }
  if (!out.ok) {
    if (out.error && out.error.code === 'auth') store.set(null);
    throw new ApiError(out.error ? out.error.code : 'server', out.error ? out.error.message : 'Server error', out.error && out.error.data);
  }
  return out.data;
}

export const session = () => store.get();
export const api = {
  async login(code, password) { const d = await call('login', { code, password }); store.set(d); return d; },
  async logout() { try { await call('logout'); } finally { store.set(null); } },
  bootstrap: () => call('bootstrap'),
  listQuotes: (opts) => call('listQuotes', opts),
  getQuote: (id) => call('getQuote', { id }),
  getRevision: (id, rev) => call('getRevision', { id, rev }),
  saveQuote: (quote) => call('saveQuote', { quote }),
  markSent: (id, version) => call('markSent', { id, version }),
  newRevision: (id) => call('newRevision', { id }),
  setStatus: (id, status, version) => call('setStatus', { id, status, version }),
  duplicateQuote: (id) => call('duplicateQuote', { id }),
  deleteQuote: (id) => call('deleteQuote', { id }),
  restoreQuote: (id) => call('restoreQuote', { id }),
  saveCatalog: (items) => call('saveCatalog', { items }),
  savePackages: (packages) => call('savePackages', { packages }),
  saveSettings: (settings) => call('saveSettings', { settings }),
  exportAll: () => call('exportAll'),
  importAll: (data) => call('importAll', { data }),
};
