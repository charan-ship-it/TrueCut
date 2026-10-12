import { rateLimit } from '@/lib/ratelimit';
import { ok, projectRoute } from '@/lib/http';
import { startVoice } from '@truecut/core/director/actions';
export const dynamic = 'force-dynamic';
export const POST = projectRoute(async (_r: Request, { params }: { params: { id: string } }, user) => { rateLimit('heavy', user.id); return ok({ jobs: [(await startVoice(params.id, { createdBy: user.id || null })).id] }); });
