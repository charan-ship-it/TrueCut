// Nick — the conversational director. Every user turn (typed text, dropped sources, or a click on a
// card) runs as one background job that advances the project and posts messages + rich cards to the
// project's chat. Claude interprets free-form messages; a rule-based interpreter keeps it usable without a key.
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from '@truecut/config';
import { getProject, newId, updateProject } from '@truecut/db';
import { projectPath } from '@truecut/storage';
import { addSource, ingestPath, ingestText, ingestUrl, ingestStoredUpload, pathsAllowed, PATHS_OFF } from '../sources/ingest';
import { analyze, storyboard, reviseScene, callTool } from '../ads/ai';
import { voiceAll } from '../audio/voice';
import { buildAudio } from '../audio/soundtrack';
import { renderProject } from '../render/render';
import { castVoices } from '../ads/cast';
import { ingestMedia, isMedia, planTalk, buildProxies, buildProxiesFresh, renderTalk, reviseBeat } from '../talk/talk';
import { ffmpeg } from '../render/media';
import { checkScenes } from '@truecut/shared/facts';
import { defineHandler, enqueue, type Log } from '@truecut/queue';
import { DIRECTIONS } from '@truecut/engine/styles.js';
import type { Angle, ChatMsg, FormatId, Project } from '@truecut/shared/types';

import { detectSources, type Attachment } from '@truecut/shared/detect';
export { detectSources, type Attachment };
export type Action =
  | { type: 'message'; text: string; attachments?: Attachment[] }
  | { type: 'answers'; answers: Record<string, string> }
  | { type: 'angle'; id: string }
  | { type: 'direction'; preset: string }
  | { type: 'storyboard' }
  | { type: 'render'; formats?: FormatId[] }
  | { type: 'reply'; text: string }
  | { type: 'talkbrief'; brief: Record<string, any> };

// ───────────── chat helpers ─────────────
const now = () => new Date().toISOString();
export async function post(pid: string, m: Partial<ChatMsg> & { role: ChatMsg['role'] }): Promise<string> {
  const id = 'm' + newId().slice(0, 8);
  await updateProject(pid, (p) => { p.chat.push({ id, text: '', cards: [], replies: [], attachments: [], at: now(), ...m } as ChatMsg); });
  return id;
}
async function patchMsg(pid: string, id: string, fn: (m: ChatMsg) => void) { await updateProject(pid, (p) => { const m = p.chat.find((x) => x.id === id); if (m) fn(m); }); }

/** A live "working" card: a checklist of steps that fill in as the job runs. Card writes are queued on one
 *  chain so they land in order; step/fail/finish return that chain so callers can wait for it. */
async function progress(pid: string, jobId: string, title: string) {
  const id = await post(pid, { role: 'nick', jobId, cards: [{ kind: 'progress', title, steps: [], done: false }] });
  let last = 0;
  let chain: Promise<void> = Promise.resolve();
  const card = (fn: (c: any) => void) => {
    chain = chain.then(() => patchMsg(pid, id, (m) => { const c = m.cards.find((x: any) => x.kind === 'progress'); if (c) fn(c); })).catch((e) => console.error('[progress]', e?.message));
    return chain;
  };
  return {
    id,
    step(label: string) { return card((c) => { for (const s of c.steps) if (s.state === 'run') s.state = 'ok'; c.steps.push({ label, state: 'run', detail: '' }); }); },
    detail(d: string) { const t = Date.now(); if (t - last < 500) return; last = t; void card((c) => { const s = c.steps[c.steps.length - 1]; if (s) s.detail = d; }); },
    fail(err: string) { return card((c) => { const s = c.steps[c.steps.length - 1]; if (s) { s.state = 'err'; s.detail = err; } }); },
    finish(title?: string) { return card((c) => { for (const s of c.steps) if (s.state === 'run') s.state = 'ok'; c.done = true; if (title) c.title = title; }); },
  };
}
type Prog = Awaited<ReturnType<typeof progress>>;
const sublog = (pr: Prog): Log => (msg) => pr.detail(msg);

// ───────────── entry point ─────────────
/** Post the user's message, mark Nick busy and queue the turn. The turn itself runs as a "nick" job. */
export async function startTurn(pid: string, action: Action, opts: { createdBy?: string | null } = {}) {
  const p = await getProject(pid);
  if (action.type === 'message' || action.type === 'reply') {
    await post(pid, { role: 'user', text: action.text, attachments: action.type === 'message' ? action.attachments || [] : [] });
  } else {
    await post(pid, { role: 'user', text: userEcho(p, action) });
  }
  await updateProject(pid, (pp) => { pp.agentBusy = true; });
  return enqueue('nick', pid, { action }, opts);
}

defineHandler<{ action: Action }>('nick', async ({ action }, { job }) => {
  const pid = job.projectId!;
  try { await turn(pid, action, job.id); }
  catch (e: any) { await post(pid, { role: 'nick', text: `Something went wrong: ${e.message}`, cards: [{ kind: 'error', message: e.message }], replies: ['Try again'] }); throw e; }
  finally { await updateProject(pid, (pp) => { pp.agentBusy = false; }); }
});

