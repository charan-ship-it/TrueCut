// Team skills: SKILL.md parsing, validation, per-project picking (fake Claude) and the prompt block.
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbReady } from '../../../tools/test/db';
import { createProject, getProject, ensureDefaultWorkspace, DEFAULT_WORKSPACE_ID, closeDb, createSkill, listSkills, deleteSkill } from '@truecut/db';
import { parseSkillMd, skillProblem, slugify, chooseSkills, skillBlock, toggleSkill } from '../src/skills/skills';

describe('SKILL.md parsing', () => {
  it('reads frontmatter, block scalars and lists', () => {
    const s = parseSkillMd(`---\nname: Brand Voice\ndescription: >\n  Use for every ad we make.\n  Covers words to avoid.\nstages:\n  - storyboard\n  - chat\n  - bogus\nalways: true\n---\n\n# Voice\n\nNo exclamation marks.\n`);
    expect(s).toMatchObject({ name: 'brand-voice', description: 'Use for every ad we make. Covers words to avoid.', stages: ['storyboard', 'chat'], always: true });
    expect(s.body).toBe('# Voice\n\nNo exclamation marks.');
  });
  it('handles quoted values, inline lists and CRLF', () => {
    const s = parseSkillMd('---\r\nname: "linkedin-hooks"\r\ndescription: \'Hooks: for LinkedIn\'\r\nstages: [angles, storyboard]\r\n---\r\nBody');
    expect(s).toMatchObject({ name: 'linkedin-hooks', description: 'Hooks: for LinkedIn', stages: ['angles', 'storyboard'], always: false, body: 'Body' });
  });
  it('falls back to the heading and first paragraph without frontmatter', () => {
    const s = parseSkillMd('# Review Checklist\n\nCheck every claim twice before rendering.\n\n- one\n- two');
    expect(s).toMatchObject({ name: 'review-checklist', description: 'Check every claim twice before rendering.', stages: [] });
  });
  it('validates', () => {
    expect(skillProblem({ name: '', description: 'x', body: 'x' })).toMatch(/name/);
    expect(skillProblem({ name: 'Bad Name', description: 'x', body: 'x' })).toMatch(/lowercase/);
    expect(skillProblem({ name: 'ok', description: '', body: 'x' })).toMatch(/description/);
    expect(skillProblem({ name: 'ok', description: 'x', body: 'y'.repeat(20_001) })).toMatch(/at most/);
    expect(skillProblem({ name: 'ok', description: 'x', body: 'y' })).toBeNull();
    expect(slugify('  Ünïcode -- Name! ')).toBe('unicode-name');
  });
});

let server: http.Server; let pick: string[] = []; let calls = 0;
describe.skipIf(!dbReady)('skills on a project', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { calls++; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'pick_skills', input: { skills: pick, why: 'It is a LinkedIn ad.' } }], usage: { input_tokens: 300, output_tokens: 40 } })); }); });
    await new Promise<void>((r) => server.listen(0, r));
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}`;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-server-key';
    await ensureDefaultWorkspace();
    for (const s of await listSkills(DEFAULT_WORKSPACE_ID)) await deleteSkill(s.id, DEFAULT_WORKSPACE_ID);
  });
  afterAll(async () => {
    for (const s of await listSkills(DEFAULT_WORKSPACE_ID)) await deleteSkill(s.id, DEFAULT_WORKSPACE_ID);
    server.close(); delete process.env.ANTHROPIC_BASE_URL; delete process.env.ANTHROPIC_API_KEY; await closeDb();
  });

  it('a project with no team skills stays undecided, so later skills still apply', async () => {
    const p = await createProject('No skills yet');
    expect(await chooseSkills(p.id)).toBeNull();
    expect((await getProject(p.id)).skills.decided).toBe(false);
    expect(await skillBlock(p.id, 'storyboard')).toBe('');
  });

  it('loads always-on skills, lets Nick pick the rest once, and scopes bodies by stage', async () => {
    await createSkill(DEFAULT_WORKSPACE_ID, null, { name: 'brand-voice', description: 'Every video', body: 'Never say seamless.', always: true });
    await createSkill(DEFAULT_WORKSPACE_ID, null, { name: 'linkedin-hooks', description: 'LinkedIn ads', body: 'Open on the pain.', stages: ['angles', 'storyboard'] });
    await createSkill(DEFAULT_WORKSPACE_ID, null, { name: 'tiktok', description: 'TikTok only', body: 'Be loud.' });
    await createSkill(DEFAULT_WORKSPACE_ID, null, { name: 'off-one', description: 'Disabled', body: 'Ignore me.', enabled: false, always: true });
    pick = ['linkedin-hooks', 'not-a-skill'];
    const p = await createProject('LinkedIn ad');
    const got = await chooseSkills(p.id);
    expect(got?.names.sort()).toEqual(['brand-voice', 'linkedin-hooks']);
    const n = calls;
    expect(await chooseSkills(p.id)).toBeNull();          // decided once per project
    expect(calls).toBe(n);
    const sb = await skillBlock(p.id, 'storyboard');
    expect(sb).toContain('Never say seamless.'); expect(sb).toContain('Open on the pain.'); expect(sb).not.toContain('Be loud.'); expect(sb).not.toContain('Ignore me.');
    expect(sb).toMatch(/never invent a number/);
    const chat = await skillBlock(p.id, 'chat');
    expect(chat).toContain('Never say seamless.'); expect(chat).not.toContain('Open on the pain.');
    expect((await toggleSkill(p.id, 'tiktok', true))?.name).toBe('tiktok');
    expect(await skillBlock(p.id, 'voice')).toContain('Be loud.');
    await toggleSkill(p.id, 'brand voice', false);
    expect(await skillBlock(p.id, 'chat')).not.toContain('seamless');
    expect(await toggleSkill(p.id, 'nothing-like-this', true)).toBeNull();
  });
});
