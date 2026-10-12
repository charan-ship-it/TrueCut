import { afterAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { createEmailToken, consumeEmailToken } from '../src/emailtokens';
import { upsertUser } from '../src/workspaces';
import { db, closeDb } from '../src/client';
import { emailTokens } from '../src/schema';
import { eq } from 'drizzle-orm';

describe.skipIf(!dbReady)('sign-in link tokens', () => {
  afterAll(async () => { await closeDb(); });

  it('works once, for the address it was sent to', async () => {
    const { token } = await createEmailToken('Once@Example.com');
    expect(await consumeEmailToken('other@example.com', token)).toBeNull();
    expect(await consumeEmailToken('once@example.com', token)).toBe('once@example.com');
    expect(await consumeEmailToken('once@example.com', token)).toBeNull();
  });

  it('only one of two racing uses wins', async () => {
    const { token } = await createEmailToken('race@example.com');
    const r = await Promise.all([consumeEmailToken('race@example.com', token), consumeEmailToken('race@example.com', token)]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });

  it('expires, and stores only a hash', async () => {
    const { token } = await createEmailToken('late@example.com', -1);
    const rows = await db().select().from(emailTokens).where(eq(emailTokens.email, 'late@example.com'));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(await consumeEmailToken('late@example.com', token)).toBeNull();
    expect(await consumeEmailToken('late@example.com', 'short')).toBeNull();
  });

  it('keeps at most three open links per address', async () => {
    const t = [];
    for (let i = 0; i < 5; i++) t.push((await createEmailToken('many@example.com')).token);
    expect((await db().select().from(emailTokens).where(eq(emailTokens.email, 'many@example.com'))).length).toBe(3);
    expect(await consumeEmailToken('many@example.com', t[0])).toBeNull();
    expect(await consumeEmailToken('many@example.com', t[4])).toBe('many@example.com');
  });

  it('a sign-in without a name keeps the saved name and picture', async () => {
    await upsertUser({ email: 'named@example.com', name: 'Named Person', image: 'https://x/p.png' });
    const u = await upsertUser({ email: 'named@example.com', name: null, image: null });
    expect(u.name).toBe('Named Person');
    expect(u.image).toBe('https://x/p.png');
  });
});