function userEcho(p: Project, a: Action): string {
  switch (a.type) {
    case 'answers': return 'Here are my answers.';
    case 'angle': return `Let's go with “${p.angles.find((x) => x.id === a.id)?.title || a.id}”.`;
    case 'direction': return `Switch the look to ${DIRECTIONS[a.preset]?.label || a.preset}.`;
    case 'storyboard': return 'Write the storyboard.';
    case 'talkbrief': return `Cut it${a.brief?.length ? ` to about ${a.brief.length}s` : ''}${a.brief?.layout ? `, ${a.brief.layout} layout` : ''}.`;
    case 'render': return `Render it${a.formats?.length ? ` (${a.formats.map((f) => f.replace('x', ':')).join(', ')})` : ''}.`;
    default: return '';
  }
}

async function turn(pid: string, a: Action, jobId: string) {
  if (a.type === 'answers') return afterAnswers(pid, a.answers, jobId);
  if (a.type === 'angle') return pickAngle(pid, a.id, jobId);
  if (a.type === 'direction') return setDirection(pid, a.preset, jobId, true);
  if (a.type === 'storyboard') return writeStory(pid, jobId);
  if (a.type === 'render') return render(pid, a.formats, jobId);
  if (a.type === 'talkbrief') return cutTalk(pid, a.brief || {}, jobId);
  const text = a.text || '';
  const atts = a.type === 'message' ? a.attachments || [] : [];
  const found = [...atts, ...detectSources(text)];
  const p = await getProject(pid);
  if (found.length) return intake(pid, found, text, jobId);
  if (!p.sources.length) {
    // just notes, no links: treat substantial text as a source
    if (text.trim().length > 140) return intake(pid, [{ kind: 'text', label: 'Your notes', ref: text }], '', jobId);
    await post(pid, { role: 'nick', text: "Drop me something to read first: your website, a repo or folder path, a doc, or paste your notes. I'll pull the real facts and screenshots out of it.", replies: ['https://aixccelerate.com', 'Use the Agent Nick repo'] });
    return;
  }
  return interpret(pid, text, jobId);
}

// ───────────── 1. intake → analyse → questions ─────────────
async function intake(pid: string, items: Attachment[], text: string, jobId: string) {
  const pr = await progress(pid, jobId, 'Reading your sources');
  const before = await getProject(pid);
  for (const it of items) {
    if (it.kind === 'upload') { // stored by the uploads route; read it here, in the job
      const src = (await getProject(pid)).sources.find((x) => x.id === it.ref);
      if (src && src.status === 'pending' && !src.meta?.mediaFile) { await pr.step(`Reading ${it.label}`); await ingestStoredUpload(pid, it.ref); }
      continue;
    }
    const s = await addSource(pid, it.kind as any, it.ref, it.kind === 'text' ? it.label : undefined);
    try {
      if (it.kind === 'url') { await pr.step(`Visiting ${it.label}`); let u = it.ref.trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; await ingestUrl(pid, s.id, u, sublog(pr)); }
      else if (it.kind === 'path' && !pathsAllowed()) throw new Error(PATHS_OFF);
      else if (it.kind === 'path') { const abs = path.resolve(ROOT, it.ref.trim().replace(/^~(?=\/)/, process.env.HOME || '~'));
        if (isMedia(abs) && fs.existsSync(abs) && fs.statSync(abs).isFile()) { await pr.step(`Transcribing ${it.label}`); await ingestMedia(pid, s.id, abs, path.basename(abs), sublog(pr)); }
        else { await pr.step(`Reading ${it.label}`); await ingestPath(pid, s.id, abs, sublog(pr)); } }
      else { await pr.step('Reading your notes'); await ingestText(pid, s.id, it.ref); }
    } catch (e: any) {
      await updateProject(pid, (p) => { const x = p.sources.find((y) => y.id === s.id); if (x) { x.status = 'error'; x.error = e.message; } });
      await pr.fail(e.message);
    }
  }
  if (text && items.every((i) => i.kind !== 'text') && text.replace(/\S*\/\S*|\bhttps?:\S+/g, '').trim().length > 60) {
    const s = await addSource(pid, 'text', 'notes', 'Notes from chat'); await ingestText(pid, s.id, text);
  }
  // uploaded recordings → transcribe
  for (const src of (await getProject(pid)).sources.filter((x) => x.meta?.mediaFile && !x.meta?.media && x.status === 'pending')) {
    await pr.step(`Transcribing ${src.meta!.name || src.label}`);
    try { await ingestMedia(pid, src.id, projectPath(pid, src.meta!.mediaFile), src.meta!.name || src.label, sublog(pr)); }
    catch (e: any) { await updateProject(pid, (p) => { const x = p.sources.find((y) => y.id === src.id); if (x) { x.status = 'error'; x.error = e.message; } }); await pr.fail(e.message); }
  }
  const p = await getProject(pid);
  const added = p.sources.filter((s) => !before.sources.some((b) => b.id === s.id) || items.some((i) => i.kind === 'upload' && i.ref === s.id));
  if (!p.sources.some((s) => s.status === 'ready')) { await pr.finish("Couldn't read that"); await post(pid, { role: 'nick', text: "I couldn't read any of that. Check the link or path and try again, or paste the text directly." }); return; }
  if (p.talk.media.length) return talkIntake(pid, pr, added.map((x) => x.id));
  await pr.step('Pulling out facts, numbers and visuals');
  await analyze(pid, sublog(pr));
  await pr.step('Fact-checking every claim against the source');
  await pr.finish('Read and fact-checked');
  const q = await getProject(pid);
  if (/^Untitled video/.test(q.name) && q.intake.productName && !/^Untitled/.test(q.intake.productName)) await updateProject(pid, (pp) => { pp.name = `${q.intake.productName} video`; });
  const verified = q.facts.filter((f) => f.status === 'verified').length;
  const shots = q.visuals.filter((v) => v.use).length;
  await post(pid, {
    role: 'nick',
    text: summaryLine(q, verified, shots),
    cards: [{ kind: 'sources', ids: added.map((s) => s.id) }, { kind: 'facts' }],
  });
  await updateProject(pid, (pp) => { pp.stage = 'questions'; });
  await post(pid, { role: 'nick', text: "A few things only you know. I've pre-filled my best guesses, so change what's wrong and send.", cards: [{ kind: 'questions' }] });
}

