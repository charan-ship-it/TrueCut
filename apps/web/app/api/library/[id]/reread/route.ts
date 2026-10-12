import { ok, route, fail } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { getLibraryAsset, updateLibraryAsset } from '@truecut/db';
import { rereadAsset } from '@truecut/core/library/library';
export const dynamic = 'force-dynamic';
export const POST = route(async (_r: Request, { params }: { params: { id: string } }, u) => {
  rateLimit('heavy', u.id);
  const a = await getLibraryAsset(params.id, u.workspaceId);
  if (!a) return fail('Not found', 404);
  await updateLibraryAsset(a.id, { status: 'pending', error: null });
  const job = await rereadAsset(a, u.id || null);
  return ok({ job: job.id });
});
