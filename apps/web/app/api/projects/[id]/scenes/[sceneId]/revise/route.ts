import { ok, projectRoute, fail } from '@/lib/http';
import { startRevise } from '@truecut/core/director/actions';
export const dynamic = 'force-dynamic';
export const POST = projectRoute(async (req: Request, { params }: { params: { id: string; sceneId: string } }, user) => {
  const b = await req.json(); if (!String(b.instruction || '').trim()) return fail('Say what to change.');
  return ok({ jobs: [(await startRevise(params.id, params.sceneId, String(b.instruction), { createdBy: user.id || null })).id] });
});
