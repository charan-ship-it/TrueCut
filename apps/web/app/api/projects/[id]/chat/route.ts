import { ok, projectRoute, fail } from '@/lib/http';
import { startTurn, BusyError } from '@truecut/core/director/agent';
import { readAction, applyOptions } from '@/lib/chatreq';
import { updateProject } from '@truecut/db';
import { isBusy } from '@truecut/queue';
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };

export const POST = projectRoute(async (req: Request, { params }: C, user) => {
  if (await isBusy(params.id)) return fail('Nick is still working on the last request.', 409);
  const action = await readAction(req);
  if ((action as any).options) await updateProject(params.id, (p) => applyOptions(p, action));
  let job;
  try { job = await startTurn(params.id, action, { createdBy: user.id || null }); }
  catch (e) { if (e instanceof BusyError) return fail(e.message, 409); throw e; }
  return ok({ job: job.id });
});
