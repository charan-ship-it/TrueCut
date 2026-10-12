import { getLibraryAsset } from '@truecut/db';
import { libraryFileResponse } from '@truecut/storage';
import { requireUser, HttpError } from '@/lib/auth';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  let u;
  try { u = await requireUser(); } catch (e) { return new Response('Please sign in', { status: e instanceof HttpError ? e.status : 401 }); }
  const a = await getLibraryAsset(params.id, u.workspaceId);
  if (!a) return new Response('Not found', { status: 404 });
  const thumb = new URL(req.url).searchParams.has('thumb');
  const r = await libraryFileResponse(u.workspaceId, thumb ? `${a.id}_t.jpg` : a.file);
  if (thumb && r.status === 404) return libraryFileResponse(u.workspaceId, a.file);
  return r;
}
