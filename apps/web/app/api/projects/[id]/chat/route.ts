import { ok, route, fail } from '@/lib/http';
import { startTurn } from '@truecut/core/director/agent';
import { readAction } from '@/lib/chatreq';
import { isBusy } from '@truecut/queue';
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };

export const POST = route(async (req: Request, { params }: C) => {
  if (await isBusy(params.id)) return fail('Nick is still working on the last request.', 409);
  const action = await readAction(req, params.id);
  const job = await startTurn(params.id, action);
  return ok({ job: job.id });
});
