import { ok, route, fail } from '@/lib/http';
import { addSource, ingestUpload, removeSource } from '@/lib/ingest';
import { startIngest } from '@/lib/actions';
import { startJob } from '@/lib/jobs';
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };
export const POST = route(async (req: Request, { params }: C) => {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData(); const files = fd.getAll('files').filter((f): f is File => typeof f !== 'string');
    if (!files.length) return fail('No files');
    const bufs = await Promise.all(files.map(async (f) => ({ name: f.name, buf: Buffer.from(await f.arrayBuffer()) })));
    const job = startJob('upload', params.id, async (log) => { let k = 0; for (const f of bufs) { const s = addSource(params.id, 'upload', f.name); await ingestUpload(params.id, s.id, f.name, f.buf); log(`Added ${f.name}`, (++k / bufs.length) * 100); } });
    return ok({ jobs: [job.id] });
  }
  const b = await req.json();
  if (!['url', 'path', 'text'].includes(b.kind) || !String(b.value || '').trim()) return fail('Give a URL, a folder path or some text.');
  const s = addSource(params.id, b.kind, String(b.value).trim(), b.label || (b.kind === 'text' ? 'Pasted notes' : undefined));
  const job = startIngest(params.id, s.id, b.kind, String(b.value));
  return ok({ source: s, jobs: [job.id] });
});
export const DELETE = route(async (req: Request, { params }: C) => { const sid = new URL(req.url).searchParams.get('sid'); if (!sid) return fail('sid required'); removeSource(params.id, sid); return ok({ removed: sid }); });
