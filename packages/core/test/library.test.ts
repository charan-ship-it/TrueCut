// Library: validation, de-duplication, URL scrubbing, reading with a fake Claude, sensitive flag,
// and attaching to a project (its numbers become sourced text).
import http from 'node:http';
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { createProject, getProject, getLibraryAsset, getJob, ensureDefaultWorkspace, DEFAULT_WORKSPACE_ID, closeDb, listLibrary } from '@truecut/db';
import { projectPath } from '@truecut/storage';
import { addCapture, attachToProject, normalizeAnalysis, suggestForProject, cleanTags } from '../src/library/library';
import { ffmpeg } from '../src/render/media';
import os from 'node:os';
import path from 'node:path';

let server: http.Server; let reply: any;
async function png(color = 'red', w = 400, h = 300) { const f = path.join(os.tmpdir(), `tc-${color}-${w}x${h}-${Date.now()}.png`); await ffmpeg(['-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}`, '-frames:v', '1', f]); return fs.readFileSync(f); }
const until = async (f: () => Promise<boolean>, ms = 15000) => { const t = Date.now(); while (!(await f())) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 100)); } };

describe('library helpers', () => {
  it('keeps only numbers that are really on screen', () => {
    const a = normalizeAnalysis({ summary: 'Inbox', kind: 'list', text: 'Ideas  to review: 457\nMeetings 189', numbers: [{ value: 457, label: 'ideas', quote: 'Ideas to review: 457' }, { value: 999, label: 'made up', quote: '999 users' }], sensitive: { has: true, kinds: ['email'] } });
    expect(a.numbers.map((n) => n.value)).toEqual([457]);
    expect(a.sensitive).toMatchObject({ has: true, kinds: ['email'] });
  });
  it('cleans tags', () => { expect(cleanTags(' Inbox, inbox,DASH , ,' + 'x'.repeat(50))).toEqual(['inbox', 'dash', 'x'.repeat(30)]); });
});

describe.skipIf(!dbReady)('library pipeline', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'record_screenshot', input: reply }], usage: { input_tokens: 1500, output_tokens: 300 } })); }); });
    await new Promise<void>((r) => server.listen(0, r));
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-server-key';
    await ensureDefaultWorkspace();
  });
  afterAll(async () => { server.close(); delete process.env.ANTHROPIC_BASE_URL; delete process.env.ANTHROPIC_API_KEY; await closeDb(); });

  it('rejects things that are not images', async () => {
    await expect(addCapture({ workspaceId: DEFAULT_WORKSPACE_ID, userId: null, data: Buffer.from('hello'), meta: {} })).rejects.toMatchObject({ code: 'bad_image' });
    await expect(addCapture({ workspaceId: DEFAULT_WORKSPACE_ID, userId: null, data: Buffer.alloc(0), meta: {} })).rejects.toMatchObject({ code: 'empty' });
  });

  it('stores, reads, flags personal data, de-duplicates and scrubs URLs', async () => {
    reply = { summary: 'Agent Nick inbox with 457 ideas', kind: 'list', product: 'Agent Nick', text: 'Agent Nick\nIdeas to review 457\nsarah@client.com', numbers: [{ value: 457, label: 'ideas to review', quote: 'Ideas to review 457' }], sensitive: { has: true, kinds: ['email'], note: 'an email in row 1' } };
    const data = await png('blue');
    const { asset, duplicate } = await addCapture({ workspaceId: DEFAULT_WORKSPACE_ID, userId: null, data, meta: { title: 'Inbox', url: 'https://app.nick.ai/inbox?tab=new&token=SECRET123#x', source: 'extension', tags: ['Inbox'] } });
    expect(duplicate).toBe(false);
    expect(asset.url).toBe('https://app.nick.ai/inbox?tab=new&token=REDACTED');
    expect(asset.domain).toBe('app.nick.ai');
    await until(async () => (await getLibraryAsset(asset.id))?.status === 'ready');
    const a = (await getLibraryAsset(asset.id))!;
    expect(a.error).toBeNull();
    expect(a.product).toBe('Agent Nick');
    expect((a.analysis as any).sensitive.has).toBe(true);
    expect((a.analysis as any).numbers[0].value).toBe(457);
    // same bytes again → the existing asset
    const again = await addCapture({ workspaceId: DEFAULT_WORKSPACE_ID, userId: null, data, meta: { title: 'Inbox copy' } });
    expect(again).toMatchObject({ duplicate: true, asset: { id: asset.id } });
    expect((await listLibrary(DEFAULT_WORKSPACE_ID, { q: 'ideas to review' })).some((x) => x.id === asset.id)).toBe(true);
  });

  it('suggests shots for a project on the same site and attaches them as sourced visuals', async () => {
    reply = { summary: 'Settings page', kind: 'settings', text: 'Workspace settings', numbers: [], sensitive: { has: false, kinds: [] } };
    const { asset } = await addCapture({ workspaceId: DEFAULT_WORKSPACE_ID, userId: null, data: await png('green'), meta: { title: 'Settings', url: 'https://www.nick.ai/settings' } });
    await until(async () => (await getLibraryAsset(asset.id))?.status === 'ready');
    const p = await createProject('Nick video');
    await (await import('@truecut/db')).updateProject(p.id, (x) => { x.sources.push({ id: 'surl', kind: 'url', ref: 'https://nick.ai', label: 'nick.ai', addedAt: new Date().toISOString(), status: 'ready', chars: 0 } as any); });
    const sug = await suggestForProject(p.id, DEFAULT_WORKSPACE_ID);
    expect(sug.map((s) => s.id)).toContain(asset.id);
    const added = await attachToProject(p.id, [asset.id, asset.id], DEFAULT_WORKSPACE_ID);
    expect(added).toHaveLength(1);
    const q = await getProject(p.id);
    const src = q.sources.find((s) => s.kind === 'library')!;
    expect(fs.readFileSync(projectPath(p.id, src.textFile!), 'utf8')).toMatch(/Workspace settings/);
    const v = q.visuals.find((x) => x.sourceId === src.id)!;
    expect(fs.existsSync(projectPath(p.id, v.file))).toBe(true);
    expect(v.use).toBe(true);
    expect(await attachToProject(p.id, [asset.id], DEFAULT_WORKSPACE_ID)).toHaveLength(0); // already there
    expect((await suggestForProject(p.id, DEFAULT_WORKSPACE_ID)).map((s) => s.id)).not.toContain(asset.id);
  });

  it('still stores a capture without a key, marked as not read', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { asset } = await addCapture({ workspaceId: DEFAULT_WORKSPACE_ID, userId: null, data: await png('yellow'), meta: {} });
    await until(async () => (await getLibraryAsset(asset.id))?.status === 'ready');
    expect((await getLibraryAsset(asset.id))!.error).toMatch(/Anthropic API key/);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-server-key';
  });
});
