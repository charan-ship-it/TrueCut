// Serves a project's files to the browser. Local storage: straight from disk, with Range support.
// Bucket storage: images, audio and video redirect to a short-lived signed link (bucket egress is free
// and seeking works natively); text and JSON are proxied so the page can read them without CORS.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { projectPath, mimeOf, isMediaFile, storageDriver, getObject, signedUrl } from '@truecut/storage';
import { requireProject, HttpError } from '@/lib/auth';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string; path: string[] } }) {
  try { await requireProject(params.id); } catch (e) { const st = e instanceof HttpError ? e.status : 404; return new Response(st === 401 ? 'Please sign in' : 'Not found', { status: st }); }
  const rel = params.path.join('/');
  let f: string;
  try { f = projectPath(params.id, rel); } catch { return new Response('Bad path', { status: 400 }); }
  const type = mimeOf(f);
  const dl = new URL(req.url).searchParams.has('download');
  const headers: Record<string, string> = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' };
  if (dl) headers['content-disposition'] = `attachment; filename="${path.basename(f)}"`;
  const range = req.headers.get('range') || undefined;

  if (storageDriver() === 's3') {
    if (isMediaFile(f) || dl) {
      const url = await signedUrl(params.id, rel, { seconds: 3600, download: dl ? path.basename(f) : undefined, type });
      return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'private, max-age=600' } });
    }
    const o = await getObject(params.id, rel, range);
    if (!o) return new Response('Not found', { status: 404 });
    if ((o as any).unsatisfiable) return new Response(null, { status: 416 });
    const h = { ...headers, 'content-length': String(o.size), ...(o.range ? { 'content-range': o.range } : {}) };
    return new Response(Readable.toWeb(o.body) as any, { status: o.range ? 206 : 200, headers: h });
  }

  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('Not found', { status: 404 });
  const size = fs.statSync(f).size;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/); const start = m && m[1] ? +m[1] : 0; const end = m && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(f, { start, end })) as any, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(f)) as any, { headers: { ...headers, 'content-length': String(size) } });
}
