// Personal access tokens, used by the Chrome extension to upload captures as the person who made them.
// The token is shown once; only its SHA-256 is stored.
import crypto from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from './client';
import { apiTokens, users } from './schema';
import { newId } from './ids';
import { sha256 } from './secrets';

export const TOKEN_PREFIX = 'tc_';

export async function createToken(o: { workspaceId: string; userId: string; name: string; days?: number | null }) {
  const raw = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  const expiresAt = o.days ? new Date(Date.now() + o.days * 86400_000) : null;
  const [r] = await db().insert(apiTokens).values({ id: 't' + newId(), workspaceId: o.workspaceId, userId: o.userId, name: o.name.slice(0, 60) || 'Chrome extension', tokenHash: sha256(raw), prefix: raw.slice(0, 10), expiresAt }).returning();
  return { token: raw, id: r.id, name: r.name, prefix: r.prefix, expiresAt: r.expiresAt?.toISOString() || null };
}

export async function listTokens(userId: string) {
  const rows = await db().select().from(apiTokens).where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt))).orderBy(desc(apiTokens.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() || null, expiresAt: r.expiresAt?.toISOString() || null }));
}

export async function revokeToken(id: string, userId: string) {
  await db().update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)));
}

/** The user behind a bearer token, or null if it is unknown, revoked or expired. */
export async function userForToken(raw: string) {
  if (!raw.startsWith(TOKEN_PREFIX) || raw.length < 20) return null;
  const [r] = await db().select({ t: apiTokens, u: users }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId)).where(eq(apiTokens.tokenHash, sha256(raw))).limit(1);
  if (!r || r.t.revokedAt || (r.t.expiresAt && r.t.expiresAt < new Date())) return null;
  if (!r.t.lastUsedAt || Date.now() - r.t.lastUsedAt.getTime() > 60_000) await db().update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, r.t.id));
  return { id: r.u.id, email: r.u.email, name: r.u.name, image: r.u.image, workspaceId: r.t.workspaceId, scopes: r.t.scopes as string[], tokenId: r.t.id };
}
