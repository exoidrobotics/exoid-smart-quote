// Tiny DOM helpers. Text is always set via textContent (no HTML injection).
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...children) => { clear(el); append(el, children); return el; };

export function field(label, input, hint) {
  return h('label', { class: 'field' }, label, input, hint ? h('span', { class: 'hint' }, hint) : null);
}
export function select(options, value, onChange, attrs = {}) {
  return h('select', { ...attrs, onchange: (e) => onChange(e.target.value) },
    options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) }, t); }));
}
export function sw(checked, onChange, title) {
  return h('label', { class: 'switch', title, onclick: (e) => e.stopPropagation() },
    h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }), h('span'));
}

export function toast(msg, isErr) {
  const t = h('div', { class: 'toast' + (isErr ? ' err' : '') }, msg);
  document.getElementById('toast-root').appendChild(t);
  setTimeout(() => t.remove(), isErr ? 6000 : 2600);
}

export function modal({ title, body, actions = [], wide }) {
  const root = document.getElementById('modal-root');
  const close = () => { root.removeChild(back); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal', style: wide ? { maxWidth: '980px' } : null, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'btn-ghost', onclick: close, 'aria-label': 'Close' }, '✕')),
      h('div', { class: 'modal-body' }, typeof body === 'function' ? body(close) : body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', { class: a.class || '', onclick: () => a.onClick(close) }, a.label))) : null));
  root.appendChild(back);
  document.addEventListener('keydown', esc);
  const first = back.querySelector('input, select, textarea'); if (first) setTimeout(() => first.focus(), 30);
  return close;
}
export function confirmBox(title, text, okLabel = 'OK', danger) {
  return new Promise((res) => modal({ title, body: h('p', null, text), actions: [
    { label: 'Cancel', onClick: (c) => { c(); res(false); } },
    { label: okLabel, class: danger ? 'btn-primary btn-danger' : 'btn-primary', onClick: (c) => { c(); res(true); } }] }));
}
export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const clone = (o) => JSON.parse(JSON.stringify(o));
export function download(filename, blobOrText, type = 'application/json') {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }); };
export const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + (Number(n) || 0)); return d.toISOString().slice(0, 10); };
