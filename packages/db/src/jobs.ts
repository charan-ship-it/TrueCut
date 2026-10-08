// Job rows: what the UI polls for progress. The queue (pg-boss) decides who runs a job; this table is
// the record of it (status, progress, log) so any web instance can show it and nothing is lost on restart.
import { and, desc, eq, gt, inArray, lt, or, isNull } from 'drizzle-orm';
import { db } from './client';
import { jobs } from './schema';
import { newId } from './ids';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type Job = {
  id: string; kind: string; projectId: string | null; status: JobStatus; progress: number; message: string; log: string[];
  error?: string | null; payload?: any; result?: any; createdBy?: string | null;
  createdAt: string; startedAt?: string | null; endedAt?: string | null; heartbeatAt?: string | null;
};

/** A running job whose worker has not reported for this long is treated as dead. */
export const STALE_MS = 90_000;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
function toJob(r: typeof jobs.$inferSelect): Job {
  return { id: r.id, kind: r.kind, projectId: r.projectId, status: r.status as JobStatus, progress: r.progress, message: r.message, log: (r.log as string[]) || [], error: r.error, payload: r.payload, result: r.result, createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), startedAt: iso(r.startedAt), endedAt: iso(r.endedAt), heartbeatAt: iso(r.heartbeatAt) };
}

export async function createJob(kind: string, projectId: string | null, opts: { payload?: any; createdBy?: string | null; id?: string } = {}): Promise<Job> {
  const [r] = await db().insert(jobs).values({ id: opts.id || 'j' + newId(), kind, projectId, payload: opts.payload ?? {}, createdBy: opts.createdBy || null, message: 'Queued' }).returning();
  return toJob(r);
}

export async function getJob(id: string): Promise<Job | null> {
  const [r] = await db().select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return r ? toJob(r) : null;
}

export async function projectJobs(projectId: string, limit = 30): Promise<Job[]> {
  const rows = await db().select().from(jobs).where(eq(jobs.projectId, projectId)).orderBy(desc(jobs.createdAt)).limit(limit);
  return rows.map(toJob);
}

export async function markRunning(id: string) {
  const now = new Date();
  await db().update(jobs).set({ status: 'running', startedAt: now, heartbeatAt: now }).where(eq(jobs.id, id));
}

/** Progress + log flush (also the heartbeat). */
export async function reportJob(id: string, patch: { message?: string; progress?: number; log?: string[] }) {
  const set: any = { heartbeatAt: new Date() };
  if (patch.message != null) set.message = patch.message;
  if (patch.progress != null) set.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
  if (patch.log) set.log = patch.log;
  await db().update(jobs).set(set).where(eq(jobs.id, id));
}

export async function finishJob(id: string, out: { result?: any; error?: string; log?: string[] }) {
  const set: any = { endedAt: new Date(), heartbeatAt: new Date() };
  if (out.log) set.log = out.log;
  if (out.error) { set.status = 'error'; set.error = out.error; set.message = out.error; }
  else { set.status = 'done'; set.progress = 100; set.result = out.result ?? null; }
  await db().update(jobs).set(set).where(eq(jobs.id, id));
}

const live = () => or(eq(jobs.status, 'queued'), and(eq(jobs.status, 'running'), gt(jobs.heartbeatAt, new Date(Date.now() - STALE_MS))));

/** True while a job of this kind for this project is queued, or running with a recent heartbeat. */
export async function isBusy(projectId: string, kind = 'nick'): Promise<boolean> {
  const [r] = await db().select({ id: jobs.id }).from(jobs).where(and(eq(jobs.projectId, projectId), eq(jobs.kind, kind), live())).limit(1);
  return !!r;
}

/** Jobs left "running" by a worker that died get closed so the UI stops waiting on them. */
export async function failStaleJobs(): Promise<number> {
  const rows = await db().update(jobs).set({ status: 'error', error: 'The worker stopped before this finished. Please try again.', message: 'Interrupted', endedAt: new Date() })
    .where(and(eq(jobs.status, 'running'), or(isNull(jobs.heartbeatAt), lt(jobs.heartbeatAt, new Date(Date.now() - STALE_MS))))).returning({ id: jobs.id });
  return rows.length;
}

export async function activeJobs(kinds?: string[]) {
  const where = kinds?.length ? and(inArray(jobs.kind, kinds), inArray(jobs.status, ['queued', 'running'])) : inArray(jobs.status, ['queued', 'running']);
  return (await db().select().from(jobs).where(where).orderBy(desc(jobs.createdAt)).limit(100)).map(toJob);
}


/** Which of these projects have a live job of `kind` (one query for the sidebar). */
export async function busyProjects(projectIds: string[], kind = 'nick'): Promise<Set<string>> {
  if (!projectIds.length) return new Set();
  const rows = await db().selectDistinct({ id: jobs.projectId }).from(jobs).where(and(inArray(jobs.projectId, projectIds), eq(jobs.kind, kind), live()));
  return new Set(rows.map((r) => r.id!));
}
