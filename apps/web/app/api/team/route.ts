import { ok, route } from '@/lib/http';
import { roleOf, authEnabled } from '@/lib/auth';
import { teamMembers } from '@truecut/db';
export const dynamic = 'force-dynamic';

/** Everyone in the workspace and when they were last active. Who is in the workspace, and their role, is decided in AIX Core. */
export const GET = route(async (_r: Request, _c: any, u) => ok({ role: await roleOf(u), me: u.id, auth: authEnabled(), members: await teamMembers(u.workspaceId) }));
