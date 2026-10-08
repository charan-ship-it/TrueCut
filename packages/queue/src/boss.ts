// The pg-boss driver: jobs travel through Postgres, so no Redis is needed (see docs/adr/0002).
// The web app only sends; the worker service polls and runs. Each job kind is its own queue so the
// worker can give renders their own concurrency.
import { PgBoss } from 'pg-boss';
import { env } from '@truecut/config';
import { databaseUrl, failStaleJobs, type Job } from '@truecut/db';
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
    })();
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
  const reaped = await failStaleJobs();
  if (reaped) console.log(`[worker] closed ${reaped} job(s) left running by a previous worker`);
  const reaper = setInterval(() => { failStaleJobs().catch((e) => console.error('[worker] reaper', e?.message)); }, 60_000);
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