function summaryLine(p: Project, verified: number, shots: number) {
  const name = p.intake.productName || p.name;
  const one = p.intake.oneLiner ? ` ${p.intake.oneLiner.replace(/\.$/, '')}.` : '';
  return `Got it: **${name}**.${one} I found ${p.facts.length} facts (${verified} matched word-for-word in the source) and ${shots} visuals I can use. Anything I couldn't verify stays off screen unless you approve it.`;
}

// ───────────── founder talk ─────────────
async function talkIntake(pid: string, pr: Prog, added: string[]) {
  const p = await getProject(pid);
  const others = p.sources.filter((s) => s.status === 'ready' && !s.meta?.media && s.textFile);
  if (others.length && !p.facts.length) { await pr.step('Reading your other sources for brand, facts and screenshots'); await analyze(pid, sublog(pr)); }
  await pr.finish('Transcribed');
  const q = await getProject(pid); const m = q.talk.media[q.talk.media.length - 1];
  if (/^Untitled video/.test(q.name) || q.name === m.name) await updateProject(pid, (pp) => { pp.name = m.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '); });
  await post(pid, { role: 'nick', text: `Got the recording: **${fmtMin(m.duration)}**, ${m.words} words${m.speakers.length > 1 ? `, ${m.speakers.length} speakers` : ''}. Here's the transcript. Tell me who's speaking and how long you want it, and I'll cut it, then design an illustration for every beat. The audio is always the speaker's own voice. I never re-voice a founder.`, cards: [{ kind: 'transcript' }, ...(added.some((id) => !q.sources.find((s) => s.id === id)?.meta?.media) ? [{ kind: 'sources', ids: added }] : []), { kind: 'talkbrief' }] });
  await updateProject(pid, (pp) => { pp.stage = 'questions'; });
}
const fmtMin = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

async function cutTalk(pid: string, brief: Record<string, any>, jobId: string, instruction = '') {
  await updateProject(pid, (p) => {
    if (brief.length) p.intake.length = Math.max(10, Math.min(180, Number(brief.length) || p.intake.length));
    if (brief.layout === 'split' || brief.layout === 'overlay') p.talk.layout = brief.layout;
    if (brief.music) p.talk.music = brief.music;
    if (brief.name != null) p.talk.speaker.name = String(brief.name);
    if (brief.role != null) p.talk.speaker.role = String(brief.role);
    if (brief.label != null) p.talk.label = String(brief.label);
    if (brief.captions != null) p.talk.showCaptions = !!brief.captions;
    if (brief.formats?.length) p.intake.formats = brief.formats;
    if (brief.note != null) p.talk.instruction = String(brief.note);
    if (brief.productName) p.intake.productName = brief.productName;
  });
  const pr = await progress(pid, jobId, 'Editing the talk');
  await pr.step('Choosing the strongest moments and designing each beat');
  await planTalk(pid, sublog(pr), instruction);
  await pr.step('Cutting the speaker and scoring the bed');
  await buildProxies(pid, sublog(pr));
  await pr.finish('Edit ready');
  const p = await getProject(pid); const m = p.talk.media[0];
  const kinds = [...new Set(p.talk.beats.map((b) => b.visual?.kind))];
  await post(pid, { role: 'nick', text: `Cut **${fmtMin(m.duration)} → ${p.talk.duration.toFixed(0)}s**, ${p.talk.beats.length} beats, ${kinds.length} kinds of illustration. It's playing on the right with the real audio. Every number on screen is one the speaker actually said.`, cards: [{ kind: 'edit' }, { kind: 'directions' }], replies: ['Render it', 'Make it shorter', 'Switch to overlay layout', 'Try another look'] });
}

// ───────────── 2. answers → angles ─────────────
async function afterAnswers(pid: string, answers: Record<string, string>, jobId: string) {
  await updateProject(pid, (p) => {
    for (const q of p.questions) if (answers[q.id] != null) q.answer = String(answers[q.id]);
    for (const [k, v] of Object.entries(answers)) if (k.startsWith('intake.')) (p.intake as any)[k.slice(7)] = k === 'intake.length' ? Number(v) || p.intake.length : v;
    p.stage = 'storyboard';
  });
  const pr = await progress(pid, jobId, 'Finding the story');
  await pr.step('Looking for the sharpest angles in your facts');
  const angles = await proposeAngles(pid);
  await updateProject(pid, (p) => { p.angles = angles; });
  await pr.finish('Three ways to tell it');
  await post(pid, { role: 'nick', text: 'Here are three different ways to tell this story. Pick one, or tell me what you have in mind.', cards: [{ kind: 'angles' }] });
}

const ANGLE_TOOL = {
  name: 'record_angles', description: 'Three distinct creative angles for the video.',
  input_schema: { type: 'object', required: ['angles'], properties: { angles: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', required: ['title', 'hook', 'why', 'preset', 'structure'], properties: {
    title: { type: 'string', description: '2-4 word name of the concept' },
    hook: { type: 'string', description: 'the opening line the viewer hears/sees in the first 2 seconds, built from a REAL fact' },
    why: { type: 'string', description: 'one line: why this lands with the audience' },
    structure: { type: 'string', description: 'the beats, e.g. "real number → the pain → reveal → 3 proofs → CTA"' },
    preset: { type: 'string', enum: Object.keys(DIRECTIONS), description: 'the visual + sonic direction that suits this angle' } } } } } },
};

