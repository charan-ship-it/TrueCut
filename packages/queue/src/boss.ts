// The pg-boss driver: jobs travel through Postgres, so no Redis is needed (see docs/adr/0002).
// The web app only sends; the worker service polls and runs. Each job kind is its own queue so the
// worker can give renders their own concurrency.
import { PgBoss } from 'pg-boss';
import { env } from '@truecut/config';
import { databaseUrl, failStaleJobs, updateProject, projectsWithOpenCards, getJob, type Job } from '@truecut/db';
import { handlerKinds, isHeavy, runJob, setSender } from './jobs';

const g = globalThis as any;
const queueName = (kind: string) => `truecut-${kind}`;
const LIGHT_EXPIRE = 2 * 3600;   // a Nick turn can include a render and a long transcription
const HEAVY_EXPIRE = 4 * 3600;

async function boss(role: 'web' | 'worker'): Promise<PgBoss> {
  if (g.__tcBoss) return g.__tcBoss;
  if (!g.__tcBossStarting) {
    g.__tcBossStarting = (async () => {
      const b = new PgBoss({ connectionString: databaseUrl(), schema: 'pgboss', max: role === 'web' ? 3 : 6, supervise: role === 'worker', schedule: false, migrate: true });
      b.on('error', (e: any) => console.error('[pg-boss]', e?.message || e));
      await b.start();
      g.__tcBoss = b;
      return b;
    })().catch((e: any) => { g.__tcBossStarting = undefined; throw e; });
  }
  return g.__tcBossStarting;
}

const created = new Set<string>();
async function ensureQueue(b: PgBoss, kind: string) {
  if (created.has(kind)) return;
  await b.createQueue(queueName(kind), { retryLimit: 0, expireInSeconds: isHeavy(kind) ? HEAVY_EXPIRE : LIGHT_EXPIRE, retentionSeconds: 7 * 86400 });
  created.add(kind);
}

/** Web side: make enqueue() hand jobs to the worker. Safe to call many times. */
export async function startSender() {
  const b = await boss('web');
  setSender(async (job: Job) => { await ensureQueue(b, job.kind); await b.send(queueName(job.kind), { jobId: job.id }); });
}

/** Worker side: subscribe to every registered job kind. Returns a stop() for graceful shutdown. */
export async function startWorker(opts: { concurrency?: number; renderSlots?: number } = {}) {
  const b = await boss('worker');
  setSender(async (job: Job) => { await ensureQueue(b, job.kind); await b.send(queueName(job.kind), { jobId: job.id }); });
  const light = opts.concurrency ?? Math.max(1, Number(env('TRUECUT_WORKER_CONCURRENCY', '3')));
  const heavy = opts.renderSlots ?? Math.max(1, Number(env('TRUECUT_RENDER_SLOTS', '1')));
  const reap = async () => {
    const rows = await failStaleJobs();
    if (rows.length) console.log(`[worker] closed ${rows.length} job(s) left running by a previous worker: ${rows.map((r) => `${r.id}@${r.projectId}`).join(', ')}`);
    await closeOrphanedCards(rows);
    return rows.length;
  };
  await reap();
  sweepOpenCards().catch((e) => console.error('[worker] card sweep', e?.message));
  const reaper = setInterval(() => { reap().catch((e) => console.error('[worker] reaper', e?.message)); }, 60_000);
  for (const kind of handlerKinds()) {
    await ensureQueue(b, kind);
    await b.work<{ jobId: string }>(queueName(kind), { localConcurrency: isHeavy(kind) ? heavy : light, batchSize: 1, pollingIntervalSeconds: 1 }, async (jobs: any) => {
      for (const j of jobs) await runJob(j.data.jobId);
    });
  }
  console.log(`[worker] listening for ${handlerKinds().join(', ')} (concurrency ${light}, render slots ${heavy})`);
  return {
    async stop(graceMs = 300_000) { clearInterval(reaper); await b.stop({ graceful: true, timeout: graceMs }); g.__tcBoss = undefined; g.__tcBossStarting = undefined; },
  };
}

/** A progress card whose job was reaped would spin forever in the chat. Close it with an error and tell the person what to do. */
export async function closeOrphanedCards(rows: { id: string; projectId: string | null }[]) {
  for (const r of rows) {
    if (!r.projectId) continue;
    try {
      await updateProject(r.projectId, (p) => {
        let hit = false;
        for (const m of p.chat as any[]) {
          if (m.jobId !== r.id) continue;
          for (const c of m.cards || []) if (c.kind === 'progress' && !c.done) {
            const last = c.steps?.[c.steps.length - 1]; if (last) { last.state = 'err'; last.detail = 'Interrupted: the worker restarted'; }
            c.done = true; c.title = 'Interrupted'; hit = true;
          }
        }
        if (hit) p.chat.push({ id: 'm' + Math.random().toString(36).slice(2, 10), role: 'nick', text: 'That was interrupted because the server restarted while it was working. Nothing was lost. Say it again and I will pick it back up.', cards: [], replies: ['Render it'], attachments: [], at: new Date().toISOString() } as any);
      });
    } catch (e: any) { console.error('[worker] could not close a stale card', r.id, e?.message); }
  }
}

/** Cards left spinning before the reaper closed them: any open progress card whose job is not queued or running is dead. Runs once at startup. */
export async function sweepOpenCards() {
  let closed = 0;
  for (const { id, jobIds } of await projectsWithOpenCards()) {
    const dead: { id: string; projectId: string }[] = [];
    for (const j of jobIds) { const job = await getJob(j).catch(() => null); if (!job || (job.status !== 'queued' && job.status !== 'running')) dead.push({ id: j, projectId: id }); }
    if (dead.length) { await closeOrphanedCards(dead); closed += dead.length; }
  }
  if (closed) console.log(`[worker] closed ${closed} stale progress card(s) from earlier runs`);
}
