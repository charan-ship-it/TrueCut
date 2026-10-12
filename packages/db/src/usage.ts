// Usage ledger: every paid API call, so the team can see tokens and spend per person, project and
// model, and so a monthly budget can stop runaway jobs.
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from './client';
import { usageEvents, users, projects } from './schema';
import { newId } from './ids';

export type UsageInput = {
  workspaceId?: string | null; userId?: string | null; projectId?: string | null; jobId?: string | null;
  provider: 'anthropic' | 'elevenlabs'; model?: string; operation: string;
  inputTokens?: number; outputTokens?: number; cacheWriteTokens?: number; cacheReadTokens?: number;
  units?: number; unitKind?: 'characters' | 'seconds';
  costUsd?: number; keySource?: string; ok?: boolean; error?: string | null; durationMs?: number;
};

/** Never throws: a failed usage write must not fail the video. */
export async function recordUsage(u: UsageInput) {
  try {
    await db().insert(usageEvents).values({
      id: 'u' + newId(), workspaceId: u.workspaceId || null, userId: u.userId || null, projectId: u.projectId || null, jobId: u.jobId || null,
      provider: u.provider, model: u.model || '', operation: u.operation.slice(0, 60),
      inputTokens: Math.round(u.inputTokens || 0), outputTokens: Math.round(u.outputTokens || 0), cacheWriteTokens: Math.round(u.cacheWriteTokens || 0), cacheReadTokens: Math.round(u.cacheReadTokens || 0),
      units: String(u.units || 0), unitKind: u.unitKind || null, costUsd: (u.costUsd || 0).toFixed(6), keySource: u.keySource || 'server',
      ok: u.ok !== false, error: u.error ? String(u.error).slice(0, 500) : null, durationMs: Math.round(u.durationMs || 0),
    });
  } catch (e: any) { console.error('[usage] could not record', e?.message); }
}

export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** Spend so far this calendar month (UTC), in USD. */
export async function monthSpend(workspaceId: string, now = new Date()): Promise<number> {
  const [r] = await db().select({ s: sql<string>`coalesce(sum(${usageEvents.costUsd}), 0)` }).from(usageEvents)
    .where(and(eq(usageEvents.workspaceId, workspaceId), gte(usageEvents.createdAt, monthStart(now))));
  return Number(r?.s || 0);
}

export async function projectSpend(projectId: string) {
  const [r] = await db().select({ cost: sql<string>`coalesce(sum(${usageEvents.costUsd}), 0)`, tokens: sql<string>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens} + ${usageEvents.cacheWriteTokens} + ${usageEvents.cacheReadTokens}), 0)` })
    .from(usageEvents).where(eq(usageEvents.projectId, projectId));
  return { costUsd: Number(r?.cost || 0), tokens: Number(r?.tokens || 0) };
}

const sums = {
  cost: sql<string>`coalesce(sum(${usageEvents.costUsd}), 0)`,
  input: sql<string>`coalesce(sum(${usageEvents.inputTokens}), 0)`,
  output: sql<string>`coalesce(sum(${usageEvents.outputTokens}), 0)`,
  cacheWrite: sql<string>`coalesce(sum(${usageEvents.cacheWriteTokens}), 0)`,
  cacheRead: sql<string>`coalesce(sum(${usageEvents.cacheReadTokens}), 0)`,
  units: sql<string>`coalesce(sum(${usageEvents.units}), 0)`,
  calls: sql<string>`count(*)`,
  failed: sql<string>`count(*) filter (where not ${usageEvents.ok})`,
};
const num = (r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^-?[\d.]+$/.test(v) ? Number(v) : v]));

/** The Usage page: one month (UTC), broken down every way the team asked for. */
export async function usageSummary(workspaceId: string, month = monthStart()) {
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const where = and(eq(usageEvents.workspaceId, workspaceId), gte(usageEvents.createdAt, month), lt(usageEvents.createdAt, end));
  const day = sql<string>`to_char(${usageEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const [total] = await db().select(sums).from(usageEvents).where(where);
  const [byDay, byModel, byOperation, byUser, byProject, recent] = await Promise.all([
    db().select({ day, ...sums }).from(usageEvents).where(where).groupBy(day).orderBy(day),
    db().select({ provider: usageEvents.provider, model: usageEvents.model, ...sums }).from(usageEvents).where(where).groupBy(usageEvents.provider, usageEvents.model).orderBy(desc(sums.cost)),
    db().select({ operation: usageEvents.operation, ...sums }).from(usageEvents).where(where).groupBy(usageEvents.operation).orderBy(desc(sums.cost)),
    db().select({ userId: usageEvents.userId, name: users.name, email: users.email, ...sums }).from(usageEvents).leftJoin(users, eq(users.id, usageEvents.userId)).where(where).groupBy(usageEvents.userId, users.name, users.email).orderBy(desc(sums.cost)),
    db().select({ projectId: usageEvents.projectId, name: projects.name, ...sums }).from(usageEvents).leftJoin(projects, eq(projects.id, usageEvents.projectId)).where(where).groupBy(usageEvents.projectId, projects.name).orderBy(desc(sums.cost)).limit(25),
    db().select({ id: usageEvents.id, at: usageEvents.createdAt, operation: usageEvents.operation, model: usageEvents.model, provider: usageEvents.provider, cost: usageEvents.costUsd, input: usageEvents.inputTokens, output: usageEvents.outputTokens, ok: usageEvents.ok, error: usageEvents.error, keySource: usageEvents.keySource, projectId: usageEvents.projectId, user: users.name })
      .from(usageEvents).leftJoin(users, eq(users.id, usageEvents.userId)).where(where).orderBy(desc(usageEvents.createdAt)).limit(50),
  ]);
  return {
    month: month.toISOString().slice(0, 7),
    total: num(total), byDay: byDay.map(num), byModel: byModel.map(num), byOperation: byOperation.map(num), byUser: byUser.map(num), byProject: byProject.map(num),
    recent: recent.map((r) => ({ ...r, at: r.at.toISOString(), cost: Number(r.cost) })),
  };
}