async function proposeAngles(pid: string): Promise<Angle[]> {
  const p = await getProject(pid);
  const facts = p.facts.filter((f) => f.approved).slice(0, 40).map((f) => `${f.id} [${f.kind}] ${f.statement}`).join('\n');
  const qa = p.questions.map((q) => `Q: ${q.question}\nA: ${q.answer || q.suggested}`).join('\n');
  if (config.anthropicKey) {
    try {
      const out = await callTool<any>({
        model: config.creativeModel, maxTokens: 3000,
        system: `You are a creative director. Propose three angles for a ${p.intake.length}s motion-graphics ad that are GENUINELY different from each other — different emotional route, different structure, different look. Hooks must be built only from the facts listed (no invented numbers). Directions available:\n${Object.entries(DIRECTIONS).map(([k, d]: any) => `- ${k}: ${d.vibe}`).join('\n')}\nPick a different direction for each angle.`,
        tool: ANGLE_TOOL,
        content: [{ type: 'text', text: `Product: ${p.intake.productName} — ${p.intake.oneLiner}\nAudience: ${p.intake.audience}\nGoal/CTA: ${p.intake.goal} / ${p.intake.cta}\nTone: ${p.intake.tone}\n\n${qa}\n\nFACTS\n${facts}` }],
      });
      return (out.angles || []).slice(0, 3).map((a: any) => ({ id: 'a' + newId().slice(0, 5), title: a.title, hook: a.hook, why: a.why || '', preset: DIRECTIONS[a.preset] ? a.preset : 'signal', structure: a.structure || '' }));
    } catch (e) { console.error('angles', e); }
  }
  const metric = p.facts.find((f) => f.approved && f.kind === 'metric');
  const feat = p.facts.find((f) => f.approved && f.kind === 'feature');
  const name = p.intake.productName || p.name;
  return [
    { id: 'a1', title: 'Lead with the number', hook: metric?.statement || `${name}, by the numbers.`, why: 'A real figure stops the scroll and earns trust in one beat.', preset: 'signal', structure: 'real number → what it means → reveal → proof on screen → CTA' },
    { id: 'a2', title: 'Before and after', hook: `What changes when you use ${name}.`, why: 'The contrast makes the value obvious without a feature list.', preset: 'editorial', structure: 'the old way → the turn → the new way, shown in the product → CTA' },
    { id: 'a3', title: 'Loud and fast', hook: feat?.statement || p.intake.oneLiner || `Meet ${name}.`, why: 'High-energy kinetic type for feeds where you have one second.', preset: 'brutal', structure: 'slammed phrases → reveal → three quick proofs → CTA' },
  ];
}

// ───────────── 3. angle → direction → storyboard ─────────────
async function pickAngle(pid: string, angleId: string, jobId: string) {
  const ang = (await getProject(pid)).angles.find((a) => a.id === angleId);
  if (!ang) throw new Error('That angle is no longer available.');
  await updateProject(pid, (p) => { p.angleId = angleId; p.style = { preset: ang.preset, why: ang.why }; });
  await writeStory(pid, jobId);
}

