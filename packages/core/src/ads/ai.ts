// AI layer (Anthropic Claude): analyse sources → facts/visuals/questions; write brief + storyboard;
// revise a single scene. Every call uses a forced tool so output is structured JSON.
// Without an API key, deterministic fallbacks keep the product usable (lower quality, still fact-safe).
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@truecut/config';
import { corpus, getProject, newId, projectPath, updateProject } from '@truecut/db';
import { toJpeg } from '../render/media';
import { verifyFact, numbersIn, checkScenes } from '@truecut/shared/facts';
import type { Fact, Project, Question, Scene, Visual } from '@truecut/shared/types';
import { SCENE_TYPES } from '@truecut/engine/timeline.js';

type Log = (msg: string, pct?: number) => void;

export const SCENE_SPEC = `
Scene library (type → props). Strings are short. All numbers MUST come from approved facts.
- stat: { kicker: "SOURCE · CONTEXT label", value: integer, label: "what the number counts", chips: [{value: integer, label}] (0-3), source: "where it came from", rows?: [{title, meta, status}] (0-2 real records shown faintly behind) }
- headline: { lines: ["≤22 chars", ...] (1-3 lines), image?: visualId (screenshot shown tilted behind), markerLabel?: "idea" }
- bars: { kicker, value: integer, barsLabel: "Grouped by …", bars: [{label, value: number}] (1-4), tagline: "≤26 chars" }
- reveal: { image?: visualId (character/product/logo), shape?: "circle"|"square", title: "Meet X." , highlight: "word to colour", subtitle: "≤34 chars", orbit: ["3-5 short verbs/phrases about what it does"] }
- card: { kicker, tag?, title: "a real record title", pills: [{label, tone: "good"|"accent"|"warn"|"neutral"}] (0-3), body?, note?, meta?: [{label, value}] (0-3), gauge?: {value, max, label}, image?: visualId }
- wall: { kicker, items: [{title, meta, status, tag?}] (4-9 real items), featured: {title, meta, tag?} }
- selector: { title, groupLabel, options: ["2-4 options"], selected: index, note, checksLabel?, checksTotal?, checks?: [{label, on: boolean}], listTitle?, listMeta?, list?: [{title, meta}] (0-5) }
- document: { tabs?: [..], meta, badgeBefore, badgeAfter, title, lines: ["1-3 real lines that type out"], highlights?: ["words in lines to colour"], chip?: {label}, chipsLabel?, chips?: [..], image?: visualId }
- action: { button: "Approve", done: "Approved", label: "what happened", images: [visualId] (0-3) }
- quote: { context: "Call · Acme × Globex", speaker: "Name, Role", time?: "14:32", quote: "VERBATIM line from a source", before?: {speaker, time, text} }
- screen: { image: visualId (REQUIRED), kicker, title: "≤34 chars", focus?: {x,y,w,h} normalised 0-1 region to zoom into, callout: "≤40 chars label for that region" }
- kinetic: { words: ["2-6 short phrases, 1-3 words each, slammed one per beat"], kicker?: "small label" }
- split: { image: visualId (REQUIRED), kicker, title: "≤34 chars", body?: "≤90 chars" }
- list: { kicker?, title: "≤30 chars", items: ["3-5 items, ≤28 chars each"] | [{title, meta}], marker?: "number"|"check"|"dot" }
- compare: { kicker?, left: {label: "Before/old way", items: ["≤4 short items"]}, right: {label: "With <product>", items: ["≤4 short items"]} }
- end: { image?: visualId, shape?, wordmark: "product name", tagline: "≤40 chars", cta: "button text", url?: "domain", byline?: "by Company" }
Durations are automatic (from the voice line). Scene type guidance:
${Object.entries(SCENE_TYPES).map(([k, v]: any) => `  · ${k} — ${v.desc}`).join('\n')}
`;

