import { rateLimit } from '@/lib/ratelimit';
import { ok, projectRoute } from '@/lib/http';
import { startStoryboard } from '@truecut/core/director/actions';
export const dynamic = 'force-dynamic';
export const POST = projectRoute(async (_r: Request, { params }: { params: { id: string } }, user) => { rateLimit('heavy', user.id); return ok({ jobs: [(await startStoryboard(params.id, { createdBy: user.id || null })).id] }); });