async function setDirection(pid: string, preset: string, jobId: string, announce: boolean) {
  if (!DIRECTIONS[preset]) throw new Error('Unknown direction');
  await updateProject(pid, (p) => { p.style = { ...(p.style || {}), preset }; p.audioHash = undefined; });
  if (announce) await post(pid, { role: 'nick', text: `Switched to **${DIRECTIONS[preset].label}**: ${DIRECTIONS[preset].vibe} The preview on the right has updated, and the music changes with it.`, replies: ['Render it', 'Make it punchier', 'Try another look'] });
}

async function writeStory(pid: string, jobId: string) {
  const pr = await progress(pid, jobId, 'Writing the storyboard');
  await pr.step('Writing scenes from your verified facts');
  await storyboard(pid, sublog(pr));
  await pr.step('Running the fact guard');
  if (config.elevenKey) { await pr.step('Casting the voice and choosing the score'); try { await castVoices(pid, sublog(pr)); } catch (e: any) { await pr.fail(e.message); } }
  await pr.finish('Storyboard ready');
  const p = await getProject(pid);
  const errs = checkScenes(p).filter((i) => i.level === 'error');
  const words = p.scenes.reduce((a, s) => a + (s.vo?.text || '').split(/\s+/).filter(Boolean).length, 0);
  await post(pid, {
    role: 'nick',
    text: `${p.scenes.length} scenes, ${words} spoken words, in the **${DIRECTIONS[p.style?.preset || 'signal']?.label}** direction. It's playing on the right.${errs.length ? ` ⚠ ${errs.length} line(s) use something I couldn't trace. They're flagged below.` : ' Every number on screen traces back to a source.'}`,
    cards: [{ kind: 'storyboard' }, ...((await getProject(pid)).cast.members.length ? [{ kind: 'cast' }] : []), { kind: 'directions' }],
    replies: ['Render it', 'Make the hook punchier', 'Try a different voice', 'Try another look'],
  });
}

// ───────────── 4. render ─────────────
async function render(pid: string, formats: FormatId[] | undefined, jobId: string) {
  let p = await getProject(pid);
  if (p.kind === 'talk') {
    if (!p.talk.beats.length) { await post(pid, { role: 'nick', text: "I haven't cut the talk yet. Fill in the brief above and hit Cut it.", replies: [] }); return; }
    const fm0 = (formats?.length ? formats : p.intake.formats) as FormatId[];
    const pr0 = await progress(pid, jobId, 'Rendering the talk');
    pr0.step(`Compositing ${fm0.map((f) => f.replace('x', ':')).join(' + ')} at full quality`);
    const before0 = new Set(p.renders.map((r) => r.id));
    await renderTalk(pid, fm0, sublog(pr0));
    const fresh0 = (await getProject(pid)).renders.filter((r) => !before0.has(r.id));
    await makePoster(pid, fresh0);
    pr0.finish('Rendered');
    await post(pid, { role: 'nick', text: 'Done. Want a variation? I can tighten it, swap the layout, change the look, or redraw any beat.', cards: [{ kind: 'render', ids: fresh0.map((r) => r.id) }], replies: ['Cut a 30s version', 'Switch to overlay layout', 'Try another look'] });
    return;
  }
  if (!p.scenes.length) { await post(pid, { role: 'nick', text: "There's no storyboard yet. Let me write one first.", replies: ['Write the storyboard'] }); return; }
  const fm = (formats?.length ? formats : p.intake.formats) as FormatId[];
  const pr = await progress(pid, jobId, 'Making your video');
  if (config.elevenKey && !(await getProject(pid)).cast.members.length) { await pr.step('Casting the voice'); try { await castVoices(pid, sublog(pr)); } catch (e: any) { await pr.fail(e.message); } }
  if (config.elevenKey) { const c = (await getProject(pid)).cast; await pr.step(`Recording the voice-over${c.members.length ? ` (${c.members.map((m) => m.name).join(' + ')})` : ''}`); try { await voiceAll(pid, sublog(pr)); } catch (e: any) { await pr.fail(e.message); } }
  else await pr.step('No voice key set, so rendering with music and captions only');
  await pr.step('Scoring music and sound design');
  await buildAudio(pid, sublog(pr));
  await pr.step(`Rendering ${fm.map((f) => f.replace('x', ':')).join(' + ')}`);
  const before = new Set((await getProject(pid)).renders.map((r) => r.id));
  await renderProject(pid, fm, sublog(pr));
  p = await getProject(pid);
  const fresh = p.renders.filter((r) => !before.has(r.id));
  await makePoster(pid, fresh);
  await pr.finish('Rendered');
  await post(pid, { role: 'nick', text: 'Done. Here it is. Want a variation? I can change the look, tighten it, or cut a 15-second version.', cards: [{ kind: 'render', ids: fresh.map((r) => r.id) }], replies: ['Cut a 15s version', 'Try another look', 'Make it punchier'] });
}

