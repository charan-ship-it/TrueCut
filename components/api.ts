'use client';
export async function api<T = any>(url: string, opts: RequestInit & { json?: any } = {}): Promise<T> {
  const init: RequestInit = { ...opts };
  if (opts.json !== undefined) { init.body = JSON.stringify(opts.json); init.headers = { 'content-type': 'application/json', ...(opts.headers || {}) }; init.method = opts.method || 'POST'; }
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j as T;
}
export const fileUrl = (pid: string, rel: string) => `/api/files/${pid}/${rel}`;
export const timeAgo = (iso: string) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return new Date(iso).toLocaleDateString(); };