const RULES = `
Creative rules (non-negotiable):
1. NO FAKE DATA. A 'stat' or 'bars' scene needs a real positive number from an approved fact — if the sources have no strong number, open with a headline, quote or screen instead. Every number, name, title, quote and claim on screen or in the voice must come from the approved facts or the source text. Never invent metrics, customers, testimonials, results or prices. If you lack a number, use words, not a made-up figure. List the fact ids each scene uses in "facts".
2. Problem before product: open on a hook built from a real number or a sharp real line; land the pain; THEN the reveal (once, roughly 25-40% in), then show how it works with real records, then the end card (always last).
3. One spoken line per scene, usually 4-9 words (never more than 12), conversational, written for the ear. Numbers as digits (the voice engine reads them). Caption = the same line unless digits help (caption optional).
4. Show, don't list features: each "how it works" scene shows ONE real artefact (a record, a document, a screen region) from the sources/visuals.
5. Use the real visuals by id. Prefer screenshots for card/document/headline backplates and screen zooms. Never reference a visual id that is not listed.
6b. People & permission: never present placeholder, sample or mock data (names like "Sarah Chen", "Acme", lorem ipsum, fixture records) as real. Do not show real third-party people's names or quotes (clients, prospects, customers) unless the customer's answers explicitly grant permission — the brand's own team and founders are fine.
6. Respect the brand: use the customer's product name, CTA and tone. Do not promise capabilities flagged as risks or not in the facts.
7. Pacing — HARD LIMIT: the voice is read at ~2.7 words/second and every scene adds ~0.8s, so total spoken words across ALL scenes must be ≤ 2.2 × target seconds (30s → ≤ 66 words, 15s → ≤ 33, 45s → ≤ 99). Most lines are 4-9 words; some scenes can be silent (vo: \"\"). 30s → 8-9 scenes, 15s → 5 scenes, 45s → 12 scenes.
8. "status" (optional) is a 2-5 word live status line shown in the HUD after the reveal, e.g. "Scoring 457 ideas".
`;

function client() {
  if (!config.anthropicKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey: config.anthropicKey });
}

export async function callTool<T>(opts: { model: string; system: string; tool: { name: string; description: string; input_schema: any }; content: any[]; maxTokens?: number }): Promise<T> {
  const c = client();
  const msg = await c.messages.create({
    model: opts.model, max_tokens: opts.maxTokens || 12000, system: opts.system,
    tools: [opts.tool as any], tool_choice: { type: 'tool', name: opts.tool.name } as any,
    messages: [{ role: 'user', content: opts.content }],
  });
  const tu: any = msg.content.find((b: any) => b.type === 'tool_use');
  if (!tu) throw new Error('Model did not return structured output');
  return tu.input as T;
}

async function imageBlocks(p: Project, max = 8) {
  const pick = p.visuals.filter((v) => v.use).slice(0, max);
  const blocks: any[] = [];
  for (const v of pick) {
    try {
      const prev = projectPath(p.id, `assets/_ai_${v.id}.jpg`);
      if (!fs.existsSync(prev)) await toJpeg(projectPath(p.id, v.file), prev, 1280, 5);
      blocks.push({ type: 'text', text: `Visual ${v.id} (${v.kind}, ${v.w}x${v.h}, from ${v.origin}):` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(prev).toString('base64') } });
    } catch {}
  }
  return blocks;
}

// ───────────────────────── analyse ─────────────────────────
const ANALYZE_TOOL = {
  name: 'record_analysis',
  description: 'Record what the sources prove about the product, the usable visuals, and the questions to ask the customer.',
  input_schema: {
    type: 'object', required: ['product', 'facts', 'visuals', 'questions'],
    properties: {
      product: { type: 'object', properties: {
        name: { type: 'string' }, company: { type: 'string' }, oneLiner: { type: 'string' }, category: { type: 'string' },
        audience: { type: 'string' }, problem: { type: 'string' }, howItWorks: { type: 'array', items: { type: 'string' } },
        differentiator: { type: 'string' }, suggestedAccent: { type: 'string', description: 'hex brand colour if evident' },
        tone: { type: 'string' }, risks: { type: 'array', items: { type: 'string' }, description: 'claims that look unverified, outdated or roadmap-only' } } },
      facts: { type: 'array', description: '15-40 atomic, checkable facts', items: { type: 'object', required: ['statement', 'quote', 'kind'], properties: {
        statement: { type: 'string', description: 'plain restatement' }, value: { type: ['string', 'number', 'null'] },
        kind: { type: 'string', enum: ['metric', 'feature', 'claim', 'quote', 'example', 'other'] },
        quote: { type: 'string', description: 'EXACT verbatim excerpt copied from the source text (8-200 chars). Must be findable by string search.' },
        sourceId: { type: 'string' }, where: { type: 'string', description: 'page URL or file path' } } } },
      visuals: { type: 'array', items: { type: 'object', required: ['id', 'description'], properties: {
        id: { type: 'string' }, description: { type: 'string' }, bestFor: { type: 'string', description: 'which scene type it suits' },
        focus: { type: ['object', 'null'], properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, description: 'normalised 0-1 box of the most telling region' },
        kind: { type: 'string', enum: ['screenshot', 'image', 'logo', 'avatar'] } } } },
      questions: { type: 'array', description: '3-7 questions only the customer can answer (audience, goal, proof they can share, offer, what to avoid…)', items: { type: 'object', required: ['question'], properties: {
        question: { type: 'string' }, why: { type: 'string' }, suggested: { type: 'string', description: 'best-guess default answer' } } } },
    },
  },
};

