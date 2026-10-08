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

/** Stream files into a project (PUT …/uploads). Returns them as chat attachments. */
export async function uploadFiles(pid: string, files: File[], opts: { ingest?: boolean } = {}) {
  const atts: { kind: 'upload'; label: string; ref: string }[] = [];
  for (const f of files) {
    const r = await fetch(`/api/projects/${pid}/uploads?name=${encodeURIComponent(f.name)}${opts.ingest ? '&ingest=1' : ''}`, { method: 'PUT', body: f, headers: { 'content-type': f.type || 'application/octet-stream' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Upload of ${f.name} failed`);
    atts.push({ kind: 'upload', label: f.name, ref: j.source.id });
  }
  return atts;
}
