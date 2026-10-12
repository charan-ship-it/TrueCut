import { ok, route } from '@/lib/http';
import { authEnabled, roleOf } from '@/lib/auth';
import { resolveRunContext } from '@truecut/db';
export const dynamic = 'force-dynamic';
export const GET = route(async (_r: Request, _c: any, user) => {
  const ctx = await resolveRunContext({ workspaceId: user.workspaceId, userId: user.id || null });
  return ok({ user: { id: user.id, name: user.name, email: user.email, image: user.image }, auth: authEnabled(), role: await roleOf(user), keys: { anthropic: ctx.keys?.anthropicSource, elevenlabs: ctx.keys?.elevenSource } });
});
