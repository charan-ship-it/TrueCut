// callTool against a fake Anthropic API: usage is recorded, truncation is retried, budget is enforced,
// a rejected key is marked invalid.
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { runWithContext } from '@truecut/config';
import { usageSummary, updateWorkspaceSettings, DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace, saveKey, resolveRunContext, listKeys, deleteKey, upsertUser, closeDb } from '@truecut/db';
import { callTool, forgetBudget } from '../src/system/claude';

let server: http.Server; let calls: any[] = []; let next: (body: any) => { status: number; json: any };
const tool = { name: 'record_test', description: 't', input_schema: { type: 'object', properties: { ok: { type: 'boolean' } } } };
const answer = (stop = 'tool_use', input: any = { ok: true }) => ({ status: 200, json: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'tool_use', id: 't1', name: 'record_test', input }], usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });

describe.skipIf(!dbReady)('callTool', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const body = JSON.parse(b || '{}'); calls.push({ body, key: req.headers['x-api-key'] }); const r = next(body); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.json)); }); });
    await new Promise<void>((r) => server.listen(0, r));
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;
    process.env.TRUECUT_ENCRYPTION_KEY = 'test-encryption-key-0123456789abcdef-xyz';
    await ensureDefaultWorkspace();
  });
  afterAll(async () => { server.close(); delete process.env.ANTHROPIC_BASE_URL; await closeDb(); });

  const ctx = (extra: any = {}) => ({ workspaceId: DEFAULT_WORKSPACE_ID, projectId: 'p-call', keys: { anthropic: 'sk-test', anthropicSource: 'workspace' as const }, ...extra });

  it('records tokens and cost for a successful call', async () => {
    calls = []; next = () => answer();
    const out = await runWithContext(ctx(), () => callTool<any>({ model: 'claude-opus-5-5', system: 's', tool, content: [{ type: 'text', text: 'hi' }] }));
    expect(out).toEqual({ ok: true });
    expect(calls[0].key).toBe('sk-test');
    expect(calls[0].body.tool_choice).toEqual({ type: 'tool', name: 'record_test' });
    await new Promise((r) => setTimeout(r, 50));
    const s = await usageSummary(DEFAULT_WORKSPACE_ID);
    expect(s.byOperation.find((r: any) => r.operation === 'test')).toMatchObject({ input: 1000, output: 200 });
  });

  it('asks again with more room when the answer was cut off', async () => {
    calls = []; let n = 0; next = () => (n++ === 0 ? answer('max_tokens', {}) : answer());
    await runWithContext(ctx(), () => callTool<any>({ model: 'claude-opus-5-5', system: 's', tool, content: [], maxTokens: 1000 }));
    expect(calls.map((c) => c.body.max_tokens)).toEqual([1000, 1800]);
  });

  it('stops at the monthly budget', async () => {
    await updateWorkspaceSettings(DEFAULT_WORKSPACE_ID, { monthlyBudgetUsd: 0 }); forgetBudget(DEFAULT_WORKSPACE_ID);
    calls = []; next = () => answer();
    await expect(runWithContext(ctx(), () => callTool({ model: 'claude-opus-5-5', system: 's', tool, content: [] }))).rejects.toMatchObject({ code: 'budget_exceeded' });
    expect(calls).toHaveLength(0);
    await updateWorkspaceSettings(DEFAULT_WORKSPACE_ID, { monthlyBudgetUsd: null }); forgetBudget(DEFAULT_WORKSPACE_ID);
  });

  it('marks a rejected key invalid and says so plainly', async () => {
    const u = await upsertUser({ email: 'badkey@example.com' });
    await saveKey({ workspaceId: DEFAULT_WORKSPACE_ID, userId: u.id, provider: 'anthropic', secret: 'sk-bad-key-9999', createdBy: u.id });
    const rc = await resolveRunContext({ workspaceId: DEFAULT_WORKSPACE_ID, userId: u.id, projectId: 'p-call' });
    next = () => ({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
    await expect(runWithContext(rc, () => callTool({ model: 'claude-opus-5-5', system: 's', tool, content: [] }))).rejects.toMatchObject({ code: 'invalid_key' });
    const k = (await listKeys(DEFAULT_WORKSPACE_ID, u.id)).find((x) => x.scope === 'personal')!;
    expect(k.status).toBe('invalid');
    await deleteKey(k.id, DEFAULT_WORKSPACE_ID);
  });

  it('falls back to asking when a model cannot be forced to call the tool, and remembers it', async () => {
    calls = [];
    next = (b) => (b.tool_choice?.type === 'tool'
      ? { status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" and "any" are not supported for this model.' } } }
      : answer());
    const out = await runWithContext(ctx(), () => callTool<any>({ model: 'claude-future-1', system: 's', tool, content: [] }));
    expect(out).toEqual({ ok: true });
    expect(calls.map((c) => c.body.tool_choice.type)).toEqual(['tool', 'auto']);
    expect(calls[1].body.system).toMatch(/only by calling the `record_test` tool/);
    calls = [];
    await runWithContext(ctx(), () => callTool<any>({ model: 'claude-future-1', system: 's', tool, content: [] }));
    expect(calls.map((c) => c.body.tool_choice.type)).toEqual(['auto']); // remembered
  });

  it('accepts JSON written as text, or asks once more, when the model does not call the tool', async () => {
    const text = (t: string) => ({ status: 200, json: { id: 'm', type: 'message', role: 'assistant', model: 'claude-future-1', stop_reason: 'end_turn', content: [{ type: 'text', text: t }], usage: { input_tokens: 10, output_tokens: 10 } } });
    calls = []; next = () => text('Here you go:\n```json\n{"ok": true}\n```');
    expect(await runWithContext(ctx(), () => callTool<any>({ model: 'claude-future-1', system: 's', tool, content: [] }))).toEqual({ ok: true });
    calls = []; let n = 0; next = () => (n++ === 0 ? text('Sure, I can help with that.') : answer());
    expect(await runWithContext(ctx(), () => callTool<any>({ model: 'claude-future-1', system: 's', tool, content: [] }))).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    calls = []; next = () => text('No.');
    await expect(runWithContext(ctx(), () => callTool<any>({ model: 'claude-future-1', system: 's', tool, content: [] }))).rejects.toMatchObject({ code: 'no_tool_output' });
    expect(calls).toHaveLength(2);
  });

  it('explains a missing key', async () => {
    await expect(runWithContext({ workspaceId: DEFAULT_WORKSPACE_ID, keys: { anthropic: '', anthropicSource: 'none' } }, () => callTool({ model: 'claude-opus-5-5', system: 's', tool, content: [], what: 'Writing the storyboard' }))).rejects.toThrow(/Settings → API keys/);
  });
});