export async function analyze(pid: string, log: Log) {
  const p = getProject(pid);
  const text = corpus(p);
  if (!text.trim() && !p.visuals.length) throw new Error('Add at least one source first.');
  let out: any;
  if (config.anthropicKey) {
    log('Reading sources with Claude…', 15);
    const imgs = await imageBlocks(p);
    out = await callTool<any>({
      model: config.model, maxTokens: 16000,
      system: `You are a senior B2B product marketer and a strict fact-checker preparing a motion-graphics video ad. Read the sources and extract only what they actually prove. Ignore mock, sample, fixture and test data — it is not proof. If sources quote named clients or customers, add a question asking whether we have permission to show them. Quotes must be copied character-for-character from the source text so they can be string-matched. Prefer concrete numbers, named features, real records (titles, items, names that appear in screenshots/text) and verbatim customer or founder lines. Describe each visual and where its most telling region is.`,
      tool: ANALYZE_TOOL,
      content: [{ type: 'text', text: `Project: ${p.name}\nVisual ids available: ${p.visuals.map((v) => `${v.id} (${v.kind}, ${v.origin})`).join('; ') || 'none'}\n\nSOURCES:\n${text}` }, ...imgs,
        { type: 'text', text: 'Now call record_analysis. Facts: atomic, quote verbatim. Include metrics shown in screenshots as facts too, with quote = the exact text visible in the screenshot and where = the visual id.' }],
    });
  } else {
    log('No ANTHROPIC_API_KEY — using the rule-based extractor', 15);
    out = heuristicAnalysis(p, text);
  }
  log('Checking every fact against the sources…', 80);
  updateProject(pid, (pp) => {
    const shotText = (out.facts || []).filter((f: any) => pp.visuals.some((v) => v.id === f.where)).map((f: any) => f.quote).join('\n');
    pp.product = out.product || {};
    const keep = pp.facts.filter((f) => f.id.startsWith('u')); // user-added facts survive re-analysis
    pp.facts = [...keep, ...(out.facts || []).map((f: any): Fact => {
      const fact: Fact = { id: 'f' + newId().slice(0, 6), statement: String(f.statement || ''), value: f.value ?? null, kind: f.kind || 'claim', quote: String(f.quote || ''), sourceId: f.sourceId, where: f.where, status: 'needs-check', approved: true };
      const fromShot = pp.visuals.some((v) => v.id === f.where);
      fact.status = fromShot ? 'needs-check' : verifyFact(fact, text);
      if (!fromShot && fact.status !== 'verified') fact.approved = false; // text claims we could not find word-for-word stay out until a human approves them
      if (fromShot && shotText) fact.where = `screenshot ${f.where}`;
      return fact;
    })];
    for (const v of out.visuals || []) { const vv = pp.visuals.find((x) => x.id === v.id); if (vv) { vv.description = v.description; vv.bestFor = v.bestFor; if (v.focus && v.focus.w > 0) vv.focus = v.focus; if (v.kind) vv.kind = v.kind; } }
    const answered = new Map(pp.questions.map((q) => [q.question, q.answer]));
    pp.questions = (out.questions || []).map((q: any): Question => ({ id: 'q' + newId().slice(0, 5), question: q.question, why: q.why || '', suggested: q.suggested || '', answer: answered.get(q.question) || '' }));
    const i = pp.intake; const pr = out.product || {};
    if (!i.productName && pr.name) i.productName = pr.name;
    if (!i.brandName && (pr.company || pr.name)) i.brandName = pr.company || pr.name;
    if (!i.oneLiner && pr.oneLiner) i.oneLiner = pr.oneLiner;
    if (!i.audience && pr.audience) i.audience = pr.audience;
    const meta = pp.sources.find((s) => s.meta?.brandColor || s.meta?.themeColor)?.meta;
    if (i.accent === '#F47920' && (pr.suggestedAccent || meta?.brandColor)) i.accent = (/^#[0-9a-f]{6}$/i.test(pr.suggestedAccent) ? pr.suggestedAccent : meta?.brandColor) || i.accent;
    if (!i.logoVisual) { const lg = pp.visuals.find((v) => v.kind === 'logo'); if (lg) i.logoVisual = lg.id; }
    if (!i.dataLabel) { const d = new Date(); i.dataLabel = `Real data · ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`; }
    pp.stage = 'facts';
  });
  const fin = getProject(pid);
  log(`Found ${fin.facts.length} facts (${fin.facts.filter((f) => f.status === 'verified').length} verified word-for-word, ${fin.facts.filter((f) => !f.approved).length} held back for review) and ${fin.questions.length} questions`, 100);
}

function heuristicAnalysis(p: Project, text: string) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 20 && s.length < 220);
  const isDate = (s: string) => /\b(19|20)\d{2}\b|\d{4}-\d{2}-\d{2}/.test(s);
  const metric = sentences.filter((s) => numbersIn(s).length && !/^##/.test(s) && !isDate(s) && !/[*_#`|]/.test(s)).slice(0, 20);
  const feats = sentences.filter((s) => /\b(automatically|helps|lets you|turns|generates|connect|integrat|in minutes|without)\b/i.test(s)).slice(0, 12);
  const site = p.sources.find((s) => s.meta?.siteName || s.meta?.title)?.meta || {};
  const lead = text.replace(/=====[^\n]*=====/g, '').trim().match(/^([A-Z][\w-]+(?: [A-Z][\w-]+){0,2})\b/);
  const guess = site.siteName || (lead && !/^(The|We|Our|This|It|A|An|In)$/.test(lead[1]) ? lead[1] : '') || (/^Untitled/.test(p.name) ? '' : p.name);
  return {
    product: { name: guess, oneLiner: site.description || '', audience: '', risks: [] },
    facts: [...metric.map((s) => ({ statement: s, value: numbersIn(s)[0] || null, kind: 'metric', quote: s })), ...feats.map((s) => ({ statement: s, kind: 'feature', quote: s }))],
    visuals: p.visuals.map((v) => ({ id: v.id, description: `${v.kind} from ${v.origin}` })),
    questions: [
      { question: 'Who exactly is this video for (role, company size)?', why: 'Sets the hook and the language.', suggested: '' },
      { question: 'What should viewers do after watching?', why: 'Becomes the call-to-action.', suggested: 'Book a demo' },
      { question: 'Which single result or number are you proudest of that we may show?', why: 'A real number makes the strongest hook.', suggested: '' },
      { question: 'Anything we must not say or show?', why: 'Avoids legal/brand issues.', suggested: '' },
    ],
  };
}

