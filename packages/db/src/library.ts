// The team's screenshot library.
import { and, desc, eq, ilike, isNull, or, sql, inArray } from 'drizzle-orm';
import { db } from './client';
import { libraryAssets, users } from './schema';
import { newId } from './ids';

export type LibraryAnalysis = {
  summary: string; kind: string; text: string; product?: string;
  numbers: { value: number; label: string; quote: string }[];
  sensitive: { has: boolean; kinds: string[]; note?: string };
};
export type LibraryAsset = typeof libraryAssets.$inferSelect;

export const newLibraryId = () => 'l' + newId();

export async function createLibraryAsset(v: Omit<typeof libraryAssets.$inferInsert, 'id'> & { id?: string }) {
  const [r] = await db().insert(libraryAssets).values({ ...v, id: v.id || newLibraryId() }).returning();
  return r;
}

/** A capture identical to one already in the library (same bytes). */
export async function findBySha(workspaceId: string, sha256: string) {
  const [r] = await db().select().from(libraryAssets).where(and(eq(libraryAssets.workspaceId, workspaceId), eq(libraryAssets.sha256, sha256), isNull(libraryAssets.deletedAt))).limit(1);
  return r || null;
}

export async function getLibraryAsset(id: string, workspaceId?: string) {
  const [r] = await db().select().from(libraryAssets).where(and(eq(libraryAssets.id, id), isNull(libraryAssets.deletedAt), ...(workspaceId ? [eq(libraryAssets.workspaceId, workspaceId)] : []))).limit(1);
  return r || null;
}

export async function updateLibraryAsset(id: string, patch: Partial<typeof libraryAssets.$inferInsert>) {
  const [r] = await db().update(libraryAssets).set({ ...patch, updatedAt: new Date() }).where(eq(libraryAssets.id, id)).returning();
  return r || null;
}

export async function softDeleteLibraryAsset(id: string, workspaceId: string) {
  const [r] = await db().update(libraryAssets).set({ deletedAt: new Date() }).where(and(eq(libraryAssets.id, id), eq(libraryAssets.workspaceId, workspaceId))).returning({ id: libraryAssets.id, file: libraryAssets.file });
  return r || null;
}

export type LibraryQuery = { q?: string; product?: string; domain?: string; ids?: string[]; status?: string; limit?: number; offset?: number };

export async function listLibrary(workspaceId: string, o: LibraryQuery = {}) {
  const conds = [eq(libraryAssets.workspaceId, workspaceId), isNull(libraryAssets.deletedAt)];
  if (o.product) conds.push(eq(sql`lower(${libraryAssets.product})`, o.product.toLowerCase()));
  if (o.domain) conds.push(eq(libraryAssets.domain, o.domain.toLowerCase()));
  if (o.status) conds.push(eq(libraryAssets.status, o.status));
  if (o.ids?.length) conds.push(inArray(libraryAssets.id, o.ids));
  if (o.q?.trim()) {
    const like = `%${o.q.trim().replace(/[%_\\]/g, (c) => '\\' + c)}%`;
    conds.push(or(ilike(libraryAssets.title, like), ilike(libraryAssets.product, like), ilike(libraryAssets.url, like), ilike(sql`${libraryAssets.analysis}->>'text'`, like), ilike(sql`${libraryAssets.analysis}->>'summary'`, like), ilike(sql`${libraryAssets.tags}::text`, like))!);
  }
  const rows = await db().select({ a: libraryAssets, by: users.name }).from(libraryAssets).leftJoin(users, eq(users.id, libraryAssets.createdBy))
    .where(and(...conds)).orderBy(desc(libraryAssets.createdAt)).limit(Math.min(o.limit || 60, 200)).offset(o.offset || 0);
  return rows.map((r) => ({ ...r.a, createdByName: r.by }));
}

export async function libraryProducts(workspaceId: string) {
  const rows = await db().select({ product: libraryAssets.product, n: sql<string>`count(*)` }).from(libraryAssets)
    .where(and(eq(libraryAssets.workspaceId, workspaceId), isNull(libraryAssets.deletedAt), sql`${libraryAssets.product} is not null and ${libraryAssets.product} <> ''`))
    .groupBy(libraryAssets.product).orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ product: r.product!, count: Number(r.n) }));
}

/** Shots that probably belong to a project: same site, or the product named in title/product/text. */
export async function findLibraryMatches(workspaceId: string, o: { domains: string[]; names: string[]; limit?: number }) {
  const conds: any[] = [];
  for (const d of o.domains.filter(Boolean)) conds.push(eq(libraryAssets.domain, d.toLowerCase().replace(/^www\./, '')));
  for (const n of o.names.map((x) => x.trim()).filter((x) => x.length >= 3)) {
    const like = `%${n.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
    conds.push(ilike(libraryAssets.product, like), ilike(libraryAssets.title, like));
  }
  if (!conds.length) return [];
  return db().select().from(libraryAssets)
    .where(and(eq(libraryAssets.workspaceId, workspaceId), isNull(libraryAssets.deletedAt), eq(libraryAssets.status, 'ready'), or(...conds)))
    .orderBy(desc(libraryAssets.createdAt)).limit(o.limit || 24);
}
