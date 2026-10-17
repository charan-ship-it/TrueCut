// Team: who is in the workspace, when they were last active, their role, and who has been invited.
import { and, eq, sql } from 'drizzle-orm';
import { db } from './client';
import { memberInvites, memberships, users } from './schema';
import { DEFAULT_WORKSPACE_ID } from './workspaces';

export type Role = 'owner' | 'member';
const norm = (e: string) => e.trim().toLowerCase();

export async function teamMembers(workspaceId = DEFAULT_WORKSPACE_ID) {
  return db().select({ id: users.id, email: users.email, name: users.name, image: users.image, role: memberships.role, disabled: memberships.disabled, joinedAt: users.createdAt, lastSeenAt: users.lastSeenAt })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.workspaceId, workspaceId)).orderBy(sql`${users.lastSeenAt} desc`);
}
export async function teamInvites(workspaceId = DEFAULT_WORKSPACE_ID) {
  return db().select({ email: memberInvites.email, role: memberInvites.role, createdAt: memberInvites.createdAt }).from(memberInvites).where(eq(memberInvites.workspaceId, workspaceId)).orderBy(sql`${memberInvites.createdAt} desc`);
}

export async function isInvited(email: string, workspaceId = DEFAULT_WORKSPACE_ID) {
  const r = await db().select({ e: memberInvites.email }).from(memberInvites).where(and(eq(memberInvites.workspaceId, workspaceId), eq(memberInvites.email, norm(email)))).limit(1);
  return r.length > 0;
}
export async function inviteMember(email: string, role: Role, invitedBy: string | null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const e = norm(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Please enter a valid email address.');
  await db().insert(memberInvites).values({ workspaceId, email: e, role, invitedBy }).onConflictDoUpdate({ target: [memberInvites.workspaceId, memberInvites.email], set: { role } });
  return e;
}
export async function revokeInvite(email: string, workspaceId = DEFAULT_WORKSPACE_ID) {
  await db().delete(memberInvites).where(and(eq(memberInvites.workspaceId, workspaceId), eq(memberInvites.email, norm(email))));
}
/** The role an invited address joins with (and the invite is used up), or null when there is none. */
export async function takeInviteRole(email: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<Role | null> {
  const [r] = await db().delete(memberInvites).where(and(eq(memberInvites.workspaceId, workspaceId), eq(memberInvites.email, norm(email)))).returning({ role: memberInvites.role });
  return r ? (r.role === 'owner' ? 'owner' : 'member') : null;
}

async function activeOwners(workspaceId: string, exceptUser?: string) {
  const rows = await db().select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, 'owner'), eq(memberships.disabled, false)));
  return rows.filter((r) => r.u !== exceptUser).length;
}
/** Change a role or switch a person off/on. The workspace always keeps at least one active owner. */
export async function updateMember(userId: string, patch: { role?: Role; disabled?: boolean }, workspaceId = DEFAULT_WORKSPACE_ID) {
  const [cur] = await db().select().from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId))).limit(1);
  if (!cur) throw new Error('Member not found');
  const losesOwner = cur.role === 'owner' && !cur.disabled && ((patch.role && patch.role !== 'owner') || patch.disabled === true);
  if (losesOwner && (await activeOwners(workspaceId, userId)) === 0) throw new Error('The workspace needs at least one active owner.');
  await db().update(memberships).set({ ...(patch.role ? { role: patch.role } : {}), ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}) }).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  seen.delete(userId);
}

// Per-process cache so "is this person still switched on, and when were they last here" costs almost nothing per request.
const seen = new Map<string, { at: number; disabled: boolean }>();
const TTL = 30_000, TOUCH = 120_000;
export async function memberStatus(userId: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<{ disabled: boolean }> {
  const c = seen.get(userId);
  if (c && Date.now() - c.at < TTL) return { disabled: c.disabled };
  const [m] = await db().select({ disabled: memberships.disabled }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId))).limit(1);
  const disabled = !!m?.disabled;
  seen.set(userId, { at: Date.now(), disabled });
  if (!disabled) await db().update(users).set({ lastSeenAt: new Date() }).where(and(eq(users.id, userId), sql`${users.lastSeenAt} < now() - ${TOUCH / 1000} * interval '1 second'`));
  return { disabled };
}