// ───────────────────────── storyboard ─────────────────────────
const STORY_TOOL = {
  name: 'record_storyboard',
  description: 'Record the creative brief and the full scene-by-scene storyboard.',
  input_schema: {
    type: 'object', required: ['brief', 'scenes'],
    properties: {
      brief: { type: 'object', properties: { title: { type: 'string' }, concept: { type: 'string' }, insight: { type: 'string' }, audience: { type: 'string' }, proposition: { type: 'string' }, hook: { type: 'string' } } },
      scenes: { type: 'array', items: { type: 'object', required: ['type', 'vo', 'props'], properties: {
        type: { type: 'string', enum: Object.keys(SCENE_TYPES) },
        vo: { type: 'string', description: 'the spoken line (usually 4-9 words; respect the total word budget)' },
        caption: { type: 'string' }, status: { type: 'string' },
        props: { type: 'object' }, facts: { type: 'array', items: { type: 'string' } }, notes: { type: 'string', description: 'why this scene, in one line' } } } },
    },
  },
};

function storyContext(p: Project) {
  const i = p.intake;
  const facts = p.facts.filter((f) => f.approved && f.status !== 'rejected').map((f) => `${f.id} [${f.kind}${f.status === 'verified' ? '' : ', unverified'}] ${f.statement}${f.value != null && f.value !== '' ? ` (value: ${f.value})` : ''} — quote: "${f.quote}"`).join('\n');
  const vis = p.visuals.filter((v) => v.use).map((v) => `${v.id} · ${v.kind} · ${v.w}x${v.h} · ${v.description || v.origin}${v.focus ? ` · focus ${JSON.stringify(v.focus)}` : ''}`).join('\n');
  const qa = p.questions.filter((q) => q.answer || q.suggested).map((q) => `Q: ${q.question}\nA: ${q.answer || q.suggested}`).join('\n');
  const ang = p.angles.find((a) => a.id === p.angleId);
  const angleTxt = ang ? `\nCHOSEN CREATIVE ANGLE (build the whole story around it)\nTitle: ${ang.title}\nHook: ${ang.hook}\nStructure: ${ang.structure}\nWhy: ${ang.why}\n` : '';
  return `${angleTxt}BRAND & BRIEF FROM THE CUSTOMER
Brand: ${i.brandName} · Product: ${i.productName}
One-liner: ${i.oneLiner}
Audience: ${i.audience}
Goal: ${i.goal} · CTA: ${i.cta}${i.ctaUrl ? ' · ' + i.ctaUrl : ''}
Tone: ${i.tone}
Target length: ${i.length}s · Formats: ${i.formats.join(', ')}
Hero/character image: ${i.avatarVisual || 'none'} · Logo: ${i.logoVisual || 'none'}
Must say: ${i.mustSay || '—'}
Must avoid: ${i.mustAvoid || '—'}
Known risks (do not claim): ${(p.product?.risks || []).join('; ') || '—'}
Product understanding: ${JSON.stringify({ problem: p.product?.problem, howItWorks: p.product?.howItWorks, differentiator: p.product?.differentiator })}

CUSTOMER ANSWERS
${qa || '—'}

APPROVED FACTS (the only allowed source of numbers and claims)
${facts || '—'}

VISUALS (use by id)
${vis || '—'}`;
}

