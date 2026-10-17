import { z } from 'zod';
import { ok, route, body } from '@/lib/http';
import { requireOwner, HttpError } from '@/lib/auth';
import { inviteMember, revokeInvite } from '@truecut/db';
export const dynamic = 'force-dynamic';

/** An owner lets an address sign in (even outside the allowed domains) with the role it should get. */
export const POST = route(async (req: Request, _c: any, u) => {
  await requireOwner(u);
  const b = await body(req, z.object({ email: z.string().trim().min(3).max(200), role: z.enum(['owner', 'member']).default('member') }));
  try { return ok({ email: await inviteMember(b.email, b.role, u.id || null, u.workspaceId) }); } catch (e: any) { throw new HttpError(400, e.message); }
});

export const DELETE = route(async (req: Request, _c: any, u) => {
  await requireOwner(u);
  const b = await body(req, z.object({ email: z.string().trim().min(3).max(200) }));
  await revokeInvite(b.email, u.workspaceId);
  return ok({ ok: true });
});
