import { z } from 'zod';

export const FormatId = z.enum(['4x5', '9x16', '1x1']);
export type FormatId = z.infer<typeof FormatId>;

export const Source = z.object({
  id: z.string(),
  kind: z.enum(['url', 'path', 'upload', 'text']),
  label: z.string(),
  ref: z.string(),                       // url, absolute path, file name, or "pasted"
  addedAt: z.string(),
  status: z.enum(['pending', 'ready', 'error']).default('pending'),
  error: z.string().optional(),
  textFile: z.string().optional(),       // relative to project dir
  chars: z.number().default(0),
  pages: z.array(z.object({ url: z.string(), title: z.string() })).optional(),
  meta: z.record(z.any()).optional(),    // e.g. themeColor, siteName, logo
});
export type Source = z.infer<typeof Source>;

export const Visual = z.object({
  id: z.string(),
  file: z.string(),                      // relative to project dir, e.g. assets/v_x.jpg
  w: z.number(),
  h: z.number(),
  origin: z.string(),                    // url or source path
  sourceId: z.string().optional(),
  kind: z.enum(['screenshot', 'image', 'logo', 'avatar']).default('image'),
  use: z.boolean().default(true),
  description: z.string().optional(),
  bestFor: z.string().optional(),
  focus: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable().optional(),
});
export type Visual = z.infer<typeof Visual>;

export const Fact = z.object({
  id: z.string(),
  statement: z.string(),
  value: z.union([z.string(), z.number()]).nullable().optional(),
  kind: z.enum(['metric', 'feature', 'claim', 'quote', 'example', 'other']).default('claim'),
  quote: z.string().default(''),         // verbatim excerpt from a source
  sourceId: z.string().optional(),
  where: z.string().optional(),          // page/file the quote came from
  status: z.enum(['verified', 'needs-check', 'rejected']).default('needs-check'),
  approved: z.boolean().default(true),
});
export type Fact = z.infer<typeof Fact>;

export const Question = z.object({ id: z.string(), question: z.string(), why: z.string().default(''), suggested: z.string().default(''), answer: z.string().default('') });
export type Question = z.infer<typeof Question>;

export const Intake = z.object({
  brandName: z.string().default(''),
  productName: z.string().default(''),
  oneLiner: z.string().default(''),
  audience: z.string().default(''),
  goal: z.string().default('Book demos'),
  tone: z.string().default('Confident, specific, a little bold'),
  length: z.number().default(30),
  formats: z.array(FormatId).default(['4x5', '9x16']),
  cta: z.string().default('Book a demo'),
  ctaUrl: z.string().default(''),
  byline: z.string().default(''),
  accent: z.string().default('#F47920'),
  voiceId: z.string().default(''),
  avatarVisual: z.string().default(''),  // visual id used as hero/character image
  logoVisual: z.string().default(''),
  mustSay: z.string().default(''),
  mustAvoid: z.string().default(''),
  dataLabel: z.string().default(''),     // e.g. "Live data · Sep 2026"
});
export type Intake = z.infer<typeof Intake>;

export const VO = z.object({
  text: z.string(),
  duration: z.number().optional(),
  file: z.string().optional(),           // relative to project dir
  words: z.array(z.object({ w: z.string(), s: z.number(), e: z.number() })).optional(),
  hash: z.string().optional(),
});

