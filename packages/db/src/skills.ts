// Team skills (see schema.ts).
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from './client';
import { skills, users } from './schema';
import { newId } from './ids';

export type SkillRow = typeof skills.$inferSelect;
export type SkillInput = { name: string; description: string; body: string; stages?: string[]; always?: boolean; enabled?: boolean; source?: string };

export async function listSkills(workspaceId: string, o: { enabledOnly?: boolean; ids?: string[] } = {}) {
  const conds = [eq(skills.workspaceId, workspaceId), isNull(skills.deletedAt)];
  if (o.enabledOnly) conds.push(eq(skills.enabled, true));
  if (o.ids) { if (!o.ids.length) return []; conds.push(inArray(skills.id, o.ids)); }
  const rows = await db().select({ s: skills, by: users.name }).from(skills).leftJoin(users, eq(users.id, skills.createdBy)).where(and(...conds)).orderBy(asc(skills.name));
  return rows.map((r) => ({ ...r.s, stages: (r.s.stages as string[]) || [], createdByName: r.by }));
}

export async function getSkill(id: string, workspaceId: string) {
  const [r] = await db().select().from(skills).where(and(eq(skills.id, id), eq(skills.workspaceId, workspaceId), isNull(skills.deletedAt))).limit(1);
  return r || null;
}

export async function getSkillByName(workspaceId: string, name: string) {
  const [r] = await db().select().from(skills).where(and(eq(skills.workspaceId, workspaceId), eq(skills.name, name), isNull(skills.deletedAt))).limit(1);
  return r || null;
}

export async function createSkill(workspaceId: string, createdBy: string | null, v: SkillInput) {
  const [r] = await db().insert(skills).values({ id: 'k' + newId(), workspaceId, createdBy, name: v.name, description: v.description, body: v.body, stages: v.stages || [], always: !!v.always, enabled: v.enabled ?? true, source: v.source || 'manual' }).returning();
  return r;
}

export async function updateSkill(id: string, workspaceId: string, patch: Partial<SkillInput>) {
  const [r] = await db().update(skills).set({ ...patch, updatedAt: new Date() }).where(and(eq(skills.id, id), eq(skills.workspaceId, workspaceId), isNull(skills.deletedAt))).returning();
  return r || null;
}

export async function deleteSkill(id: string, workspaceId: string) {
  const [r] = await db().update(skills).set({ deletedAt: new Date() }).where(and(eq(skills.id, id), eq(skills.workspaceId, workspaceId), isNull(skills.deletedAt))).returning({ id: skills.id });
  return r || null;
}
