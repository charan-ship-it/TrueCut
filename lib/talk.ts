// Founder talk mode, server side: ingest a recording → transcribe (ElevenLabs Scribe, word timestamps)
// → Claude edits it (keeps the strongest moments, splits into beats, designs an illustration per beat)
// → cut + crop the speaker with ffmpeg → score a quiet bed under the voice → composite the animated
// panel (rendered with alpha by the same engine as the preview) over the cut.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './env';
import { getProject, newId, projectPath, updateProject, writeAtomic } from './store';
import { ffmpeg, ffmpegPath, run, decodeAudio } from './media';
import { callTool } from './ai';
import { numbersIn, allowedNumbers } from './facts';
import { score, wav, SR } from './synth';
import { launchBrowser } from './browser';
import { staticServer, slug } from './render';
import { toComposition } from './compose';
import { speakerBox, talkLayout, TOOLKIT_KINDS, TOOLKIT_ICONS } from '../public/engine/talk.js';
import { FORMATS } from '../public/engine/timeline.js';
import { resolveStyle } from '../public/engine/styles.js';
import type { Log } from './jobs';
import type { Beat, FormatId, Media, Project, RenderOut } from './types';

export const MEDIA_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
export const isMedia = (name: string) => MEDIA_EXT.has(path.extname(name).toLowerCase());
type W = { w: string; s: number; e: number; sp?: string };
const FPS = 30;
const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);

