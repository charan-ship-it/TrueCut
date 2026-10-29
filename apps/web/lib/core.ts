// AIX Core access: which org and role a Clerk session carries, and whether Core has TrueCut switched on for
// that person. Core is the only place access is decided: TrueCut keeps no entitlement table of its own.
//
//   AIX_CORE_API_URL   https://api-staging.aiworkforce.md (staging) / https://api.aiworkforce.md (production)
//
// Fails closed: a Core outage or a missing catalog entry is a 503, never a grant. Answers are cached for 60 s
// at most, so revoking someone in Core takes effect within a minute.
export const AGENT_ID = 'truecut';
const TTL_MS = 60_000;
const ROLES = new Set(['owner', 'admin', 'member', 'platform_support']);

export class CoreError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

/** The org and role in a Clerk session. Core's tokens carry them compactly as `o: { id, rol }`, or in full as
 *  `org_id` / `org_role`. Clerk may prefix the role with `org:`. */
export function orgFromClaims(claims: Record<string, any> | null | undefined): { orgId: string | null; role: string | null } {
  if (!claims) return { orgId: null, role: null };
  const o = claims.o && typeof claims.o === 'object' ? claims.o : {};
  const orgId = typeof claims.org_id === 'string' ? claims.org_id : typeof o.id === 'string' ? o.id : null;
  const raw = typeof claims.org_role === 'string' ? claims.org_role : typeof o.rol === 'string' ? o.rol : null;
  const role = raw ? raw.replace(/^org:/, '') : null;
  return { orgId, role: role && ROLES.has(role) ? role : null };
}

/** Core's owners and admins run a workspace; everyone else is a member. */
export const workspaceRole = (coreRole: string): 'owner' | 'member' => (coreRole === 'member' ? 'member' : 'owner');

const cache = new Map<string, { at: number; ok: boolean; reason?: string }>();
export const clearCoreCache = () => cache.clear();

/** Throws CoreError unless Core says this person may use TrueCut. */
export async function requireCoreAccess(userId: string, token: string, fetchImpl: typeof fetch = fetch) {
  const hit = cache.get(userId);
  let ok: boolean; let reason: string | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) ({ ok, reason } = hit);
  else {
    const base = (process.env.AIX_CORE_API_URL || '').replace(/\/+$/, '');
    if (!base) throw new CoreError(500, 'AIX_CORE_API_URL is not set.', 'core_unconfigured');
    let res: Response;
    try { res = await fetchImpl(`${base}/api/v1/agents/${AGENT_ID}/access`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) }); }
    catch { throw new CoreError(503, 'AIX Core could not be reached to check your access. Please try again.', 'core_unavailable'); }
    if (res.status === 401) throw new CoreError(401, 'Please sign in again.', 'core_rejected_token');
    if (res.status === 404) throw new CoreError(503, 'TrueCut is not registered in the AIX Core catalog yet.', 'not_in_catalog');
    if (res.status >= 500) throw new CoreError(503, 'AIX Core could not check your access. Please try again.', 'core_unavailable');
    if (!res.ok) throw new CoreError(403, 'AIX Core denied access.', 'no_agent_access');
    const data = await res.json().catch(() => null) as { has_access?: boolean; reason?: string } | null;
    ok = data?.has_access === true; reason = data?.reason;
    cache.set(userId, { at: Date.now(), ok, reason }); // only definite answers are cached; errors above retry
  }
  if (!ok) throw new CoreError(403, 'You don’t have access to TrueCut. Ask your organisation’s admin to turn it on from the AIX Core dashboard.', 'no_agent_access');
}
