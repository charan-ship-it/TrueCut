// Brand kits: a company's visual language, kept per workspace.
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from './client';
import { brandKits } from './schema';
import { newId } from './ids';

export const brandKey = (s: string) => String(s || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].replace(/\s+/g, ' ');

/** The saved kit for any of these keys (site host, brand name), most recently updated first. */
export async function findBrandKit(workspaceId: string, keys: string[]) {
  const ks = [...new Set(keys.map(brandKey).filter(Boolean))]; if (!ks.length) return null;
  const [r] = await db().select().from(brandKits).where(and(eq(brandKits.workspaceId, workspaceId), inArray(brandKits.key, ks))).orderBy(desc(brandKits.updatedAt)).limit(1);
  return r || null;
}

export async function saveBrandKit(workspaceId: string, keys: string[], name: string, language: unknown, userId?: string | null) {
  for (const key of [...new Set(keys.map(brandKey).filter(Boolean))]) {
    await db().insert(brandKits).values({ id: 'bk' + newId().slice(0, 10), workspaceId, key, name, language: language as any, updatedBy: userId || null })
      .onConflictDoUpdate({ target: [brandKits.workspaceId, brandKits.key], set: { name, language: language as any, updatedBy: userId || null, updatedAt: new Date() } });
  }
}

export async function listBrandKits(workspaceId: string) {
  return db().select().from(brandKits).where(eq(brandKits.workspaceId, workspaceId)).orderBy(desc(brandKits.updatedAt));
}
