import { afterAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { defineHandler, enqueue, getJob } from '../src/jobs';
import { createProject, closeDb } from '@truecut/db';

const until = async (f: () => Promise<boolean>, ms = 5000) => { const t = Date.now(); while (!(await f())) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 30)); } };

describe.skipIf(!dbReady)('inline queue', () => {
  afterAll(() => closeDb());
  it('runs a handler, records progress and the result', async () => {
    defineHandler<{ n: number }>('test-double', async ({ n }, { log }) => { log('halfway', 50); return { out: n * 2 }; });
    const p = await createProject('Queue');
    const j = await enqueue('test-double', p.id, { n: 21 });
    await until(async () => (await getJob(j.id))?.status === 'done');
    const done = (await getJob(j.id))!;
    expect(done.result).toEqual({ out: 42 });
    expect(done.log.join('\n')).toMatch(/halfway/);
  });
  it('records a failure instead of throwing', async () => {
    defineHandler('test-fail', async () => { throw new Error('boom'); });
    const j = await enqueue('test-fail', null, {});
    await until(async () => (await getJob(j.id))?.status === 'error');
    expect((await getJob(j.id))!.error).toBe('boom');
  });
  it('runs heavy jobs one at a time', async () => {
    let running = 0, peak = 0;
    defineHandler('test-heavy', async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 60)); running--; }, { heavy: true });
    const js = await Promise.all([1, 2, 3].map(() => enqueue('test-heavy', null, {})));
    await until(async () => (await Promise.all(js.map((j) => getJob(j.id)))).every((j) => j?.status === 'done'));
    expect(peak).toBe(1);
  });
});
