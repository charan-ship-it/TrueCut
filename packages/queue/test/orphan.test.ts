import { afterAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { closeOrphanedCards } from '../src/boss';
import { createProject, getProject, updateProject, closeDb } from '@truecut/db';

describe.skipIf(!dbReady)('a worker restart closes the progress card it left spinning', () => {
  afterAll(async () => { await closeDb(); });
  it('marks the card interrupted and tells the person what to do', async () => {
    const p = await createProject('Orphan');
    await updateProject(p.id, (pp) => { pp.chat.push({ id: 'm1', role: 'nick', jobId: 'job1', text: '', cards: [{ kind: 'progress', title: 'Rendering the talk', steps: [{ label: 'Compositing', state: 'run', detail: '9x16: frame 180/1624' }], done: false }], replies: [], attachments: [], at: new Date().toISOString() } as any); });
    await closeOrphanedCards([{ id: 'job1', projectId: p.id }, { id: 'other', projectId: null }]);
    const q = await getProject(p.id);
    const c: any = (q.chat[0] as any).cards[0];
    expect(c.done).toBe(true); expect(c.steps[0].state).toBe('err'); expect(c.title).toBe('Interrupted');
    expect(q.chat[q.chat.length - 1].text).toMatch(/interrupted/i);
    await closeOrphanedCards([{ id: 'job1', projectId: p.id }]); // closing twice adds nothing
    expect((await getProject(p.id)).chat).toHaveLength(2);
  });
});

describe.skipIf(!dbReady)('startup sweep', () => {
  it('closes open cards whose job is gone, leaves the rest', async () => {
    const { sweepOpenCards } = await import('../src/boss');
    const p = await createProject('Sweep');
    await updateProject(p.id, (pp) => { pp.chat.push({ id: 'm1', role: 'nick', jobId: 'ghost', text: '', cards: [{ kind: 'progress', title: 'Rendering the talk', steps: [{ label: 'x', state: 'run' }], done: false }], replies: [], attachments: [], at: new Date().toISOString() } as any); });
    await sweepOpenCards();
    const c: any = (await getProject(p.id)).chat[0];
    expect(c.cards[0].done).toBe(true);
  });
});
