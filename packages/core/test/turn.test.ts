import { afterAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { createProject, getProject, closeDb } from '@truecut/db';
import { startTurn, BusyError } from '../src/director/agent';

describe.skipIf(!dbReady)('Nick turns', () => {
  afterAll(() => closeDb());
  it('starts only one turn when a message is sent twice at once', async () => {
    const p = await createProject('Double submit');
    const r = await Promise.allSettled([startTurn(p.id, { type: 'message', text: 'hi' }), startTurn(p.id, { type: 'message', text: 'hi' })]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(BusyError);
    expect((await getProject(p.id)).chat.filter((m) => m.role === 'user')).toHaveLength(1);
  });
});
