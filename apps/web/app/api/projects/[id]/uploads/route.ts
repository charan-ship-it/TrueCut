// PUT /api/projects/:id/uploads?name=<file name>[&ingest=1]   body: the raw file
// Streams the file into the project (local folder, then the bucket) without holding it in memory, and
// adds it as a source. Nick reads it during the next chat turn; ?ingest=1 (the Edit bay) reads it now.
import { Readable, Transform } from 'node:stream';
import { ok, projectRoute, fail } from '@/lib/http';
import { addSource, canUpload, uploadPath, removeSource } from '@truecut/core/sources/ingest';
import { startIngest } from '@truecut/core/director/actions';
import { getProject } from '@truecut/db';
import { saveFile } from '@truecut/storage';
export const dynamic = 'force-dynamic';

const MAX = 4 * 1024 ** 3; // 4 GB

export const PUT = projectRoute(async (req: Request, { params }: { params: { id: string } }, user) => {
  const u = new URL(req.url);
  const name = (u.searchParams.get('name') || '').replace(/[\\/]/g, '_').slice(0, 200);
  if (!name) return fail('name is required');
  if (!canUpload(name)) return fail(`TrueCut can't read ${name}. Use images, recordings (.mp4/.mov/.mp3/.wav/.m4a), .md, .txt, .csv, .html or .vtt.`);
  if (Number(req.headers.get('content-length') || 0) > MAX) return fail('That file is over 4 GB.', 413);
  if (!req.body) return fail('Empty upload');
  await getProject(params.id); // 404 for unknown projects
  const src = await addSource(params.id, 'upload', name, name, { name });
  const rel = uploadPath(src.id, name);
  let bytes = 0;
  const limit = new Transform({ transform(chunk, _e, cb) { bytes += chunk.length; cb(bytes > MAX ? new Error('That file is over 4 GB.') : null, chunk); } });
  const body = Readable.fromWeb(req.body as any); body.on('error', (e) => limit.destroy(e));
  try { await saveFile(params.id, rel, body.pipe(limit)); }
  catch (e) { await removeSource(params.id, src.id).catch(() => {}); throw e; }
  const jobs = u.searchParams.get('ingest') ? [(await startIngest(params.id, src.id, 'upload', name, { createdBy: user.id || null })).id] : [];
  return ok({ source: { id: src.id, label: name }, jobs });
});