export async function storyboard(pid: string, log: Log) {
  const p = getProject(pid);
  let out: any;
  if (config.anthropicKey) {
    log('Writing the brief and storyboard with Claude…', 20);
    out = await callTool<any>({
      model: config.creativeModel, maxTokens: 16000,
      system: `You are an award-winning motion designer and senior B2B marketer. You write 15-45 second motion-graphics ads for LinkedIn and Instagram that feel alive every second, built ONLY from verified product reality. You think like a product manager (one clear proposition), a copywriter (spoken lines that land) and an editor (beats on a 120 BPM grid).\n${RULES}\n${SCENE_SPEC}`,
      tool: STORY_TOOL,
      content: [{ type: 'text', text: storyContext(p) + '\n\nWrite the storyboard now via record_storyboard.' }],
    });
  } else {
    log('No ANTHROPIC_API_KEY — building a template storyboard from the facts', 20);
    out = templateStoryboard(p);
  }
  log('Validating scenes…', 85);
  updateProject(pid, (pp) => {
    pp.brief = { title: '', concept: '', insight: '', audience: '', proposition: '', hook: '', ...(out.brief || {}) };
    pp.scenes = (out.scenes || []).map((s: any): Scene => normalizeScene(pp, s));
    pp.audioFile = undefined; pp.audioHash = undefined;
    pp.stage = 'storyboard';
  });
  if (config.anthropicKey) {
    const bad = checkScenes(getProject(pid)).filter((i) => i.level === 'error' && i.sceneId);
    const ids = [...new Set(bad.map((b) => b.sceneId))];
    for (const [k, sid] of ids.entries()) {
      log(`Fact guard: repairing scene ${k + 1}/${ids.length}…`, 88 + (10 * k) / ids.length);
      const msgs = bad.filter((b) => b.sceneId === sid).map((b) => b.message).join(' ');
      try { await reviseScene(pid, sid, `FACT GUARD FAILED: ${msgs} Rewrite this scene so every number comes from an approved fact (or use no number at all). Keep the scene's role in the story.`); } catch (e: any) { log('Repair failed: ' + e.message); }
    }
  }
  const left = checkScenes(getProject(pid)).filter((i) => i.level === 'error').length;
  { const fp = getProject(pid); const words = fp.scenes.reduce((a, s) => a + (s.vo?.text || '').split(/\s+/).filter(Boolean).length, 0); const budget = Math.round(fp.intake.length * 2.2);
    if (words > budget * 1.15 && config.anthropicKey) { log(`Voice is ${words} words for a ${fp.intake.length}s target — tightening…`, 95); try { await tighten(pid, budget); } catch (e: any) { log('Tightening failed: ' + e.message); } } }
  log(`Storyboard ready: ${(out.scenes || []).length} scenes${left ? ` — ${left} fact issue(s) need you` : ' — every number traced'}`, 100);
}

