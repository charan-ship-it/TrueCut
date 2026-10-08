import { afterAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { createProject, getProject, updateProject, listProjects, deleteProject, NotFound } from '../src/projects';
import { createJob, reportJob, markRunning, finishJob, isBusy, busyProjects, failStaleJobs, getJob } from '../src/jobs';
import { upsertUser, workspaceMembers, DEFAULT_WORKSPACE_ID } from '../src/workspaces';
import { db, closeDb } from '../src/client';
import { jobs } from '../src/schema';
import { eq } from 'drizzle-orm';

describe.skipIf(!dbReady)('postgres store', () => {
  afterAll(() => closeDb());

  it('creates, lists and summarises projects', async () => {
    const p = await createProject('Store test');
    await updateProject(p.id, (x) => { x.chat.push({ id: 'm1', role: 'nick', text: 'Hello there', cards: [], replies: [], attachments: [], at: new Date().toISOString() } as any); });
    const rows = await listProjects(DEFAULT_WORKSPACE_ID);
    const row = rows.find((r) => r.id === p.id)!;
    expect(row.name).toBe('Store test');
    expect((row.summary as any).last).toBe('Hello there');
    await deleteProject(p.id);
    await expect(getProject(p.id)).rejects.toBeInstanceOf(NotFound);
  });

  it('never loses a write when the web app and a worker update at once', async () => {
    const p = await createProject('Race');
    await Promise.all(Array.from({ length: 25 }, (_, i) => updateProject(p.id, (x) => { x.chat.push({ id: 'm' + i, role: 'user', text: String(i), cards: [], replies: [], attachments: [], at: new Date().toISOString() } as any); })));
    expect((await getProject(p.id)).chat).toHaveLength(25);
  });

  it('tracks job state and treats a silent worker as dead', async () => {
    const p = await createProject('Jobs');
    const j = await createJob('nick', p.id, { payload: { a: 1 } });
    expect(await isBusy(p.id)).toBe(true); // queued counts as busy
    await markRunning(j.id);
    await reportJob(j.id, { message: 'Working', progress: 40, log: ['one'] });
    expect((await getJob(j.id))!.progress).toBe(40);
    expect((await busyProjects([p.id])).has(p.id)).toBe(true);
    // the worker died: heartbeat far in the past
    await db().update(jobs).set({ heartbeatAt: new Date(Date.now() - 10 * 60_000) }).where(eq(jobs.id, j.id));
    expect(await isBusy(p.id)).toBe(false);
    expect(await failStaleJobs()).toBeGreaterThanOrEqual(1);
    expect((await getJob(j.id))!.status).toBe('error');
    const k = await createJob('render', p.id);
    await markRunning(k.id); await finishJob(k.id, { result: { ok: 1 } });
    expect((await getJob(k.id))!).toMatchObject({ status: 'done', progress: 100, result: { ok: 1 } });
  });

  it('adds team members to the default workspace; the first one owns it', async () => {
    const a = await upsertUser({ email: 'First@Example.com', name: 'First' });
    const b = await upsertUser({ email: 'second@example.com', name: 'Second' });
    const again = await upsertUser({ email: 'first@example.com', name: 'First Renamed' });
    expect(again.id).toBe(a.id);
    const members = await workspaceMembers(DEFAULT_WORKSPACE_ID);
    expect(members.find((m) => m.id === a.id)?.role).toBe('owner');
    expect(members.find((m) => m.id === b.id)?.role).toBe('member');
  });
});
