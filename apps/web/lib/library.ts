// Shared bits of the library API (web uploads and the extension use the same path).
import { addCapture, MAX_CAPTURE_BYTES, cleanTags } from '@truecut/core/library/library';
import { HttpError } from './auth';

/** The JSON a library asset is sent to the browser as (no storage paths, no hashes). */
export function assetView(a: any) {
  const an = a.analysis || null;
  return {
    id: a.id, title: a.title, url: a.url, domain: a.domain, product: a.product, tags: a.tags || [], source: a.source,
    w: a.w, h: a.h, bytes: a.bytes, status: a.status, error: a.error, createdBy: a.createdByName ?? undefined,
    capturedAt: (a.capturedAt || a.createdAt)?.toISOString?.() || null, createdAt: a.createdAt?.toISOString?.() || null,
    image: `/api/library/${a.id}/image`, thumb: `/api/library/${a.id}/image?thumb=1`,
    summary: an?.summary || '', kind: an?.kind || null, numbers: an?.numbers || [], text: an?.text || '',
    sensitive: an?.sensitive || { has: false, kinds: [] },
  };
}

/** Read a multipart capture: field "image" (file) and optional "meta" (JSON), or plain fields. */
export async function readCapture(req: Request) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_CAPTURE_BYTES + 512 * 1024) throw new HttpError(413, 'That image is over 25 MB.');
  let fd: FormData;
  try { fd = await req.formData(); } catch { throw new HttpError(400, 'Expected multipart/form-data with an "image" file.'); }
  const files = [...fd.getAll('image'), ...fd.getAll('files')].filter((f): f is File => typeof f !== 'string');
  if (!files.length) throw new HttpError(400, 'No image in the upload.');
  let meta: any = {};
  const rawMeta = fd.get('meta');
  if (typeof rawMeta === 'string' && rawMeta) { try { meta = JSON.parse(rawMeta); } catch { throw new HttpError(400, 'meta must be JSON.'); } }
  for (const k of ['title', 'url', 'product', 'capturedAt']) { const v = fd.get(k); if (typeof v === 'string' && meta[k] == null) meta[k] = v; }
  const tags = fd.get('tags'); if (typeof tags === 'string' && !meta.tags) meta.tags = tags;
  meta.tags = cleanTags(meta.tags);
  return { files, meta };
}

export async function storeCaptures(u: { id: string; workspaceId: string }, files: File[], meta: any, source: 'extension' | 'upload') {
  const out = [];
  for (const f of files.slice(0, 20)) {
    const data = Buffer.from(await f.arrayBuffer());
    const title = files.length > 1 ? meta.title || f.name.replace(/\.[a-z0-9]+$/i, '') : meta.title || (source === 'upload' ? f.name.replace(/\.[a-z0-9]+$/i, '') : undefined);
    const r = await addCapture({ workspaceId: u.workspaceId, userId: u.id || null, data, meta: { ...meta, title, source } });
    out.push({ ...assetView(r.asset), duplicate: r.duplicate });
  }
  return out;
}