export function normalizeScene(p: Project, s: any): Scene {
  const type = SCENE_TYPES[s.type as keyof typeof SCENE_TYPES] ? s.type : 'headline';
  const vids = new Set(p.visuals.map((v) => v.id));
  const props = { ...(s.props || {}) };
  if (props.image && !vids.has(props.image)) delete props.image;
  if (Array.isArray(props.images)) props.images = props.images.filter((x: string) => vids.has(x));
  if (type === 'screen' && !props.image) { const v = p.visuals.find((x) => x.use && x.kind === 'screenshot'); if (v) { props.image = v.id; if (!props.focus && v.focus) props.focus = v.focus; } }
  if (type === 'screen' && props.image) { const v = p.visuals.find((x) => x.id === props.image); if (v && v.w) props.aspect = Math.min(0.75, Math.max(0.45, v.h / v.w)); }
  if ((type === 'reveal' || type === 'end') && !props.image && p.intake.avatarVisual) props.image = p.intake.avatarVisual;
  let t2 = type;
  if ((type === 'stat' || type === 'bars') && !(Number(props.value) > 0)) { t2 = 'headline'; props.lines = props.lines || splitLines(String(props.label || props.kicker || (typeof s.vo === 'string' ? s.vo : s.vo?.text) || '')); }
  for (const k of ['image']) { const v = p.visuals.find((x) => x.id === props[k]); if (v && v.kind === 'logo' && (t2 === 'reveal' || t2 === 'end')) { props.logo = true; props.shape = 'square'; } }
  const vo = typeof s.vo === 'string' ? { text: s.vo } : s.vo?.text ? { text: s.vo.text } : undefined;
  return { id: s.id || 'sc' + newId().slice(0, 6), type: t2 as Scene['type'], vo, caption: s.caption || undefined, status: s.status || undefined, duration: s.duration || undefined, props, facts: Array.isArray(s.facts) ? s.facts : [], notes: s.notes };
}

export function splitLines(t: string, max = 20) {
  return t.split(/\s+/).filter(Boolean).reduce((acc: string[], w) => { const l = acc[acc.length - 1]; if (l && (l + ' ' + w).length <= max) acc[acc.length - 1] = l + ' ' + w; else acc.push(w); return acc; }, []).slice(0, 3);
}

