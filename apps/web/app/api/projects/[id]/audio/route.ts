import { ok, projectRoute } from '@/lib/http';
import { startAudio } from '@truecut/core/director/actions';
export const dynamic = 'force-dynamic';
export const POST = projectRoute(async (_r: Request, { params }: { params: { id: string } }, user) => ok({ jobs: [(await startAudio(params.id, { createdBy: user.id || null })).id] }));