// ───────────────────────── probe + ingest ─────────────────────────
export async function probeMedia(file: string) {
  const r = await run(ffmpegPath(), ['-hide_banner', '-i', file]);
  const t = r.stderr;
  const dm = t.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = dm ? +dm[1] * 3600 + +dm[2] * 60 + parseFloat(dm[3]) : 0;
  const vm = t.match(/Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
  let w = vm ? +vm[1] : 0, h = vm ? +vm[2] : 0;
  if (/rotation of -?90(\.0+)? degrees/.test(t) || /rotate\s*:\s*-?(90|270)/.test(t)) [w, h] = [h, w];
  const hasVideo = !!vm && !/Video: (mjpeg|png)/.test(t);
  return { duration, w, h, hasVideo };
}

/** Copy a recording into the project, transcribe it, and register it as talk media. */
export async function ingestMedia(pid: string, sid: string, srcFile: string, name: string, log: Log) {
  const ext = path.extname(name || srcFile).toLowerCase() || '.mp4';
  const mid = 'm' + newId().slice(0, 7);
  const file = `sources/${mid}${ext}`;
  fs.mkdirSync(projectPath(pid, 'talk'), { recursive: true });
  if (path.resolve(srcFile) !== projectPath(pid, file)) fs.copyFileSync(srcFile, projectPath(pid, file));
  const info = await probeMedia(projectPath(pid, file));
  if (!info.duration) throw new Error(`Couldn't read ${name}: no audio or video stream found.`);
  log(`${name}: ${fmtDur(info.duration)}${info.hasVideo ? `, ${info.w}×${info.h}` : ', audio only'}`);
  let poster: string | undefined;
  if (info.hasVideo) { poster = `talk/${mid}_poster.jpg`; try { await ffmpeg(['-ss', String(Math.min(2, info.duration / 3)), '-i', projectPath(pid, file), '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', projectPath(pid, poster)]); } catch { poster = undefined; } }
  log('Transcribing with ElevenLabs Scribe…');
  const words = await transcribe(pid, projectPath(pid, file), mid);
  const wordsFile = `talk/${mid}.words.json`;
  writeAtomic(projectPath(pid, wordsFile), JSON.stringify(words));
  const text = sentences(words).map((s) => s.text).join('\n');
  const textFile = `sources/${sid}.txt`;
  writeAtomic(projectPath(pid, textFile), `Transcript of ${name} (spoken by the founder/speaker)\n\n${text}`);
  const speakers = [...new Set(words.map((w) => w.sp).filter(Boolean) as string[])];
  const media: Media = { id: mid, sourceId: sid, name, file, duration: info.duration, w: info.w, h: info.h, hasVideo: info.hasVideo, wordsFile, words: words.length, speakers, poster };
  updateProject(pid, (p) => {
    const s = p.sources.find((x) => x.id === sid); if (s) Object.assign(s, { status: 'ready', textFile, chars: text.length, label: name, meta: { ...(s.meta || {}), media: mid, duration: info.duration } });
    p.talk.media.push(media); p.kind = 'talk';
    if (!p.style?.preset || p.style.preset === 'signal') p.style = { preset: 'editorial', useBrandAccent: true } as any;
  });
  log(`Transcribed ${words.length} words${speakers.length > 1 ? ` from ${speakers.length} speakers` : ''}`);
  return media;
}

async function transcribe(pid: string, file: string, mid: string): Promise<W[]> {
  if (!config.elevenKey) throw new Error('Transcribing needs ELEVENLABS_API_KEY (ElevenLabs Scribe). Add it to .env.local, or attach a .vtt/.srt transcript instead.');
  const mp3 = projectPath(pid, `talk/${mid}.mp3`);
  await ffmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', mp3]);
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1'); fd.append('timestamps_granularity', 'word'); fd.append('diarize', 'true'); fd.append('tag_audio_events', 'false');
  fd.append('file', new Blob([fs.readFileSync(mp3)], { type: 'audio/mpeg' }), 'audio.mp3');
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': config.elevenKey }, body: fd });
  if (!r.ok) throw new Error(`ElevenLabs Scribe HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j: any = await r.json();
  return (j.words || []).filter((w: any) => w.type === 'word' && String(w.text).trim()).map((w: any) => ({ w: String(w.text).trim(), s: +w.start, e: +w.end, sp: w.speaker_id }));
}

export function loadWords(pid: string, m: Media): W[] { try { return JSON.parse(fs.readFileSync(projectPath(pid, m.wordsFile || ''), 'utf8')); } catch { return []; } }

/** Group words into sentences (by punctuation and long pauses), keeping word indices. */
export function sentences(words: W[]) {
  const out: { from: number; to: number; text: string; s: number; e: number; sp?: string }[] = []; let a = 0;
  for (let i = 0; i < words.length; i++) {
    const end = /[.!?]["')\]]?$/.test(words[i].w) || i === words.length - 1 || (words[i + 1].s - words[i].e > 0.9) || (words[i + 1]?.sp && words[i + 1].sp !== words[i].sp) || i - a > 40;
    if (end) { out.push({ from: a, to: i, text: words.slice(a, i + 1).map((w) => w.w).join(' '), s: words[a].s, e: words[i].e, sp: words[a].sp }); a = i + 1; }
  }
  return out;
}
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtT = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// ───────────────────────── the edit (Claude) ─────────────────────────
export const TOOLKIT_SPEC = `
Motion toolkit — every beat gets ONE illustration (visual.kind + props). Draw the IDEA the speaker is saying, like a great explainer animator would. Vary kinds; never use the same kind 3 beats in a row.
- cards: { items: [{title ≤18 chars, sub? ≤24, icon}] (2-4), highlight?: index lit in accent halfway through }  → lists of types/options/pillars
- grid: { icon, count 6-16, cols?, highlight?: [indices], sequence?: true (a highlight hops cell to cell, e.g. people speaking), tags?: ["≤12 chars" ×≤3] }  → many things: files, people, tools, meetings
- bars: { title, kpis?: [{label, value}] (≤3, real numbers only), values: [numbers 6-10], highlight?: index }  → a dashboard / systems / data
- meter: { label ≤20, from, to, unit?: "%", showValue?: false, people?: 3-7, leaving?: index of the person who walks out }  (from/to are PRINTED unless showValue:false — print only numbers the speaker says; otherwise set showValue:false and the bar just drains/fills)  → something growing or draining (knowledge leaving, time saved)
- window: { crumbs: ["App","Section","Item"], badge?: "Recording", rows: [{who, text}] (≤4 short lines), note?: {title, items: [≤3 short]} }  → a product UI moment
- bubbles: { count 5-9, dissolve?: true }  → conversations, things said and lost
- brand: { name, kicker?, tagline ≤40, chips?: ["≤14 chars" ×≤3], image?: visualId (logo) }  → the product / company reveal
- stat: { value (from the transcript!), prefix?, suffix?, label ≤40 }  → one number the speaker says
- quote: { text: the speaker's exact words (≤14 words), highlight: ["key","words"] }  → a line worth reading
- list: { items: ["≤26 chars" ×3-5], marker?: "number"|"check" }  → steps, reasons
- compare: { left: {label, items: [≤3]}, right: {label, items: [≤3]} }  → old way vs new way
- flow: { steps: [{title ≤14, icon}] (3-5) }  → a process / pipeline
- orbit: { icon, label ≤34 }  → something being kept/captured/centralised
- image: { image: visualId (REQUIRED, from the list), callout? ≤30 }  → show the real product/site
Icons: ${TOOLKIT_ICONS.join(', ')}.`;

const PLAN_TOOL = {
  name: 'record_edit', description: 'The edit of the founder talk: what to keep, and the illustrated beats.',
  input_schema: { type: 'object', required: ['title', 'label', 'keep', 'beats'], properties: {
    title: { type: 'string', description: 'short internal title of the piece' },
    label: { type: 'string', description: 'tiny header strip, uppercase-able, ≤34 chars, e.g. "TRIBAL KNOWLEDGE · SCRIBE"' },
    speaker: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' } } },
    keep: { type: 'array', description: 'word-index ranges to KEEP, in chronological order (whole sentences or clauses; drop filler, false starts, repetition, tangents)', items: { type: 'object', required: ['from', 'to'], properties: { from: { type: 'number' }, to: { type: 'number' } } } },
    beats: { type: 'array', description: 'consecutive beats covering all kept words, each ~1.8-5 s of speech (one idea each)', items: { type: 'object', required: ['from', 'to', 'headline', 'accent', 'visual'], properties: {
      from: { type: 'number', description: 'first word index (must be inside a kept range)' }, to: { type: 'number' },
      headline: { type: 'string', description: '1-3 words that name the idea, e.g. "Tribal knowledge", "When they leave"' },
      accent: { type: 'string', description: 'the ONE word of the headline set in the accent serif italic' },
      sub: { type: 'string', description: '2-6 word subline, e.g. "that knowledge walks out"' },
      visual: { type: 'object', description: 'the illustration: {kind, ...props} from the toolkit' } } } },
  } },
};

export async function planTalk(pid: string, log: Log, instruction = '') {
  const p = getProject(pid);
  const media = p.talk.media[0]; if (!media) throw new Error('No recording in this project yet.');
  const words = loadWords(pid, media); if (!words.length) throw new Error('The recording has no transcript.');
  const target = p.intake.length || 45;
  const sents = sentences(words);
  if (media.hasVideo && !media.face) await detectFace(pid, media).catch(() => {});
  let out: any;
  if (config.anthropicKey) {
    log(`Claude is editing ${fmtDur(media.duration)} of talk down to ~${target}s…`);
    const vis = p.visuals.filter((v) => v.use).slice(0, 20).map((v) => `${v.id} · ${v.kind} · ${v.description || v.origin}`).join('\n');
    const facts = p.facts.filter((f) => f.approved).slice(0, 30).map((f) => `- ${f.statement}`).join('\n');
    const sys = `You are a world-class short-form video editor and explainer animator. You cut founder talks, podcasts and interviews into tight, high-retention shorts for LinkedIn and Instagram, and design a custom animated illustration for every beat (like the best explainer channels). Rules:
1. Keep the speaker's real words only — you choose WHAT to keep (whole clauses, in order), never rewrite what they said.
2. Target about ${target} seconds of kept speech (±15%). Open on the strongest hook line if it's not first (you may start mid-talk). End on a complete thought or call to action.
3. Each beat = one idea, ~1.8-5 seconds. Headlines are 1-3 words that NAME the idea (not a transcript). One accent word per headline.
4. Illustrations must depict what is said at that moment. Numbers in any illustration MUST be numbers the speaker says (or listed facts). Never invent customers, results or figures — when you need generic shapes (bars, folders, people), use counts and highlights, not fake labelled data.
5. Use the product/company name only as the speaker says it or from the facts.
6. Headlines in sentence case ("When they leave", not "When They Leave"); the accent must be one of the headline's words, exactly.
${TOOLKIT_SPEC}`;
    const planPrompt = `Brand: ${p.intake.brandName || ''} · Product: ${p.intake.productName || ''}\nSpeaker: ${p.talk.speaker.name || 'unknown'} ${p.talk.speaker.role ? '(' + p.talk.speaker.role + ')' : ''}\nAudience: ${p.intake.audience || ''}\n${instruction || p.talk.instruction ? `EDITOR'S NOTE FROM THE CUSTOMER: ${instruction || p.talk.instruction}\n` : ''}\nVISUALS AVAILABLE (for image/brand kinds):\n${vis || '—'}\n\nOTHER FACTS:\n${facts || '—'}\n\nTRANSCRIPT (word index ranges [from-to], start time, speaker) — total ${fmtDur(media.duration)}, TARGET ${target}s:\n${sents.map((s) => `[${s.from}-${s.to}] (${fmtT(s.s)}, ${(s.e - s.s).toFixed(1)}s${s.sp && media.speakers.length > 1 ? ' ' + s.sp : ''}) ${s.text}`).join('\n')}\n\nCall record_edit.`;
    out = await callTool<any>({ model: config.creativeModel, maxTokens: 12000, system: sys, tool: PLAN_TOOL, content: [{ type: 'text', text: planPrompt }] });
    // hard length discipline: send the edit back until it fits the target
    for (let k = 0; k < 2; k++) {
      const secs = keptSeconds(out, words);
      const long = (out.beats || []).filter((b: any) => { const a = words[Math.round(b.from)], z = words[Math.round(b.to)]; return a && z && z.e - a.s > 6.5; });
      if (secs <= target * 1.2 && !long.length) break;
      const fix = [secs > target * 1.2 ? `It kept ${Math.round(secs)} seconds — far over the ${target}s target. Cut it to ${Math.round(target * 0.9)}-${Math.round(target * 1.1)}s of kept speech: drop whole sentences/clauses (keep the hook, the core idea and the ending).` : '',
        long.length ? `These beats are too long for one illustration (max ~5s): ${long.map((b: any) => `"${b.headline}" [${b.from}-${b.to}]`).join(', ')}. Split each into 2-3 beats, each with its own headline and illustration (they can build on each other).` : ''].filter(Boolean).join(' ');
      log(secs > target * 1.2 ? `That cut runs ${Math.round(secs)}s, tightening to ~${target}s…` : 'Splitting long beats so every illustration lands…');
      out = await callTool<any>({ model: config.creativeModel, maxTokens: 12000, system: sys, tool: PLAN_TOOL,
        content: [{ type: 'text', text: `${planPrompt}\n\nYOUR PREVIOUS EDIT: ${JSON.stringify({ keep: out.keep, beats: (out.beats || []).map((b: any) => ({ from: b.from, to: b.to, headline: b.headline, kind: b.visual?.kind })) })}\nPROBLEMS: ${fix}\nReturn the corrected full edit.` }] });
    }
  } else {
    log('No ANTHROPIC_API_KEY: using the rule-based editor (keeps the opening, one beat per sentence)');
    out = heuristicPlan(sents, words, target);
  }
  applyPlan(pid, out, words, media);
  const issues = guardTalk(pid);
  const fp = getProject(pid);
  log(`Edit ready: ${fp.talk.beats.length} beats, ${fp.talk.duration.toFixed(1)}s${issues ? ` (${issues} unverified number${issues > 1 ? 's' : ''} removed)` : ''}`);
}

/** Seconds of speech an edit keeps (before pause trimming). */
function keptSeconds(out: any, words: W[]) {
  let t = 0; for (const k of out?.keep || []) { const a = words[Math.max(0, Math.round(k.from))], b = words[Math.min(words.length - 1, Math.round(k.to))]; if (a && b && b.e > a.s) t += b.e - a.s; } return t;
}

function heuristicPlan(sents: ReturnType<typeof sentences>, words: W[], target: number) {
  const stop = new Set('the a an and or but of to in on for with is are was were be been it this that these those you your our we i they them there here what which who how why when so if as at by from just like really very can will would about into than then also more most some any all one first second third'.split(' '));
  const keep: any[] = []; const beats: any[] = []; let tot = 0;
  for (const s of sents) { if (tot > target) break; keep.push({ from: s.from, to: s.to }); tot += s.e - s.s;
    const ws = words.slice(s.from, s.to + 1).map((w) => w.w.replace(/[^\w'-]/g, '')).filter((w) => w && !stop.has(w.toLowerCase()));
    const key = [...ws].sort((a, b) => b.length - a.length).slice(0, 2); const head = ws.filter((w) => key.includes(w)).slice(0, 2);
    beats.push({ from: s.from, to: s.to, headline: head.join(' ') || 'Listen', accent: key[0] || '', sub: '', visual: { kind: 'quote', text: s.text.split(' ').slice(0, 14).join(' '), highlight: key } }); }
  return { title: 'Talk', label: '', keep, beats };
}

/** Convert the model's word-index edit into source segments + output-timeline beats and captions. */
export function applyPlan(pid: string, out: any, words: W[], media: Media) {
  const n = words.length; const ci = (x: any) => Math.max(0, Math.min(n - 1, Math.round(Number(x) || 0)));
  const ranges = (out.keep || []).map((k: any) => [ci(k.from), ci(k.to)]).filter(([a, b]: number[]) => b >= a).sort((x: number[], y: number[]) => x[0] - y[0]);
  const kept = new Set<number>(); for (const [a, b] of ranges) for (let i = a; i <= b; i++) kept.add(i);
  const idx = [...kept].sort((a, b) => a - b);
  // segments: contiguous kept words; split at long internal pauses so dead air is trimmed
  const segs: { mid: string; start: number; end: number; first: number; last: number }[] = [];
  for (const i of idx) {
    const cur = segs[segs.length - 1];
    if (cur && i === cur.last + 1 && words[i].s - words[cur.last].e < 0.55) { cur.last = i; cur.end = words[i].e + 0.1; }
    else segs.push({ mid: media.id, start: Math.max(0, words[i].s - 0.08, cur && i === cur.last + 1 ? words[cur.last].e + 0.02 : 0), end: words[i].e + 0.1, first: i, last: i });
  }
  for (let k = 0; k < segs.length - 1; k++) if (segs[k].end > segs[k + 1].start && segs[k].mid === segs[k + 1].mid) segs[k].end = segs[k + 1].start;
  let off = 0; const map = new Map<number, { s: number; e: number }>();
  for (const sg of segs) { for (let i = sg.first; i <= sg.last; i++) map.set(i, { s: off + Math.max(0, words[i].s - sg.start), e: off + Math.max(0, words[i].e - sg.start) }); off += sg.end - sg.start; }
  const duration = off;
  const beats: Beat[] = (out.beats || []).map((b: any) => ({ ...b, from: ci(b.from), to: ci(b.to) })).filter((b: any) => b.to >= b.from).sort((a: any, b: any) => a.from - b.from)
    .map((b: any) => { const ks = idx.filter((i) => i >= b.from && i <= b.to); if (!ks.length) return null; return { id: 'b' + newId().slice(0, 6), from: b.from, to: b.to, start: map.get(ks[0])!.s, end: map.get(ks[ks.length - 1])!.e, headline: String(b.headline || '').slice(0, 40), accent: b.accent, sub: b.sub ? String(b.sub).slice(0, 60) : undefined, visual: sanitizeVisual(b.visual), facts: [] } as Beat; })
    .filter(Boolean) as Beat[];
  // Title Case → sentence case, keeping words the speaker's transcript capitalises mid-sentence (names, products)
  const proper = new Set(words.filter((w, i) => i > 0 && /^[A-Z]/.test(w.w) && !/[.!?]$/.test(words[i - 1].w)).map((w) => w.w.replace(/[^\w'-]/g, '')));
  for (const b of beats) { const ws = b.headline.split(' '); if (ws.length > 1 && ws.every((w) => /^[A-Z&]/.test(w))) b.headline = ws.map((w, i) => (i === 0 || proper.has(w.replace(/[^\w'-]/g, '')) || /^[A-Z0-9&]{2,}$/.test(w) ? w : w.toLowerCase())).join(' '); }
  if (!beats.length && duration) beats.push({ id: 'b0', start: 0, end: duration, headline: 'Listen', accent: 'Listen', visual: { kind: 'quote', text: '' }, facts: [] });
  updateProject(pid, (p) => {
    p.talk.segments = segs.map(({ mid, start, end }) => ({ mid, start: +start.toFixed(3), end: +end.toFixed(3) }));
    p.talk.beats = beats; p.talk.duration = +duration.toFixed(3);
    if (out.label) p.talk.label = String(out.label).slice(0, 40);
    if (out.title) p.talk.title = String(out.title).slice(0, 80);
    if (out.speaker?.name && !p.talk.speaker.name && !/unknown|unnamed|^(the )?(founder|speaker|host|guest)$/i.test(out.speaker.name)) p.talk.speaker = { name: out.speaker.name, role: out.speaker.role || '' };
    p.talk.planHash = crypto.createHash('sha1').update(JSON.stringify(p.talk.segments)).digest('hex').slice(0, 10);
    p.talk.mix = undefined; p.stage = 'storyboard'; p.scenes = [];
  });
  const cw = idx.map((i) => ({ w: words[i].w, ...map.get(i)! }));
  updateProject(pid, (p) => { p.talk.captions = groupCaptions(cw); });
}

function sanitizeVisual(v: any) {
  const kind = TOOLKIT_KINDS.includes(v?.kind) ? v.kind : 'quote';
  return { ...(v || {}), kind };
}

/** Talk fact guard: every number in a beat must be spoken in the kept transcript (or be an approved fact). */
export function guardTalk(pid: string): number {
  const p = getProject(pid); const m = p.talk.media[0]; if (!m) return 0;
  const spoken = new Set(numbersIn(loadWords(pid, m).map((w) => w.w).join(' ')));
  const ok = allowedNumbers(p); let bad = 0;
  updateProject(pid, (pp) => {
    pp.talk.beats = pp.talk.beats.map((b) => {
      const v = b.visual || {};
      const txt = [b.headline, b.sub, JSON.stringify({ ...v, values: undefined, count: undefined, cols: undefined, highlight: undefined, leaving: undefined, people: undefined, from: v.kind === 'meter' && v.showValue !== false ? v.from : undefined, to: v.kind === 'meter' && v.showValue !== false ? v.to : undefined })].join(' ');
      const nums = numbersIn(txt).filter((x) => !spoken.has(x) && !ok.has(x) && !['0', '100', '1', '2', '3', '01', '02', '03', '04'].includes(x));
      if (!nums.length) return b;
      bad += nums.length;
      return { ...b, visual: { kind: 'quote', text: '', highlight: [] }, sub: b.sub && numbersIn(b.sub).some((x) => nums.includes(x)) ? undefined : b.sub };
    });
  });
  return bad;
}

/** Ask Claude where the speaker's face is in a frame (normalised), so crops keep them centred. */
async function detectFace(pid: string, m: Media) {
  if (!config.anthropicKey || !m.poster) return;
  const out = await callTool<any>({ model: config.model, maxTokens: 300, system: 'You locate the main speaker\'s face in a video frame.', tool: { name: 'face', description: 'Face centre, normalised 0-1', input_schema: { type: 'object', required: ['x', 'y'], properties: { x: { type: 'number' }, y: { type: 'number' } } } },
    content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(projectPath(pid, m.poster)).toString('base64') } }, { type: 'text', text: 'Where is the centre of the speaker\'s face? Return x,y in 0-1.' }] });
  if (out && out.x >= 0 && out.x <= 1 && out.y >= 0 && out.y <= 1) updateProject(pid, (p) => { const mm = p.talk.media.find((x) => x.id === m.id); if (mm) mm.face = { x: out.x, y: out.y }; });
}

// ───────────────────────── revise one beat ─────────────────────────
export async function reviseBeat(pid: string, index: number, instruction: string) {
  const p = getProject(pid); const b = p.talk.beats[index]; if (!b) throw new Error('No such beat');
  if (!config.anthropicKey) throw new Error('Revising needs ANTHROPIC_API_KEY.');
  const words = loadWords(pid, p.talk.media[0]);
  const said = words.slice(b.from ?? 0, (b.to ?? 0) + 1).map((w) => w.w).join(' ');
  const out = await callTool<any>({ model: config.creativeModel, maxTokens: 2500, system: `You are the explainer animator. Redesign ONE beat's headline/accent/sub/illustration per the instruction. Numbers only if spoken.\n${TOOLKIT_SPEC}`,
    tool: { name: 'record_beat', description: 'the revised beat', input_schema: { type: 'object', required: ['headline', 'accent', 'visual'], properties: { headline: { type: 'string' }, accent: { type: 'string' }, sub: { type: 'string' }, visual: { type: 'object' } } } },
    content: [{ type: 'text', text: `The speaker says during this beat: "${said}"\nCurrent: ${JSON.stringify({ headline: b.headline, accent: b.accent, sub: b.sub, visual: b.visual })}\nInstruction: ${instruction}` }] });
  updateProject(pid, (pp) => { const x = pp.talk.beats[index]; if (x) Object.assign(x, { headline: String(out.headline || x.headline).slice(0, 40), accent: out.accent || x.accent, sub: out.sub, visual: sanitizeVisual(out.visual) }); });
  guardTalk(pid);
}

// ───────────────────────── cut, mix, proxy ─────────────────────────
function cropFor(m: Media, outW: number, outH: number) {
  const A = outW / outH; const sw = m.w || 1920, sh = m.h || 1080; const fx = m.face?.x ?? 0.5, fy = m.face?.y ?? 0.4;
  if (sw / sh > A) { const cw = even(sh * A); const x = Math.round(Math.max(0, Math.min(sw - cw, fx * sw - cw / 2))); return `crop=${cw}:${sh}:${x}:0`; }
  const ch = even(sw / A); const y = Math.round(Math.max(0, Math.min(sh - ch, fy * sh - ch * 0.42))); return `crop=${sw}:${ch}:0:${y}`;
}

function cutFilter(p: Project, outW: number, outH: number, withVideo: boolean, accent: string) {
  const mids = [...new Set(p.talk.segments.map((s) => s.mid))]; const inputs = mids.map((id) => p.talk.media.find((m) => m.id === id)!);
  const parts: string[] = []; const vl: string[] = [], al: string[] = [];
  p.talk.segments.forEach((sg, i) => {
    const k = mids.indexOf(sg.mid); const m = inputs[k]; const d = sg.end - sg.start;
    if (withVideo && m.hasVideo) { parts.push(`[${k}:v]trim=start=${sg.start}:end=${sg.end},setpts=PTS-STARTPTS,${cropFor(m, outW, outH)},scale=${outW}:${outH},setsar=1,fps=${FPS}[v${i}]`); vl.push(`[v${i}]`); }
    parts.push(`[${k}:a]atrim=start=${sg.start}:end=${sg.end},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, d - 0.03).toFixed(3)}:d=0.03[a${i}]`); al.push(`[a${i}]`);
  });
  const n = p.talk.segments.length; const hasV = withVideo && inputs.every((m) => m.hasVideo);
  if (hasV) parts.push(`${p.talk.segments.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${n}:v=1:a=1[vout][aout]`);
  else {
    parts.push(`${al.join('')}concat=n=${n}:v=0:a=1[aout0]`);
    if (withVideo) { parts.push(`[aout0]asplit[aout][aw]`, `[aw]showwaves=s=${outW}x${even(outH * 0.4)}:mode=cline:rate=${FPS}:colors=${accent.replace('#', '0x')}[wv]`, `color=c=0x141210:s=${outW}x${outH}:r=${FPS}[bg]`, `[bg][wv]overlay=0:(H-h)/2:shortest=1[vout]`); }
    else parts.push(`[aout0]anull[aout]`);
  }
  if (withVideo) parts.push('[aout]anullsink');
  return { inputs, graph: parts.join(';'), hasV };
}

const talkKey = (p: Project, extra: string) => crypto.createHash('sha1').update(JSON.stringify([p.talk.segments, p.talk.media.map((m) => [m.id, m.face]), extra])).digest('hex').slice(0, 10);

/** The cut's audio (voice only) as a 48k wav. */
async function cutAudio(pid: string) {
  const p = getProject(pid); const key = talkKey(p, 'a');
  const out = `talk/voice-${key}.wav`; if (fs.existsSync(projectPath(pid, out))) return out;
  const { inputs, graph } = cutFilter(p, 2, 2, false, '#000');
  await ffmpeg([...inputs.flatMap((m) => ['-i', projectPath(pid, m.file)]), '-filter_complex', graph, '-map', '[aout]', '-ac', '1', '-ar', String(SR), projectPath(pid, out)]);
  return out;
}

/** Voice + a quiet generated bed + soft beat ticks, ducked under the voice. */
export async function talkMix(pid: string, log: Log) {
  let p = getProject(pid);
  const L = talkLayout(toComposition(p) as any);
  const key = talkKey(p, JSON.stringify([p.talk.music, p.style, L.cues.length, 'm2']));
  const out = `talk/mix-${key}.wav`;
  if (p.talk.mix === out && fs.existsSync(projectPath(pid, out))) return out;
  log('Cutting the voice…');
  const voice = await cutAudio(pid);
  const pcm = await decodeAudio(projectPath(pid, voice), SR);
  log(p.talk.music === 'none' ? 'Mixing voice…' : `Scoring a ${p.talk.music} bed under the voice…`);
  const S = resolveStyle(p.style || {}, p.intake.accent);
  const music = p.talk.music === 'none' ? false : { genre: p.talk.music || S.music.genre, bpm: Math.min(96, S.music.bpm), key: S.music.key };
  const mixed = score({ duration: L.duration, revealAt: 0, endAt: L.duration, cues: L.cues as any, vo: [{ t: 0, pcm }], music, seed: 7, voPresence: 0.05, musicGain: 0.55 } as any);
  fs.writeFileSync(projectPath(pid, out), wav(mixed.L, mixed.R));
  updateProject(pid, (pp) => { pp.talk.mix = out; });
  return out;
}

/** Cut + crop the speaker to exactly the speaker box of a format/layout. Proxy = half size with the mix, for preview. */
export async function buildCut(pid: string, fmt: FormatId, quality: 'proxy' | 'full', log: Log) {
  const p = getProject(pid); const lay = p.talk.layout || 'split';
  const box = speakerBox(fmt, lay); const q = quality === 'proxy' ? 0.5 : 1; const W = even(box.w * q), H = even(box.h * q);
  const key = talkKey(p, [fmt, lay, quality].join('|'));
  const out = `talk/${quality}-${fmt}-${lay}-${key}.mp4`;
  if (fs.existsSync(projectPath(pid, out))) return out;
  const S = resolveStyle(p.style || {}, p.intake.accent);
  const { inputs, graph } = cutFilter(p, W, H, true, S.palette.accent);
  log(`Cutting the speaker (${fmt.replace('x', ':')}, ${quality})…`);
  const args = [...inputs.flatMap((m) => ['-i', projectPath(pid, m.file)])];
  if (quality === 'proxy') {
    const mix = await talkMix(pid, log);
    args.push('-i', projectPath(pid, mix), '-filter_complex', graph, '-map', '[vout]', '-map', `${inputs.length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', projectPath(pid, out));
  } else args.push('-filter_complex', graph, '-map', '[vout]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', projectPath(pid, out));
  await ffmpeg(args);
  if (quality === 'proxy') updateProject(pid, (pp) => { pp.talk.proxies = { ...pp.talk.proxies, [`${fmt}:${lay}`]: out }; });
  return out;
}

export async function buildProxies(pid: string, log: Log) {
  const p = getProject(pid);
  for (const f of p.intake.formats) await buildCut(pid, f, 'proxy', log);
}

// ───────────────────────── final render ─────────────────────────
export async function renderTalk(pid: string, formats: FormatId[], log: Log) {
  let p = getProject(pid);
  if (!p.talk.beats.length) throw new Error('There is no edit yet.');
  const mix = await talkMix(pid, log);
  p = getProject(pid);
  const comp = toComposition(p);
  const L = talkLayout(comp as any);
  const total = Math.ceil(L.duration * FPS);
  const workers = config.workers || Math.max(1, Math.min(5, Math.floor(os.cpus().length / 2)));
  const outs: RenderOut[] = []; const name = slug(p.talk.speaker.name || p.intake.productName || p.name);
  const tmp = projectPath(pid, `renders/.tmp-${newId().slice(0, 6)}`); fs.mkdirSync(tmp, { recursive: true });
  const srv = await staticServer(pid); const browser = await launchBrowser();
  try {
    for (const [fi, fmt] of formats.entries()) {
      const cut = await buildCut(pid, fmt, 'full', log);
      const dims = FORMATS[fmt]; const box = speakerBox(fmt, p.talk.layout);
      const chunk = Math.ceil(total / workers); let done = 0; const base = (fi / formats.length) * 100;
      log(`Rendering ${fmt.replace('x', ':')} on ${workers} workers…`, base + 5);
      await Promise.all(Array.from({ length: workers }, async (_, w) => {
        const a = w * chunk, b = Math.min(total, a + chunk); if (a >= b) return;
        const page = await browser.newPage({ viewport: { width: dims.w, height: dims.h } });
        page.on('pageerror', (e) => console.error('[talk]', e.message));
        await page.addInitScript((c) => { (window as any).__COMP__ = c; }, comp);
        await page.goto(`${srv.base}/engine/player.html?render=1&format=${fmt}&assetBase=/p/`);
        await page.waitForFunction(() => (window as any).ready, null, { timeout: 60000 }); await page.evaluate(() => (window as any).ready);
        const ch = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y',
          '-f', 'lavfi', '-i', `color=c=black:s=${dims.w}x${dims.h}:r=${FPS}`,
          '-ss', (a / FPS).toFixed(4), '-i', projectPath(pid, cut),
          '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
          '-filter_complex', `[1:v]setpts=PTS-STARTPTS[sp];[0:v][sp]overlay=${box.x}:${box.y}:eof_action=pass[b];[b][2:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
          '-map', '[v]', '-frames:v', String(b - a), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-r', String(FPS), path.join(tmp, `${fmt}-${String(w).padStart(2, '0')}.mp4`)], { stdio: ['pipe', 'ignore', 'pipe'] });
        let err = ''; ch.stderr.on('data', (d) => (err += d));
        const closed = new Promise<void>((res, rej) => ch.on('close', (c) => (c === 0 ? res() : rej(new Error('compositor: ' + err.slice(-400))))));
        for (let f = a; f < b; f++) {
          await page.evaluate((t) => (window as any).render(t), f / FPS);
          const png = await page.screenshot({ type: 'png', omitBackground: true });
          if (!ch.stdin.write(png)) await new Promise((r) => ch.stdin.once('drain', r));
          done++; if (done % 15 === 0) log(`${fmt}: frame ${done}/${total}`, base + 5 + (done / total) * (85 / formats.length));
        }
        ch.stdin.end(); await closed; await page.close();
      }));
      const list = path.join(tmp, `${fmt}.txt`);
      fs.writeFileSync(list, fs.readdirSync(tmp).filter((f) => f.startsWith(fmt + '-') && f.endsWith('.mp4')).sort().map((f) => `file '${path.join(tmp, f)}'`).join('\n'));
      const silent = path.join(tmp, `${fmt}-video.mp4`);
      await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
      const rel = `renders/${name}_talk_${L.duration.toFixed(0)}s_${fmt}.mp4`;
      log(`Mixing audio into ${fmt}…`, base + 95 / formats.length);
      await ffmpeg(['-i', silent, '-i', projectPath(pid, mix), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-t', L.duration.toFixed(3), projectPath(pid, rel)]);
      outs.push({ id: 'r' + newId().slice(0, 6), format: fmt, file: rel, at: new Date().toISOString(), duration: L.duration, bytes: fs.statSync(projectPath(pid, rel)).size, srt: `renders/${name}_talk.srt` });
    }
  } finally { await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  fs.writeFileSync(projectPath(pid, `renders/${name}_talk.srt`), talkSrt(pid));
  updateProject(pid, (pp) => { pp.renders = [...outs, ...pp.renders.filter((r) => !outs.some((o) => o.file === r.file))]; pp.stage = 'done'; });
  log(`Done: ${outs.map((o) => o.format).join(', ')}`, 100);
  return outs;
}

function groupCaptions(ws: { w: string; s: number; e: number }[]) {
  const out: { start: number; end: number; words: { w: string; t: number }[] }[] = []; let cur: any = null;
  ws.forEach((w, i) => { if (!cur || cur.words.length >= 5 || /[.!?,]$/.test(ws[i - 1]?.w || '') || w.s - cur.end > 0.5) { cur = { start: w.s, end: w.e, words: [] }; out.push(cur); } cur.words.push({ w: w.w, t: w.s }); cur.end = w.e; });
  return out;
}
function talkSrt(pid: string) {
  const ts = (x: number) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  return (getProject(pid).talk.captions as any[]).map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end + 0.2)}\n${c.words.map((w: any) => w.w).join(' ')}\n`).join('\n');
}