function templateStoryboard(p: Project) {
  const i = p.intake; const facts = p.facts.filter((f) => f.approved);
  const metric = facts.find((f) => f.kind === 'metric' && Number.isFinite(Number(String(f.value).replace(/[,%]/g, ''))));
  const shots = p.visuals.filter((v) => v.use && v.kind === 'screenshot');
  const feats = facts.filter((f) => f.kind === 'feature').slice(0, 2);
  const scenes: any[] = [];
  if (metric) scenes.push({ type: 'stat', vo: metric.statement.slice(0, 90), props: { kicker: i.brandName, value: Math.round(Number(String(metric.value).replace(/[,%]/g, ''))), label: metric.statement.slice(0, 40), source: metric.where || '' }, facts: [metric.id] });
  scenes.push({ type: 'headline', vo: i.oneLiner || `${i.productName} changes how you work.`, props: { lines: (i.oneLiner || i.productName).split(' ').reduce((acc: string[], w) => { const l = acc[acc.length - 1]; if (l && (l + ' ' + w).length <= 20) acc[acc.length - 1] = l + ' ' + w; else acc.push(w); return acc; }, []).slice(0, 3), image: shots[0]?.id } });
  scenes.push({ type: 'reveal', vo: `Meet ${i.productName}.`, props: { image: i.avatarVisual || i.logoVisual || undefined, title: `Meet ${i.productName}.`, highlight: `${i.productName}.`, subtitle: (i.oneLiner || '').slice(0, 34), orbit: feats.map((f) => f.statement.slice(0, 28)) } });
  shots.slice(0, 3).forEach((v, k) => scenes.push({ type: 'screen', vo: feats[k]?.statement.slice(0, 80) || `See it in action.`, props: { image: v.id, kicker: i.productName, title: (feats[k]?.statement || v.description || '').slice(0, 34), focus: v.focus || null, callout: (v.description || '').slice(0, 40) }, facts: feats[k] ? [feats[k].id] : [] }));
  scenes.push({ type: 'end', vo: `${i.productName}. ${i.cta}.`, props: { image: i.avatarVisual || i.logoVisual || undefined, wordmark: i.productName, tagline: (i.oneLiner || '').slice(0, 40), cta: i.cta, url: i.ctaUrl, byline: i.byline } });
  return { brief: { title: `${i.productName} — ${i.length}s ad`, concept: 'Template storyboard (no AI key configured).', hook: scenes[0].vo }, scenes };
}

// ───────────────────────── revise one scene ─────────────────────────
export async function reviseScene(pid: string, sceneId: string, instruction: string) {
  const p = getProject(pid);
  const sc = p.scenes.find((s) => s.id === sceneId);
  if (!sc) throw new Error('Scene not found');
  if (!config.anthropicKey) throw new Error('Revising with AI needs ANTHROPIC_API_KEY.');
  const out = await callTool<any>({
    model: config.creativeModel, maxTokens: 4000,
    system: `You are the motion designer on this ad. Revise ONE scene per the instruction. Keep the scene type unless the instruction asks to change it.\n${RULES}\n${SCENE_SPEC}`,
    tool: { name: 'record_scene', description: 'The revised scene', input_schema: STORY_TOOL.input_schema.properties.scenes.items },
    content: [{ type: 'text', text: `${storyContext(p)}\n\nFULL STORYBOARD (for context):\n${p.scenes.map((s, k) => `${k + 1}. [${s.type}] ${s.vo?.text || ''}`).join('\n')}\n\nSCENE TO REVISE:\n${JSON.stringify({ type: sc.type, vo: sc.vo?.text, caption: sc.caption, status: sc.status, props: sc.props, facts: sc.facts })}\n\nINSTRUCTION: ${instruction}` }],
  });
  updateProject(pid, (pp) => {
    const k = pp.scenes.findIndex((s) => s.id === sceneId);
    if (k >= 0) { const n = normalizeScene(pp, { ...out, id: sceneId }); if (n.vo && sc.vo && n.vo.text === sc.vo.text) n.vo = sc.vo; pp.scenes[k] = n; }
  });
}

/** Shortens voice lines to fit the word budget for the target length (one Claude call). */
async function tighten(pid: string, budget: number) {
  const p = getProject(pid);
  const out = await callTool<any>({
    model: config.creativeModel, maxTokens: 3000,
    system: `You are the editor. Shorten the spoken lines so the TOTAL is at most ${budget} words, keeping meaning, rhythm and every fact. Do not add numbers. You may make a line empty ("") if the visual carries the scene.`,
    tool: { name: 'record_lines', description: 'Shortened lines, same order and count', input_schema: { type: 'object', required: ['lines'], properties: { lines: { type: 'array', items: { type: 'string' } } } } },
    content: [{ type: 'text', text: p.scenes.map((s, i) => `${i + 1}. [${s.type}] ${s.vo?.text || ''}`).join('\n') }],
  });
  const lines: string[] = out.lines || [];
  if (lines.length !== p.scenes.length) return;
  updateProject(pid, (pp) => { pp.scenes.forEach((s, i) => { const t = String(lines[i] || '').trim(); s.vo = t ? { text: t } : undefined; if (s.caption && t) s.caption = undefined; }); });
}