async function makePoster(pid: string, fresh: { id: string; file: string; duration: number; format: string }[]) {
  const first = fresh.find((r) => r.format === '4x5') || fresh[0]; if (!first) return;
  try { const poster = `renders/poster-${first.id}.jpg`; await ffmpeg(['-ss', String(Math.min(2.2, first.duration / 3)), '-i', projectPath(pid, first.file), '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', projectPath(pid, poster)]); await updateProject(pid, (pp) => { pp.product = { ...(pp.product || {}), poster }; }); } catch {}
}

// ───────────── free-form: interpret the message ─────────────
const DECIDE_TOOL = {
  name: 'decide', description: 'Decide what to do with the user message.',
  input_schema: { type: 'object', required: ['reply', 'actions'], properties: {
    reply: { type: 'string', description: 'short, warm reply in plain language (1-2 sentences). Say what you are about to do.' },
    actions: { type: 'array', items: { type: 'object', required: ['do'], properties: {
      do: { type: 'string', enum: ['revise_scene', 'restoryboard', 'set_length', 'set_brief', 'set_direction', 'propose_angles', 'render', 'delete_scene', 'set_layout', 'set_captions', 'recast', 'none'] },
      layout: { type: 'string', enum: ['split', 'overlay'] }, captions: { type: 'boolean' },
      scene: { type: 'number', description: '1-based scene number for revise/delete' },
      instruction: { type: 'string' }, length: { type: 'number' }, preset: { type: 'string', enum: Object.keys(DIRECTIONS) },
      brief: { type: 'object', description: 'intake fields to change: productName, audience, cta, ctaUrl, tone, goal, mustSay, mustAvoid, byline' },
      formats: { type: 'array', items: { type: 'string', enum: ['4x5', '9x16', '1x1'] } } } } } } },
};

async function interpret(pid: string, text: string, jobId: string) {
  const p = await getProject(pid);
  if (p.kind === 'talk') return interpretTalk(pid, text, jobId);
  const quick = rules(text, p);
  let plan: { reply: string; actions: any[] } | null = quick;
  if (!plan && config.anthropicKey) {
    plan = await callTool<any>({
      model: config.model, maxTokens: 1500,
      system: `You are Nick, the director inside TrueCut, a tool that turns real product sources into motion-graphics video ads. Map the user's message to actions. Never invent facts. If they ask for something general ("punchier", "more energy"), revise the relevant scenes or restoryboard with that instruction. Anything about the VOICE(S), narrator, accent, a second voice or the music/score → recast with their words as the instruction. Directions: ${Object.entries(DIRECTIONS).map(([k, d]: any) => `${k} (${d.label})`).join(', ')}.`,
      tool: DECIDE_TOOL,
      content: [{ type: 'text', text: `Stage: ${p.stage}. Direction: ${p.style?.preset}. Length target: ${p.intake.length}s.\nStoryboard:\n${p.scenes.map((s, i) => `${i + 1}. [${s.type}] ${s.vo?.text || ''}`).join('\n') || '(none yet)'}\n\nUser: ${text}` }],
    });
  }
  if (!plan) {
    await post(pid, { role: 'nick', text: "Without an AI key I can only do the basics: pick a look, change the length, write the storyboard, or render. Add ANTHROPIC_API_KEY to unlock free-form edits.", replies: ['Write the storyboard', 'Render it', 'Try another look'] });
    return;
  }
  if (plan.reply) await post(pid, { role: 'nick', text: plan.reply });
  let restory = false; let changed = false;
  for (const ac of plan.actions || []) {
    if (ac.do === 'set_length' && ac.length) { await updateProject(pid, (pp) => { pp.intake.length = Math.max(10, Math.min(60, Math.round(ac.length))); }); restory = true; }
    if (ac.do === 'set_brief' && ac.brief) { await updateProject(pid, (pp) => { Object.assign(pp.intake, ac.brief); }); changed = true; }
    if (ac.do === 'set_direction' && ac.preset) { await setDirection(pid, ac.preset, jobId, true); }
    if (ac.do === 'propose_angles') { const angles = await proposeAngles(pid); await updateProject(pid, (pp) => { pp.angles = angles; }); await post(pid, { role: 'nick', text: 'Fresh angles:', cards: [{ kind: 'angles' }] }); }
    if (ac.do === 'restoryboard') { if (ac.instruction) await updateProject(pid, (pp) => { pp.intake.mustSay = [pp.intake.mustSay, ac.instruction].filter(Boolean).join(' · '); }); restory = true; }
    if (ac.do === 'delete_scene' && ac.scene) { await updateProject(pid, (pp) => { pp.scenes.splice(ac.scene - 1, 1); pp.audioHash = undefined; }); changed = true; }
    if (ac.do === 'revise_scene' && ac.scene && ac.instruction) {
      const sc = (await getProject(pid)).scenes[ac.scene - 1];
      if (sc) { const pr = await progress(pid, jobId, `Revising scene ${ac.scene}`); await pr.step(ac.instruction); await reviseScene(pid, sc.id, ac.instruction); await pr.finish(`Scene ${ac.scene} revised`); changed = true; }
    }
    if (ac.do === 'recast') { await recast(pid, ac.instruction || text, jobId); }
    if (ac.do === 'render') { await render(pid, ac.formats, jobId); return; }
  }
  if (restory) return writeStory(pid, jobId);
  if (changed) await post(pid, { role: 'nick', text: 'Updated. The preview has the change.', cards: [{ kind: 'storyboard' }], replies: ['Render it', 'Try another look'] });
}

