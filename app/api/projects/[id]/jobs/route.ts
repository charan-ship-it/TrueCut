import { ok, route } from '@/lib/http';
import { projectJobs } from '@/lib/jobs';
export const dynamic = 'force-dynamic';
export const GET = route(async (_r: Request, { params }: { params: { id: string } }) => ok(projectJobs(params.id)));
