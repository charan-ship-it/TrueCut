import { ok, projectRoute } from '@/lib/http';
import { projectJobs } from '@truecut/queue';
export const dynamic = 'force-dynamic';
export const GET = projectRoute(async (_r: Request, { params }: { params: { id: string } }) => ok(await projectJobs(params.id)));
