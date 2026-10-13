import { z } from 'zod';
import { ok, route, body } from '@/lib/http';
import { authEnabled, roleOf } from '@/lib/auth';
import { resolveRunContext, getUser, setUserName, nameFromEmail } from '@truecut/db';
import { pathsAllowed } from '@truecut/core/sources/ingest';
export const dynamic = 'force-dynamic';

// The name comes from the database, not the session cookie, so a change in Settings shows straight away.
export const GET = route(async (_r: Request, _c: any, user) => {
  const ctx = await resolveRunContext({ workspaceId: user.workspaceId, userId: user.id || null });
  const row = user.id ? await getUser(user.id) : null;
  // accounts made before names were guessed from the address have the bare address prefix ("charan")
  const name = row?.name && row.name !== user.email.split('@')[0] ? row.name : nameFromEmail(user.email);
  return ok({ user: { id: user.id, name: user.id ? name : user.name, email: user.email, image: row?.image ?? user.image }, auth: authEnabled(), local: pathsAllowed(), role: await roleOf(user), keys: { anthropic: ctx.keys?.anthropicSource, elevenlabs: ctx.keys?.elevenSource } });
});

export const PATCH = route(async (req: Request, _c: any, user) => {
  const b = await body(req, z.object({ name: z.string().trim().min(1, 'Please enter a name.').max(80) }));
  if (!user.id) return ok({ name: b.name }); // sign-in off (a laptop): nothing to save
  const u = await setUserName(user.id, b.name);
  return ok({ name: u?.name });
});
