import { ok, route, fail } from '@/lib/http';
import { getJob } from '@truecut/queue';
export const dynamic = 'force-dynamic';
export const GET = route(async (_r: Request, { params }: { params: { jobId: string } }) => { const j = getJob(params.jobId); return j ? ok(j) : fail('Job not found', 404); });
