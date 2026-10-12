import { z } from 'zod';
import { ok, route, body, fail } from '@/lib/http';
import { authEnabled } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { createToken, listTokens } from '@truecut/db';
export const dynamic = 'force-dynamic';

export const GET = route(async (_r: Request, _c: any, u) => ok({ tokens: u.id ? await listTokens(u.id) : [] }));

const New = z.object({ name: z.string().max(60).default('Chrome extension'), days: z.number().int().min(1).max(365).default(180) }).strict();
export const POST = route(async (req: Request, _c: any, u) => {
  rateLimit('keys', u.id);
  if (!authEnabled() || !u.id) return fail('Extension tokens need sign-in (they upload as you). Set up Google sign-in, or upload screenshots on the Library page.', 400);
  const b = await body(req, New);
  return ok(await createToken({ workspaceId: u.workspaceId, userId: u.id, name: b.name, days: b.days }), 201);
});
