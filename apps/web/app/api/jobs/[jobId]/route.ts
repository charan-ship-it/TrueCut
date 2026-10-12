import { ok, route, fail } from '@/lib/http';
import { requireProject } from '@/lib/auth';
import { getJob } from '@truecut/queue';
export const dynamic = 'force-dynamic';
export const GET = route(async (_r: Request, { params }: { params: { jobId: string } }, u) => {
  const j = await getJob(params.jobId);
  if (!j) return fail('Job not found', 404);
  if (j.projectId) await requireProject(j.projectId);
  else if ((j.payload as any)?.workspaceId !== u.workspaceId) return fail('Job not found', 404);
  return ok(j);
});
