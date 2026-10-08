import { ok, route } from '@/lib/http';
import { projectJobs } from '@truecut/queue';
export const dynamic = 'force-dynamic';
export const GET = route(async (_r: Request, { params }: { params: { id: string } }) => ok(projectJobs(params.id)));
