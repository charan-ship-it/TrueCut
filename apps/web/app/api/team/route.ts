import { ok, route } from '@/lib/http';
import { roleOf, authEnabled } from '@/lib/auth';
import { teamMembers, teamInvites } from '@truecut/db';
import { env } from '@truecut/config';
export const dynamic = 'force-dynamic';

/** Everyone in the workspace, when they were last active, and (owners only) who has been invited. */
export const GET = route(async (_r: Request, _c: any, u) => {
  const role = await roleOf(u);
  const [members, invites] = await Promise.all([teamMembers(u.workspaceId), role === 'owner' ? teamInvites(u.workspaceId) : Promise.resolve([])]);
  const domains = (env('ALLOWED_EMAIL_DOMAINS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return ok({ role, me: u.id, auth: authEnabled(), domains, members, invites });
});
