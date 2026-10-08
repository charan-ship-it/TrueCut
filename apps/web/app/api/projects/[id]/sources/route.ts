import { ok, route, fail } from '@/lib/http';
import { addSource, ingestUpload, removeSource } from '@truecut/core/sources/ingest';
import { startIngest } from '@truecut/core/director/actions';
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };
export const POST = route(async (req: Request, { params }: C) => {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData(); const files = fd.getAll('files').filter((f): f is File => typeof f !== 'string');
    if (!files.length) return fail('No files');
    const bufs = await Promise.all(files.map(async (f) => ({ name: f.name, buf: Buffer.from(await f.arrayBuffer()) })));
    const added: string[] = [];
    for (const f of bufs) { const s = await addSource(params.id, 'upload', f.name); await ingestUpload(params.id, s.id, f.name, f.buf); added.push(s.id); }
    return ok({ sources: added, jobs: [] });
  }
  const b = await req.json();
  if (!['url', 'path', 'text'].includes(b.kind) || !String(b.value || '').trim()) return fail('Give a URL, a folder path or some text.');
  const s = await addSource(params.id, b.kind, String(b.value).trim(), b.label || (b.kind === 'text' ? 'Pasted notes' : undefined));
  const job = await startIngest(params.id, s.id, b.kind, String(b.value));
  return ok({ source: s, jobs: [job.id] });
});
export const DELETE = route(async (req: Request, { params }: C) => { const sid = new URL(req.url).searchParams.get('sid'); if (!sid) return fail('sid required'); await removeSource(params.id, sid); return ok({ removed: sid }); });