export const Scene = z.object({
  id: z.string(),
  type: z.enum(['stat', 'headline', 'bars', 'reveal', 'card', 'wall', 'selector', 'document', 'action', 'quote', 'screen', 'kinetic', 'split', 'list', 'compare', 'end']),
  vo: VO.optional(),
  caption: z.string().optional(),
  status: z.string().optional(),
  duration: z.number().optional(),
  props: z.record(z.any()).default({}),
  facts: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type Scene = z.infer<typeof Scene>;

export const Brief = z.object({
  title: z.string().default(''),
  concept: z.string().default(''),
  insight: z.string().default(''),
  audience: z.string().default(''),
  proposition: z.string().default(''),
  hook: z.string().default(''),
});
export type Brief = z.infer<typeof Brief>;

/** Creative direction: a preset id plus any overrides (palette, fonts, background, transition, captions, music…). */
export const Style = z.object({ preset: z.string().default('signal'), why: z.string().optional() }).passthrough();
export type Style = z.infer<typeof Style>;

/** One message in the project's conversation with Nick. Cards are rich blocks rendered by the chat UI. */
export const Card = z.object({ kind: z.string() }).passthrough();
export const ChatMsg = z.object({
  id: z.string(),
  role: z.enum(['user', 'nick', 'system']),
  text: z.string().default(''),
  cards: z.array(Card).default([]),
  replies: z.array(z.string()).default([]),       // quick-reply chips
  at: z.string(),
  jobId: z.string().optional(),
  attachments: z.array(z.object({ kind: z.string(), label: z.string(), ref: z.string() })).default([]),
});
export type ChatMsg = z.infer<typeof ChatMsg>;

export const Angle = z.object({ id: z.string(), title: z.string(), hook: z.string(), why: z.string().default(''), preset: z.string().default('signal'), structure: z.string().default('') });
export type Angle = z.infer<typeof Angle>;

/** Founder talk mode: recorded media, its transcript, and the AI's edit (kept segments + illustrated beats). */
export const Word = z.object({ w: z.string(), s: z.number(), e: z.number(), sp: z.string().optional() });
export const Media = z.object({ id: z.string(), sourceId: z.string(), name: z.string(), file: z.string(), duration: z.number(), w: z.number().default(0), h: z.number().default(0), hasVideo: z.boolean().default(true), wordsFile: z.string().optional(), words: z.number().default(0), speakers: z.array(z.string()).default([]), face: z.object({ x: z.number(), y: z.number() }).optional(), poster: z.string().optional() });
export type Media = z.infer<typeof Media>;
export const Beat = z.object({ id: z.string(), start: z.number(), end: z.number(), from: z.number().optional(), to: z.number().optional(), headline: z.string(), accent: z.string().optional(), sub: z.string().optional(), visual: z.record(z.any()).default({ kind: 'quote' }), facts: z.array(z.string()).default([]) });
export type Beat = z.infer<typeof Beat>;
export const Talk = z.object({
  media: z.array(Media).default([]),
  layout: z.enum(['split', 'overlay']).default('split'),
  music: z.string().default('auto'),
  musicWhy: z.string().optional(),
  showCaptions: z.boolean().optional(),
  speaker: z.object({ name: z.string().default(''), role: z.string().default('') }).default({}),
  label: z.string().default(''),
  title: z.string().default(''),
  segments: z.array(z.object({ mid: z.string(), start: z.number(), end: z.number() })).default([]),
  beats: z.array(Beat).default([]),
  duration: z.number().default(0),
  instruction: z.string().default(''),
  captions: z.array(z.any()).default([]),
  proxies: z.record(z.string()).default({}),
  mix: z.string().optional(),
  planHash: z.string().optional(),
});
export type Talk = z.infer<typeof Talk>;

/** Voice casting for ads: who speaks (members) and which scenes each one reads. Talks never use this — the founder keeps their own voice. */
export const CastMember = z.object({ role: z.string(), voiceId: z.string(), name: z.string().default(''), why: z.string().default(''), energy: z.enum(['calm', 'balanced', 'energetic']).default('balanced'), labels: z.record(z.string()).default({}), preview: z.string().optional() });
export type CastMember = z.infer<typeof CastMember>;
export const Cast = z.object({ members: z.array(CastMember).default([]), assign: z.record(z.string()).default({}), why: z.string().default(''), music: z.object({ genre: z.string(), bpm: z.number().optional(), why: z.string().default(''), preset: z.string().optional() }).optional(), auto: z.boolean().default(true), at: z.string().optional() });
export type Cast = z.infer<typeof Cast>;

export const RenderOut = z.object({ id: z.string(), format: FormatId, file: z.string(), srt: z.string().optional(), at: z.string(), duration: z.number(), bytes: z.number() });
export type RenderOut = z.infer<typeof RenderOut>;

export const Project = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  stage: z.enum(['sources', 'facts', 'questions', 'storyboard', 'voice', 'render', 'done']).default('sources'),
  sources: z.array(Source).default([]),
  visuals: z.array(Visual).default([]),
  facts: z.array(Fact).default([]),
  questions: z.array(Question).default([]),
  product: z.record(z.any()).default({}),
  intake: Intake.default({}),
  brief: Brief.optional(),
  scenes: z.array(Scene).default([]),
  music: z.object({ mode: z.enum(['generated', 'none']).default('generated') }).default({}),
  audioFile: z.string().optional(),
  audioHash: z.string().optional(),
  renders: z.array(RenderOut).default([]),
  style: Style.default({ preset: 'signal' }),
  angles: z.array(Angle).default([]),
  angleId: z.string().optional(),
  talk: Talk.default({}),
  cast: Cast.default({}),
  chat: z.array(ChatMsg).default([]),
  kind: z.string().default('ad'),                  // ad | explainer | launch | social
  favorite: z.boolean().default(false),
  agentBusy: z.boolean().default(false),
});
export type Project = z.infer<typeof Project>;
