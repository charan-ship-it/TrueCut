// Workspaces and members. Today TrueCut runs one workspace for the whole team; the model already
// supports several so a later AIX Core integration can map its organisations onto workspaces.
import { and, eq } from 'drizzle-orm';
import { env } from '@truecut/config';
import { db } from './client';
import { memberships, users, workspaces } from './schema';
import { newId } from './ids';

export const DEFAULT_WORKSPACE_ID = 'ws_default';
let ensured = false;

/** Creates the team workspace on first use (name from TRUECUT_WORKSPACE_NAME). */
export async function ensureDefaultWorkspace() {
  if (ensured) return DEFAULT_WORKSPACE_ID;
  await db().insert(workspaces).values({ id: DEFAULT_WORKSPACE_ID, name: env('TRUECUT_WORKSPACE_NAME', 'AI Xccelerate'), slug: 'default' }).onConflictDoNothing();
  ensured = true;
  return DEFAULT_WORKSPACE_ID;
}

export type SessionUser = { id: string; email: string; name: string; image?: string | null };

/** Called on every sign-in: upserts the user and makes them a member of the team workspace. */
export async function upsertUser(u: { email: string; name?: string | null; image?: string | null }): Promise<SessionUser> {
  const ws = await ensureDefaultWorkspace();
  const email = u.email.toLowerCase();
  const [row] = await db().insert(users).values({ id: 'u_' + newId(), email, name: u.name || email.split('@')[0], image: u.image || null })
    .onConflictDoUpdate({ target: users.email, set: { name: u.name || email.split('@')[0], image: u.image || null, lastSeenAt: new Date() } }).returning();
  const first = (await db().select().from(memberships).where(eq(memberships.workspaceId, ws)).limit(1)).length === 0;
  await db().insert(memberships).values({ workspaceId: ws, userId: row.id, role: first ? 'owner' : 'member' }).onConflictDoNothing();
  return { id: row.id, email: row.email, name: row.name, image: row.image };
}

export async function getUserByEmail(email: string) { const [u] = await db().select().from(users).where(eq(users.email, email.toLowerCase())).limit(1); return u || null; }
export async function workspaceMembers(workspaceId = DEFAULT_WORKSPACE_ID) {
  return db().select({ id: users.id, email: users.email, name: users.name, image: users.image, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.workspaceId, workspaceId));
}
export async function isMember(userId: string, workspaceId: string) {
  const r = await db().select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId))).limit(1);
  return r.length > 0;
}
