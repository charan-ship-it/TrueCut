// Background jobs. The web app calls enqueue(); a handler registered for that kind does the work and
// reports progress through `log`, which is buffered and flushed to the job row (that flush is the heartbeat).
//
// Drivers (TRUECUT_QUEUE):
//   inline  run the handler in this process (local dev, tests, the CLI). Heavy jobs run one at a time.
//   pgboss  hand the job to the worker service through Postgres (see ./boss.ts). Default when the
//           worker is deployed.
import { createJob, finishJob, markRunning, reportJob, getJob, projectJobs, isBusy, busyProjects, STALE_MS, type Job } from '@truecut/db';
import { env } from '@truecut/config';
import { hydrate, flush as flushFiles } from '@truecut/storage';

export { getJob, projectJobs, isBusy, busyProjects, type Job };
export type Log = (msg: string, pct?: number) => void;
export type Ctx = { job: Job; log: Log; flush: () => Promise<void> };
export type Handler<P = any> = (payload: P, ctx: Ctx) => Promise<any>;
type Def = { fn: Handler; heavy: boolean };

const g = globalThis as any;
const reg: { handlers: Map<string, Def>; chain: Promise<unknown> } = g.__truecutQueue || (g.__truecutQueue = { handlers: new Map(), chain: Promise.resolve() });

/** Register what a job kind does. `heavy` jobs (renders) never run two at a time in one process. */
export function defineHandler<P = any>(kind: string, fn: Handler<P>, opts: { heavy?: boolean } = {}) {
  reg.handlers.set(kind, { fn, heavy: !!opts.heavy });
}
export const handlerKinds = () => [...reg.handlers.keys()];
export const isHeavy = (kind: string) => !!reg.handlers.get(kind)?.heavy;

export function queueDriver(): 'inline' | 'pgboss' { return env('TRUECUT_QUEUE', 'inline') === 'pgboss' ? 'pgboss' : 'inline'; }

type Sender = (job: Job) => Promise<void>;
let sender: Sender | null = null;
/** Installed by ./boss.ts when the pg-boss driver is active. */
export function setSender(s: Sender | null) { sender = s; }

/** Create the job row and hand it to whoever runs jobs. Returns immediately. */
export async function enqueue<P = any>(kind: string, projectId: string | null, payload: P, opts: { createdBy?: string | null } = {}): Promise<Job> {
  const job = await createJob(kind, projectId, { payload, createdBy: opts.createdBy });
  if (queueDriver() === 'pgboss') {
    try {
      if (!sender) await (await import('./boss')).startSender();
      await sender!(job);
    } catch (e: any) {
      // never leave a "queued" row nobody will run: it would keep the project looking busy
      await finishJob(job.id, { error: `Couldn't queue the job: ${e?.message || e}` }).catch(() => {});
      throw e;
    }
  } else {
    const run = () => runJob(job.id);
    if (isHeavy(kind)) reg.chain = reg.chain.then(run, run); else void run().catch(() => {});
  }
  return job;
}

/** Execute one job row with its registered handler. Used by the inline driver and by the worker. */
export async function runJob(id: string): Promise<void> {
  const job = await getJob(id);
  if (!job) return;
  if (job.status === 'done' || job.status === 'error') return;
  // a delivery for a job another live worker is already running: leave it alone
  if (job.status === 'running' && job.heartbeatAt && Date.now() - Date.parse(job.heartbeatAt) < STALE_MS) return;
  const def = reg.handlers.get(job.kind);
  if (!def) { await finishJob(id, { error: `No handler for job kind "${job.kind}"` }); return; }
  const lines: string[] = [...job.log];
  let message = job.message, progress = job.progress, dirty = false, last = 0, pending: Promise<void> = Promise.resolve();
  const flush = async () => { if (!dirty) return pending; dirty = false; const snap = { message, progress, log: lines.slice(-300) }; pending = pending.then(() => reportJob(id, snap)).catch((e) => console.error('[job flush]', e?.message)); return pending; };
  const log: Log = (msg, pct) => {
    message = msg; if (pct != null) progress = pct;
    lines.push(`${new Date().toISOString().slice(11, 19)} ${msg}`); if (lines.length > 400) lines.splice(0, 100);
    dirty = true; const t = Date.now(); if (t - last > 700) { last = t; void flush(); }
  };
  const pid = job.projectId;
  // heartbeat even when a handler is quiet for a while (e.g. a long Claude call); files written so far
  // go to the bucket on the same beat so screenshots and previews show up while the job is still running
  const beat = setInterval(() => {
    dirty = true; void flush();
    if (pid) flushFiles(pid, { settleMs: 3000 }).catch((e) => console.error('[job files]', e?.message));
  }, 15_000);
  await markRunning(id);
  try {
    if (pid) { const h = await hydrate(pid); if (h.downloaded) log(`Fetched ${h.downloaded} project file(s)`); }
    const result = await def.fn(job.payload ?? {}, { job: { ...job, status: 'running' }, log, flush });
    clearInterval(beat);
    if (pid) await flushFiles(pid);
    if (message === 'Queued') { message = 'Done'; dirty = true; }
    await flush();
    await finishJob(id, { result, log: lines.slice(-300) });
  } catch (e: any) {
    clearInterval(beat);
    if (pid) await flushFiles(pid).catch((x) => console.error('[job files]', x?.message));
    await flush().catch(() => {});
    console.error(`[job ${job.kind} ${id}]`, e);
    await finishJob(id, { error: e?.message || String(e), log: lines.slice(-300) });
  }
}
