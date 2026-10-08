import { ok, projectRoute, fail } from '@/lib/http';
import { startTurn } from '@truecut/core/director/agent';
import { readAction, applyOptions } from '@/lib/chatreq';
import { updateProject } from '@truecut/db';
import { isBusy } from '@truecut/queue';
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };

export const POST = projectRoute(async (req: Request, { params }: C, user) => {
  if (await isBusy(params.id)) return fail('Nick is still working on the last request.', 409);
  const action = await readAction(req);
  if ((action as any).options) await updateProject(params.id, (p) => applyOptions(p, action));
  const job = await startTurn(params.id, action, { createdBy: user.id || null });
  return ok({ job: job.id });
});
