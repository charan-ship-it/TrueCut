import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { encryptSecret, decryptSecret, needsRotation, SecretsUnavailable } from '../src/secrets';
import { saveKey, listKeys, resolveRunContext, updateWorkspaceSettings, getWorkspaceSettings, markKey, deleteKey } from '../src/settings';
import { upsertUser, DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace } from '../src/workspaces';
import { recordUsage, monthSpend, usageSummary, projectSpend } from '../src/usage';
import { createToken, userForToken, revokeToken, listTokens } from '../src/tokens';
import { closeDb } from '../src/client';

const KEY = 'test-encryption-key-0123456789abcdef-xyz';

describe('secrets', () => {
  beforeAll(() => { process.env.TRUECUT_ENCRYPTION_KEY = KEY; });
  it('round-trips and never stores the plain text', () => {
    const blob = encryptSecret('sk-ant-secret-1234');
    expect(blob).not.toContain('secret');
    expect(decryptSecret(blob)).toBe('sk-ant-secret-1234');
    expect(encryptSecret('x')).not.toBe(encryptSecret('x')); // random IV
  });
  it('detects tampering', () => {
    const blob = encryptSecret('abc'); const parts = blob.split(':'); parts[3] = Buffer.from('zzz').toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });
  it('rotates: old secrets still open with the previous key', () => {
    const old = encryptSecret('rotate-me');
    process.env.TRUECUT_ENCRYPTION_KEY_PREVIOUS = KEY; process.env.TRUECUT_ENCRYPTION_KEY = 'a-brand-new-encryption-key-0987654321-abc';
    expect(decryptSecret(old)).toBe('rotate-me');
    expect(needsRotation(old)).toBe(true);
    process.env.TRUECUT_ENCRYPTION_KEY = KEY; delete process.env.TRUECUT_ENCRYPTION_KEY_PREVIOUS;
  });
  it('refuses to save without an encryption key', () => {
    const k = process.env.TRUECUT_ENCRYPTION_KEY; delete process.env.TRUECUT_ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow(SecretsUnavailable);
    process.env.TRUECUT_ENCRYPTION_KEY = k;
  });
});

