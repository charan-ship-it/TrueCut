import { ok, route, fail } from '@/lib/http';
import { addSource, removeSource } from '@truecut/core/sources/ingest';
import { startIngest } from '@truecut/core/director/actions';
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };
// Files go through PUT …/uploads?ingest=1; this route adds links, folder paths and pasted text.
export const POST = route(async (req: Request, { params }: C) => {
  const b = await req.json();
  if (!['url', 'path', 'text'].includes(b.kind) || !String(b.value || '').trim()) return fail('Give a URL, a folder path or some text.');
  const s = await addSource(params.id, b.kind, String(b.value).trim(), b.label || (b.kind === 'text' ? 'Pasted notes' : undefined));
  const job = await startIngest(params.id, s.id, b.kind, String(b.value));
  return ok({ source: s, jobs: [job.id] });
});
export const DELETE = route(async (req: Request, { params }: C) => { const sid = new URL(req.url).searchParams.get('sid'); if (!sid) return fail('sid required'); await removeSource(params.id, sid); return ok({ removed: sid }); });
