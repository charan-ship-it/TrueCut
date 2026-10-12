// The Claude models TrueCut offers, with list prices (USD per million tokens) used for the cost
// estimates in Settings → Usage. Source: platform.claude.com/docs/en/about-claude/pricing (Oct 2026).
// Estimates only: the Anthropic Console is the bill of record.
export type ModelInfo = {
  id: string; label: string; note: string;
  input: number; output: number; cacheWrite: number; cacheRead: number;
  /** Haiku 5.5 charges more above this many prompt tokens. */
  longPrompt?: { over: number; input: number; output: number; cacheWrite: number; cacheRead: number };
};

export const MODELS: ModelInfo[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Default. Best writing and judgement for the price.', input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'Most capable, 2.5× the price of Opus.', input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Half the price of Opus. Good for reading sources.', input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest and cheapest. Fine for reading screenshots.', input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01,
    longPrompt: { over: 100_000, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 } },
];
export const DEFAULT_MODEL_ID = 'claude-opus-5-5';
export const modelInfo = (id: string) => MODELS.find((m) => m.id === id);

export type TokenUsage = { input: number; output: number; cacheWrite?: number; cacheRead?: number };

/** Estimated cost in USD of one call. Unknown models are priced as Opus 5.5 so spend is never under-counted to zero. */
export function costOf(model: string, u: TokenUsage): number {
  const m = modelInfo(model) || MODELS[0];
  const prompt = u.input + (u.cacheWrite || 0) + (u.cacheRead || 0);
  const p = m.longPrompt && prompt > m.longPrompt.over ? m.longPrompt : m;
  return (u.input * p.input + u.output * p.output + (u.cacheWrite || 0) * p.cacheWrite + (u.cacheRead || 0) * p.cacheRead) / 1_000_000;
}

export type ModelSlots = { analysis: string; creative: string; vision: string };
export const MODEL_SLOTS: { key: keyof ModelSlots; label: string; help: string }[] = [
  { key: 'creative', label: 'Writing', help: 'Angles, storyboards, voice casting, the founder-talk edit, chat edits.' },
  { key: 'analysis', label: 'Reading sources', help: 'Pulling facts and visuals out of websites, repos and notes.' },
  { key: 'vision', label: 'Reading screenshots', help: 'Library captures: text, numbers and personal data checks.' },
];