describe.skipIf(!dbReady)('keys, settings, usage, tokens', () => {
  beforeAll(async () => { process.env.TRUECUT_ENCRYPTION_KEY = KEY; await ensureDefaultWorkspace(); });
  afterAll(() => closeDb());

  it('resolves keys personal > workspace > server, and skips invalid ones', async () => {
    const a = await upsertUser({ email: 'keys-a@example.com' }); const b = await upsertUser({ email: 'keys-b@example.com' });
    process.env.ANTHROPIC_API_KEY = 'server-key';
    expect((await resolveRunContext({ workspaceId: DEFAULT_WORKSPACE_ID, userId: a.id })).keys).toMatchObject({ anthropic: 'server-key', anthropicSource: 'server' });
    await saveKey({ workspaceId: DEFAULT_WORKSPACE_ID, userId: null, provider: 'anthropic', secret: 'workspace-key', createdBy: a.id });
    const mine = await saveKey({ workspaceId: DEFAULT_WORKSPACE_ID, userId: a.id, provider: 'anthropic', secret: 'personal-key-a', createdBy: a.id });
    expect((await resolveRunContext({ workspaceId: DEFAULT_WORKSPACE_ID, userId: a.id })).keys).toMatchObject({ anthropic: 'personal-key-a', anthropicSource: 'personal' });
    expect((await resolveRunContext({ workspaceId: DEFAULT_WORKSPACE_ID, userId: b.id })).keys).toMatchObject({ anthropic: 'workspace-key', anthropicSource: 'workspace' });
    // b can't see a's personal key
    expect((await listKeys(DEFAULT_WORKSPACE_ID, b.id)).map((k) => k.scope)).toEqual(['workspace']);
    expect((await listKeys(DEFAULT_WORKSPACE_ID, a.id)).find((k) => k.scope === 'personal')?.last4).toBe('ey-a');
    await markKey(mine.id, 'invalid', 'nope');
    expect((await resolveRunContext({ workspaceId: DEFAULT_WORKSPACE_ID, userId: a.id })).keys?.anthropicSource).toBe('workspace');
    // saving again replaces, never duplicates
    await saveKey({ workspaceId: DEFAULT_WORKSPACE_ID, userId: a.id, provider: 'anthropic', secret: 'personal-key-a2', createdBy: a.id });
    expect((await listKeys(DEFAULT_WORKSPACE_ID, a.id)).filter((k) => k.scope === 'personal')).toHaveLength(1);
    for (const k of await listKeys(DEFAULT_WORKSPACE_ID, a.id)) await deleteKey(k.id, DEFAULT_WORKSPACE_ID);
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('stores model choices and a budget, rejecting nonsense', async () => {
    const s = await updateWorkspaceSettings(DEFAULT_WORKSPACE_ID, { models: { vision: 'claude-haiku-5-5' }, monthlyBudgetUsd: 25 });
    expect(s).toMatchObject({ models: { creative: 'claude-opus-5-5', analysis: 'claude-opus-5-5', vision: 'claude-haiku-5-5' }, monthlyBudgetUsd: 25 });
    await expect(updateWorkspaceSettings(DEFAULT_WORKSPACE_ID, { models: { creative: 'gpt-9' } })).rejects.toThrow(/Unknown model/);
    await expect(updateWorkspaceSettings(DEFAULT_WORKSPACE_ID, { monthlyBudgetUsd: -1 })).rejects.toThrow(/Budget/);
    await updateWorkspaceSettings(DEFAULT_WORKSPACE_ID, { models: { vision: 'claude-opus-5-5' }, monthlyBudgetUsd: null });
    expect((await getWorkspaceSettings(DEFAULT_WORKSPACE_ID)).monthlyBudgetUsd).toBeNull();
  });

  it('adds up usage by month, model, person and project', async () => {
    const u = await upsertUser({ email: 'usage@example.com', name: 'Usage Person' });
    const before = await monthSpend(DEFAULT_WORKSPACE_ID);
    await recordUsage({ workspaceId: DEFAULT_WORKSPACE_ID, userId: u.id, projectId: 'p-usage', provider: 'anthropic', model: 'claude-opus-5-5', operation: 'storyboard', inputTokens: 1000, outputTokens: 500, costUsd: 0.014 });
    await recordUsage({ workspaceId: DEFAULT_WORKSPACE_ID, userId: u.id, projectId: 'p-usage', provider: 'elevenlabs', operation: 'tts', units: 120, unitKind: 'characters' });
    await recordUsage({ workspaceId: DEFAULT_WORKSPACE_ID, provider: 'anthropic', model: 'claude-opus-5-5', operation: 'facts', ok: false, error: '429 rate_limited' });
    expect(await monthSpend(DEFAULT_WORKSPACE_ID) - before).toBeCloseTo(0.014, 5);
    const s = await usageSummary(DEFAULT_WORKSPACE_ID);
    expect(s.byUser.find((r: any) => r.userId === u.id)).toMatchObject({ name: 'Usage Person', input: 1000, output: 500 });
    expect(s.byOperation.map((r: any) => r.operation)).toEqual(expect.arrayContaining(['storyboard', 'tts', 'facts']));
    expect(s.total.failed).toBeGreaterThanOrEqual(1);
    expect(await projectSpend('p-usage')).toEqual({ costUsd: 0.014, tokens: 1500 });
    // never throws, even with a bad row
    await expect(recordUsage({ provider: 'anthropic', operation: 'x', workspaceId: 'no-such-workspace' })).resolves.toBeUndefined();
  });

  it('issues tokens that work until revoked or expired', async () => {
    const u = await upsertUser({ email: 'tok@example.com' });
    const t = await createToken({ workspaceId: DEFAULT_WORKSPACE_ID, userId: u.id, name: 'Chrome' });
    expect(t.token).toMatch(/^tc_/);
    expect((await userForToken(t.token))?.id).toBe(u.id);
    expect(await userForToken(t.token + 'x')).toBeNull();
    expect(await userForToken('Bearer nonsense')).toBeNull();
    expect((await listTokens(u.id))[0]).not.toHaveProperty('tokenHash');
    await revokeToken(t.id, u.id);
    expect(await userForToken(t.token)).toBeNull();
    const old = await createToken({ workspaceId: DEFAULT_WORKSPACE_ID, userId: u.id, name: 'Old', days: -1 });
    expect(await userForToken(old.token)).toBeNull();
  });
});
