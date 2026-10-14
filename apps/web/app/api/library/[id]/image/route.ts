import { getLibraryAsset } from '@truecut/db';
import { libraryFileResponse, libraryFileExists } from '@truecut/storage';
import { requireUser, HttpError } from '@/lib/auth';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  let u;
  try { u = await requireUser(); } catch (e) { return new Response('Please sign in', { status: e instanceof HttpError ? e.status : 401 }); }
  const a = await getLibraryAsset(params.id, u.workspaceId);
  if (!a) return new Response('Not found', { status: 404 });
  const thumb = new URL(req.url).searchParams.has('thumb');
  // a shot saved before thumbnails existed (or whose thumbnail step failed) shows the original instead of a broken image
  const useThumb = thumb && (await libraryFileExists(u.workspaceId, `${a.id}_t.jpg`).catch(() => false));
  return libraryFileResponse(u.workspaceId, useThumb ? `${a.id}_t.jpg` : a.file);
}
