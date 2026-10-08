import { ok, route, fail } from '@/lib/http';
import { requireProject } from '@/lib/auth';
import { getJob } from '@truecut/queue';
export const dynamic = 'force-dynamic';
export const GET = route(async (_r: Request, { params }: { params: { jobId: string } }) => {
  const j = await getJob(params.jobId);
  if (!j) return fail('Job not found', 404);
  if (j.projectId) await requireProject(j.projectId);
  return ok(j);
});