async function interpretTalk(pid: string, text: string, jobId: string) {
  const p = await getProject(pid);
  if (!p.talk.beats.length) { await post(pid, { role: 'nick', text: 'Fill in the brief above and hit **Cut it**: I need the speaker and the length before I edit.' }); return; }
  const t = text.trim().toLowerCase();
  // the founder's voice is never replaced: answer requests to re-voice / dub / add a narrator
  if (/\b(voice ?over|re-?voice|dub|narrat|ai voice|different voice|another voice|new voice|\/voice)\b/.test(t) && !/music|bed|score/.test(t)) {
    await post(pid, { role: 'nick', text: "In founder talks the audio is always the founder's own recorded voice. I never replace, re-voice or add a synthetic narrator to it. I can change the music bed under it (lo-fi, piano, ambient, cinematic, bright, or none), the cut, the captions or the look.", replies: ['Music: piano', 'Music: none', 'Render it'] });
    return;
  }
  const mus = t.match(/^(?:\/music|music:?|use)\s+(lo-?fi|piano|ambient|cinematic|bright|none|no music)\b/);
  if (mus) {
    const g = mus[1].replace('lo-fi', 'lofi').replace('no music', 'none');
    await updateProject(pid, (pp) => { pp.talk.music = g; pp.talk.mix = undefined; });
    const pr = await progress(pid, jobId, 'Re-scoring the bed'); await pr.step(g === 'none' ? 'Founder voice only' : `A quiet ${g} bed under the founder's voice`); await buildProxiesFresh(pid, sublog(pr)); await pr.finish('Bed updated');
    await post(pid, { role: 'nick', text: g === 'none' ? 'Music off. It\'s just the founder now.' : `Switched the bed to **${g}**, kept low under the founder's voice.`, cards: [{ kind: 'edit' }], replies: ['Render it'] });
    return;
  }
  let plan = rules(text, p);
  const lay = t.match(/\b(split|overlay)\b/); if (!plan && lay && /\b(layout|switch|use|try)\b/.test(t)) plan = { reply: '', actions: [{ do: 'set_layout', layout: lay[1] }] };
  if (!plan && /captions? (on|off)|(show|hide|add|remove) captions/.test(t)) plan = { reply: '', actions: [{ do: 'set_captions', captions: /on|show|add/.test(t) }] };
  if (!plan && config.anthropicKey) plan = await callTool<any>({
    model: config.model, maxTokens: 1500,
    system: `You are Nick, the editor inside TrueCut. This project is a FOUNDER TALK: a real recording cut into a short with an illustrated panel per beat. Map the user's message to actions. "scene N" means beat N. restoryboard = re-edit the whole cut with the instruction (e.g. "start with the tribal knowledge bit", "more energy", "drop the intro"). revise_scene = redraw one beat's headline/illustration. set_layout split|overlay. Directions: ${Object.keys(DIRECTIONS).join(', ')}.`,
    tool: DECIDE_TOOL,
    content: [{ type: 'text', text: `Length now: ${p.talk.duration.toFixed(0)}s (target ${p.intake.length}s). Layout: ${p.talk.layout}. Look: ${p.style?.preset}.\nBeats:\n${p.talk.beats.map((b, i) => `${i + 1}. "${b.headline}" [${b.visual?.kind}]`).join('\n')}\n\nUser: ${text}` }],
  });
  if (!plan) { await post(pid, { role: 'nick', text: 'Without an AI key I can change the length, layout, look and captions, or render. Add ANTHROPIC_API_KEY for free-form edits.', replies: ['Render it', 'Switch to overlay layout', 'Make it shorter'] }); return; }
  if (plan.reply) await post(pid, { role: 'nick', text: plan.reply });
  let recut = null as { brief: any; note: string } | null; let changed = false; let relayout = false;
  for (const ac of plan.actions || []) {
    if (ac.do === 'set_length' && ac.length) recut = { brief: { ...(recut?.brief || {}), length: ac.length }, note: recut?.note || '' };
    if (ac.do === 'restoryboard') recut = { brief: recut?.brief || {}, note: ac.instruction || '' };
    if (ac.do === 'set_direction' && ac.preset) await setDirection(pid, ac.preset, jobId, true);
    if (ac.do === 'set_layout' && ac.layout) { await updateProject(pid, (pp) => { pp.talk.layout = ac.layout; }); relayout = true; }
    if (ac.do === 'set_captions') { await updateProject(pid, (pp) => { pp.talk.showCaptions = !!ac.captions; }); changed = true; }
    if (ac.do === 'set_brief' && ac.brief) { await updateProject(pid, (pp) => { Object.assign(pp.intake, ac.brief); }); }
    if (ac.do === 'delete_scene' && ac.scene) { await updateProject(pid, (pp) => { pp.talk.beats.splice(ac.scene - 1, 1); }); changed = true; }
    if (ac.do === 'revise_scene' && ac.scene && ac.instruction) { const pr = await progress(pid, jobId, `Redrawing beat ${ac.scene}`); await pr.step(ac.instruction); await reviseBeat(pid, ac.scene - 1, ac.instruction); await pr.finish(`Beat ${ac.scene} redrawn`); changed = true; }
    if (ac.do === 'render') { await render(pid, ac.formats, jobId); return; }
  }
  if (recut) return cutTalk(pid, recut.brief, jobId, recut.note);
  if (relayout) { const pr = await progress(pid, jobId, 'Re-framing the speaker'); await pr.step(`Switching to the ${(await getProject(pid)).talk.layout} layout`); await buildProxies(pid, sublog(pr)); await pr.finish('Layout switched'); changed = true; }
  if (changed) await post(pid, { role: 'nick', text: 'Updated. The monitor has the change.', cards: [{ kind: 'edit' }], replies: ['Render it', 'Try another look'] });
}

