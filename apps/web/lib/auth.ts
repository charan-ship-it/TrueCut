// Sign-in is AIX Core's: one Clerk session shared across *.aiworkforce.md (people sign in on Core), checked
// against Core's access gate on every request. TrueCut keeps no passwords, sessions or access table of its own.
// Each Clerk organisation is a TrueCut workspace (workspace id = Clerk org id), created the first time one of
// its members arrives.
//
//   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY   Core's Clerk app (same on every AIX agent)
//   CLERK_SIGN_IN_URL                                      Core's login page, e.g. https://app-staging.aiworkforce.md/login
//   AIX_CORE_API_URL                                       Core's API, see lib/core.ts
//
// On your own machine without Clerk keys, sign-in is off and everyone is the "Local" user.
import { auth, clerkClient } from '@clerk/nextjs/server';
import { env, loadEnv } from '@truecut/config';
import { mirrorCoreIdentity, isMember, projectMeta, memberRole, userForToken, memberStatus, DEFAULT_WORKSPACE_ID, type SessionUser } from '@truecut/db';
import { CoreError, orgFromClaims, requireCoreAccess, workspaceRole } from './core';

loadEnv();

/** Sign-in is on when Clerk is configured, on Railway, or in the Docker image (TRUECUT_AUTH=required), even
 *  before Clerk is set up (then nobody gets in). TRUECUT_AUTH=off turns it off. */
export const authEnabled = () => env('TRUECUT_AUTH') !== 'off' && (!!env('CLERK_SECRET_KEY') || env('TRUECUT_AUTH') === 'required' || !!env('RAILWAY_ENVIRONMENT_ID'));

export class HttpError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }

// Who a Clerk user is in our database. Names and pictures come from Clerk once per process, not per request.
const known = new Map<string, { uid: string; email: string; name: string; image: string | null; orgId: string; role: 'owner' | 'member' }>();

async function mirror(clerkUserId: string, orgId: string, role: 'owner' | 'member') {
  const hit = known.get(clerkUserId);
  if (hit && hit.orgId === orgId && hit.role === role) return hit;
  const clerk = await clerkClient();
  const [cu, org] = await Promise.all([clerk.users.getUser(clerkUserId), clerk.organizations.getOrganization({ organizationId: orgId }).catch(() => null)]);
  const email = (cu.primaryEmailAddress?.emailAddress || cu.emailAddresses[0]?.emailAddress || '').toLowerCase();
  if (!email) throw new HttpError(401, 'Your AIX account has no email address.');
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ');
  const u = await mirrorCoreIdentity({ email, name, image: cu.imageUrl, workspaceId: orgId, workspaceName: org?.name, role });
  const v = { uid: u.id, email: u.email, name: u.name, image: u.image ?? null, orgId, role };
  known.set(clerkUserId, v);
  return v;
}

const LOCAL: SessionUser & { workspaceId: string } = { id: '', email: 'local@truecut', name: 'Local', image: null, workspaceId: DEFAULT_WORKSPACE_ID };

/** The signed-in, entitled user, or null when there is no session. Throws HttpError when someone is signed in but
 *  cannot use TrueCut (no organisation, no access, Core unreachable). With sign-in off, the local user. */
export async function currentUser(): Promise<(SessionUser & { workspaceId: string }) | null> {
  if (!authEnabled()) return LOCAL;
  const a = await auth();
  if (!a.userId) return null;
  const { orgId, role } = orgFromClaims({ ...(a.sessionClaims || {}), ...(a.orgId ? { org_id: a.orgId } : {}), ...(a.orgRole ? { org_role: a.orgRole } : {}) });
  if (!orgId || !role) throw new HttpError(403, 'Open TrueCut from your AIX Core dashboard so it knows which organisation you are working in.', 'no_org');
  const token = await a.getToken();
  if (!token) return null;
  try { await requireCoreAccess(a.userId, token); } catch (e) { if (e instanceof CoreError) throw new HttpError(e.status, e.message, e.code); throw e; }
  const m = await mirror(a.userId, orgId, workspaceRole(role));
  if ((await memberStatus(m.uid, orgId).catch(() => ({ disabled: false }))).disabled) throw new HttpError(403, 'Your access to TrueCut was switched off by a workspace owner.', 'switched_off');
  return { id: m.uid, email: m.email, name: m.name, image: m.image, workspaceId: orgId };
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'Please sign in.');
  return u;
}

/** The user, after checking they can open this project (same workspace). */
export async function requireProject(projectId: string) {
  const u = await requireUser();
  const meta = await projectMeta(projectId);
  if (!meta) throw new HttpError(404, 'Project not found');
  if (authEnabled() && !(await isMember(u.id, meta.workspaceId))) throw new HttpError(404, 'Project not found');
  return u;
}

/** owner | member. With sign-in off (a laptop), the local user runs everything. */
export async function roleOf(u: { id: string; workspaceId: string }) {
  if (!authEnabled() || !u.id) return 'owner';
  return (await memberRole(u.workspaceId, u.id)) || 'member';
}
export async function requireOwner(u: { id: string; workspaceId: string }) {
  if ((await roleOf(u)) !== 'owner') throw new HttpError(403, 'Only a workspace owner can change this.');
}

/** A Chrome-extension request: `Authorization: Bearer tc_…` (a personal access token from Settings). */
export async function userFromBearer(req: Request) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(tc_[A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const u = await userForToken(m[1]);
  if (!u) return null;
  // someone switched off in Settings → Team loses token access too. (Core is not asked here: a token has no
  // Core session to forward, so removing a person from their organisation in Core does not revoke it.)
  if (authEnabled() && (await memberStatus(u.id, u.workspaceId).catch(() => ({ disabled: false }))).disabled) return null;
  return u;
}
