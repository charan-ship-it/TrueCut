// Shared by the popup, the editor and the service worker.
export const MAX_BYTES = 25 * 1024 * 1024;

// The address people connect to by default; the connect page on that server pairs the extension without typing it.
export const DEFAULT_SERVER = 'https://truecut.up.railway.app';

// ── settings (server + token) ──
export async function getConn() { const { conn } = await chrome.storage.local.get('conn'); return conn || null; }
export async function setConn(conn) { await chrome.storage.local.set({ conn }); }
export async function clearConn() { await chrome.storage.local.remove('conn'); }
export function normalizeServer(input) {
  let s = String(input || '').trim().replace(/\/+$/, '');
  if (!s) throw new Error('Enter your TrueCut address, e.g. https://truecut.up.railway.app');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const u = new URL(s);
  if (u.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error('Use the https:// address (plain http only works for localhost).');
  return u.origin;
}

// ── API ──
export class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } }
export async function apiFetch(path, init = {}) {
  const conn = await getConn();
  if (!conn) throw new ApiError('Connect to TrueCut first.', 0, 'not_connected');
  let r;
  try { r = await fetch(conn.server + path, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${conn.token}` } }); }
  catch { throw new ApiError("Couldn't reach TrueCut. Check your connection; the capture is kept and can be retried.", 0, 'network'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error || `TrueCut answered ${r.status}`, r.status, j.code || (r.status === 401 ? 'unauthorized' : undefined));
  return j;
}

// ── pending captures live in IndexedDB (shared by the service worker and the extension pages) ──
let dbp = null;
function db() {
  if (dbp) return dbp;
  return (dbp = new Promise((res, rej) => {
    const o = indexedDB.open('truecut', 1);
    o.onupgradeneeded = () => o.result.createObjectStore('captures', { keyPath: 'id' });
    o.onsuccess = () => { o.result.onversionchange = () => { o.result.close(); dbp = null; }; res(o.result); };
    o.onerror = () => { dbp = null; rej(o.error); };
  }));
}
async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('captures', mode); const s = t.objectStore('captures'); const r = fn(s); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); }); }
export const putCapture = (c) => tx('readwrite', (s) => s.put(c));
export const getCapture = (id) => tx('readonly', (s) => s.get(id));
export const deleteCapture = (id) => tx('readwrite', (s) => s.delete(id));
export const listCaptures = () => tx('readonly', (s) => s.getAll());

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Upload one capture. Throws ApiError; on success removes it from the queue. */
export async function uploadCapture(c) {
  if (c.blob.size > MAX_BYTES) throw new ApiError('This capture is over 25 MB. Select a smaller area.', 413, 'too_large');
  const fd = new FormData();
  fd.append('image', c.blob, `capture.${c.blob.type === 'image/jpeg' ? 'jpg' : 'png'}`);
  fd.append('meta', JSON.stringify({ title: c.title, url: c.includeUrl ? c.url : undefined, product: c.product || undefined, tags: c.tags || [], capturedAt: c.capturedAt }));
  const j = await apiFetch('/api/ext/captures', { method: 'POST', body: fd });
  await deleteCapture(c.id);
  if (c.product) { const { lastProduct = {} } = await chrome.storage.local.get('lastProduct'); try { lastProduct[new URL(c.url).hostname] = c.product; } catch {} await chrome.storage.local.set({ lastProduct }); }
  return j.item;
}
