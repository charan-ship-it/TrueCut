import { afterAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { upsertUser, teamMembers, inviteMember, isInvited, takeInviteRole, updateMember, memberStatus, closeDb } from '../src';

describe.skipIf(!dbReady)('team', () => {
  afterAll(async () => { await closeDb(); });
  it('invites carry a role, disabling blocks, the last owner is protected', async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const a = await upsertUser({ email: `a-${tag}@x.test` });
    await inviteMember(`B-${tag}@x.test`, 'owner', a.id);
    expect(await isInvited(`b-${tag}@x.test`)).toBe(true);
    await expect(inviteMember('nope', 'member', a.id)).rejects.toThrow(/valid email/);
    const b = await upsertUser({ email: `b-${tag}@x.test` });
    expect(await isInvited(`b-${tag}@x.test`)).toBe(false); // used up on first sign-in
    const rows = await teamMembers();
    expect(rows.find((r) => r.id === b.id)?.role).toBe('owner');
    await updateMember(b.id, { disabled: true });
    expect((await memberStatus(b.id)).disabled).toBe(true);
    await updateMember(b.id, { disabled: false });
    expect((await memberStatus(b.id)).disabled).toBe(false);
    expect(await takeInviteRole('zzz@x.test')).toBe(null);
    // demote every owner but one: the last change must be refused
    const owners = (await teamMembers()).filter((r) => r.role === 'owner' && !r.disabled);
    for (const o of owners.slice(1)) await updateMember(o.id, { role: 'member' });
    await expect(updateMember(owners[0].id, { role: 'member' })).rejects.toThrow(/at least one/);
    for (const o of owners.slice(1)) await updateMember(o.id, { role: 'owner' });
  });
});