async function recast(pid: string, instruction: string, jobId: string) {
  const pr = await progress(pid, jobId, 'Recasting');
  await pr.step(instruction ? `“${instruction.slice(0, 80)}”` : 'Choosing a different cast');
  await castVoices(pid, sublog(pr), instruction);
  await pr.finish('Recast');
  const c = (await getProject(pid)).cast;
  await post(pid, { role: 'nick', text: c.members.length ? `New cast: **${c.members.map((m) => `${m.name}${c.members.length > 1 ? ` (${m.role})` : ''}`).join(' + ')}**. ${c.why}` : "I couldn't reach the voice library just now.", cards: c.members.length ? [{ kind: 'cast' }] : [], replies: ['Render it', 'Try a different voice'] });
}

/** Cheap deterministic intents (work without an AI key). */
function rules(text: string, p: Project): { reply: string; actions: any[] } | null {
  const t = text.trim().toLowerCase();
  const dir = t.match(/^\/(?:direction|look)\s+(\w+)/) || t.match(/\b(?:switch|change|try)\b.*\b(signal|editorial|neon|swiss|brutal|blueprint|cinematic|terminal|pop|magazine)\b/);
  if (dir && DIRECTIONS[dir[1]]) return { reply: '', actions: [{ do: 'set_direction', preset: dir[1] }] };
  if (/^(try )?another look$/.test(t)) { const keys = Object.keys(DIRECTIONS).filter((k) => k !== p.style?.preset); return { reply: '', actions: [{ do: 'set_direction', preset: keys[Math.floor(Math.random() * keys.length)] }] }; }
  const len = t.match(/\b(\d{2})\s*(?:s|sec|secs|seconds)\b/);
  if (len && /\b(cut|make|version|long|length|shorter|longer)\b/.test(t)) return { reply: `Re-cutting it to ${len[1]} seconds.`, actions: [{ do: 'set_length', length: Number(len[1]) }] };
  if (/^\/shorter$|^make it shorter$/.test(t)) return { reply: `Tightening it to ${Math.max(15, p.intake.length - 10)} seconds.`, actions: [{ do: 'set_length', length: Math.max(15, p.intake.length - 10) }] };
  if (/^\/?render( it)?\.?$/.test(t)) return { reply: '', actions: [{ do: 'render' }] };
  if (/^\/?(write|redo) (the )?storyboard\.?$/.test(t)) return { reply: '', actions: [{ do: 'restoryboard' }] };
  if (/^\/angles$|^new angles$/.test(t)) return { reply: '', actions: [{ do: 'propose_angles' }] };
  const vname = t.match(/^\/voice\s+(.+)$/); if (vname) return { reply: '', actions: [{ do: 'recast', instruction: `Use the voice named "${vname[1]}" as the narrator.` }] };
  if (/^(try )?(a )?different voice$/.test(t)) return { reply: '', actions: [{ do: 'recast', instruction: 'Try a clearly different narrator voice from the current one.' }] };
  if (/^(use )?(a )?(single|one) voice$/.test(t)) return { reply: '', actions: [{ do: 'recast', instruction: 'Use a single narrator for every line.' }] };
  if (t === 'try again') return { reply: '', actions: [{ do: p.scenes.length ? 'restoryboard' : 'propose_angles' }] };
  return null;
}
