export const $ = (id) => document.getElementById(id);

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
export const cid = (() => { let v = store.get('noel.cid'); if (!v) { v = uuid(); store.set('noel.cid', v); } return v; })();

export const SHIRTS = ['#e63946', '#f4a261', '#ffd166', '#2a9d8f', '#4aa3f0', '#8b7cf6', '#ec6ba8', '#f1f5ff'];
export const HATS = ['#d62839', '#2fa36b', '#2a6fdb', '#9b5de5', '#f2a900', '#f1f5ff'];

export const me = {
  cid, pid: null, joined: false,
  ready: false, // true once the server has confirmed our player on the CURRENT connection (chat needs it)
  name: store.get('noel.name', ''), shirt: store.get('noel.shirt', SHIRTS[0]), hat: store.get('noel.hat', HATS[0]),
};

const listeners = new Map();
export const bus = {
  on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
  emit(type, data) { listeners.get(type)?.forEach((f) => f(data)); },
};

let toastTimer = 0;
export function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
