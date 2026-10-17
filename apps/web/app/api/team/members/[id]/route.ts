import { z } from 'zod';
import { ok, route, body } from '@/lib/http';
import { requireOwner, HttpError } from '@/lib/auth';
import { updateMember } from '@truecut/db';
export const dynamic = 'force-dynamic';

const Patch = z.object({ role: z.enum(['owner', 'member']).optional(), disabled: z.boolean().optional() }).strict();

/** Owners change a person's role or switch their access off and on. */
export const PATCH = route(async (req: Request, ctx: { params: { id: string } }, u) => {
  await requireOwner(u);
  const b = await body(req, Patch);
  if (ctx.params.id === u.id && b.disabled) throw new HttpError(400, 'You cannot switch off your own access.');
  try { await updateMember(ctx.params.id, b, u.workspaceId); } catch (e: any) { throw new HttpError(400, e.message); }
  return ok({ ok: true });
});
