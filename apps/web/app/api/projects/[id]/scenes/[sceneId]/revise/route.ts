import { ok, route, fail } from '@/lib/http';
import { startRevise } from '@truecut/core/director/actions';
export const dynamic = 'force-dynamic';
export const POST = route(async (req: Request, { params }: { params: { id: string; sceneId: string } }) => {
  const b = await req.json(); if (!String(b.instruction || '').trim()) return fail('Say what to change.');
  return ok({ jobs: [(await startRevise(params.id, params.sceneId, String(b.instruction))).id] });
});
