import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { defineHandler, enqueue, getJob } from '../src/jobs';
import { startWorker } from '../src/boss';
import { createProject, closeDb } from '@truecut/db';

const until = async (f: () => Promise<boolean>, ms = 20000) => { const t = Date.now(); while (!(await f())) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 100)); } };

describe.skipIf(!dbReady)('pg-boss driver', () => {
  let w: { stop(): Promise<void> };
  beforeAll(async () => {
    process.env.TRUECUT_QUEUE = 'pgboss';
    defineHandler<{ n: number }>('test-boss', async ({ n }, { log, job }) => { log('working', 30); return { n, pid: job.projectId }; });
    w = await startWorker({ concurrency: 2 });
  }, 60000);
  afterAll(async () => { await w?.stop(); process.env.TRUECUT_QUEUE = 'inline'; await closeDb(); });

  it('sends a job through Postgres and the worker runs it', async () => {
    const p = await createProject('Boss');
    const j = await enqueue('test-boss', p.id, { n: 7 });
    expect(j.status).toBe('queued');
    await until(async () => (await getJob(j.id))?.status === 'done');
    expect((await getJob(j.id))!.result).toEqual({ n: 7, pid: p.id });
  });
});
