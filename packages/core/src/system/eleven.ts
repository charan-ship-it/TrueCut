// The one place TrueCut talks to ElevenLabs (voices, text-to-speech, Scribe transcription), with the
// job's key, retries for rate limits and server errors, clear errors, and usage recording.
import { config, currentContext, env } from '@truecut/config';
import { recordUsage, markKey } from '@truecut/db';
import { MissingKey, UserFacingError } from './errors';
import { assertBudget } from './claude';

export const ELEVEN_API = 'https://api.elevenlabs.io/v1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function explainElevenError(status: number, body: string): UserFacingError {
  if (status === 401) return new UserFacingError('ElevenLabs rejected the API key. Check or replace it in Settings → API keys.', 'invalid_key');
  if (/quota|credits|character_limit|insufficient/i.test(body) || status === 402) return new UserFacingError("The ElevenLabs account is out of credits for this month. Top it up, or use another key in Settings.", 'no_credit');
  if (status === 429) return new UserFacingError('ElevenLabs is rate-limiting this key (too many at once). Please try again in a minute.', 'rate_limited', true);
  if (status === 422 || status === 400) return new UserFacingError(`ElevenLabs couldn't process this: ${body.replace(/\s+/g, ' ').slice(0, 160)}`, 'bad_request');
  if (status >= 500) return new UserFacingError(`ElevenLabs had a server error (${status}). Please try again.`, 'provider_error', true);
  return new UserFacingError(`ElevenLabs request failed (${status}): ${body.slice(0, 160)}`, 'unknown');
}

/** Estimated USD per 1,000 characters / per minute, when the team sets them (plans differ, so default 0). */
const charPrice = () => Number(env('TRUECUT_ELEVEN_USD_PER_1K_CHARS', '0')) || 0;
const minutePrice = () => Number(env('TRUECUT_ELEVEN_USD_PER_MINUTE', '0')) || 0;

export async function elevenFetch(path: string, init: RequestInit & { operation: string; what: string; units?: number; unitKind?: 'characters' | 'seconds'; model?: string }) {
  const key = config.elevenKey;
  if (!key) throw new MissingKey('elevenlabs', init.what);
  const ctx = currentContext();
  if (init.units) await assertBudget(ctx?.workspaceId, config.elevenKeySource);
  const headers = { ...(init.headers as any), 'xi-api-key': key };
  let last: UserFacingError | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = Date.now();
    let r: Response;
    try { r = await fetch(`${ELEVEN_API}${path}`, { ...init, headers, signal: AbortSignal.timeout(10 * 60_000) }); }
    catch (e: any) { last = new UserFacingError("Couldn't reach ElevenLabs (network). Please try again.", 'network', true); await sleep(1000 * 2 ** attempt); continue; }
    if (r.ok) {
      if (init.units) {
        const cost = init.unitKind === 'characters' ? (init.units / 1000) * charPrice() : (init.units / 60) * minutePrice();
        void recordUsage({ workspaceId: ctx?.workspaceId, userId: ctx?.userId, projectId: ctx?.projectId, jobId: ctx?.jobId, provider: 'elevenlabs', model: init.model || '', operation: init.operation, units: init.units, unitKind: init.unitKind, costUsd: cost, keySource: config.elevenKeySource, durationMs: Date.now() - t0 });
      }
      if (ctx?.keyIds?.elevenlabs && attempt === 0) void markKey(ctx.keyIds.elevenlabs, 'ok').catch(() => {});
      return r;
    }
    const body = await r.text().catch(() => '');
    last = explainElevenError(r.status, body);
    if (last.code === 'invalid_key' && ctx?.keyIds?.elevenlabs) await markKey(ctx.keyIds.elevenlabs, 'invalid', 'Rejected by ElevenLabs (401)').catch(() => {});
    if (!last.retryable) break;
    const wait = Number(r.headers.get('retry-after')) * 1000 || 1500 * 2 ** attempt;
    await sleep(Math.min(wait, 30_000));
  }
  if (init.units) void recordUsage({ workspaceId: ctx?.workspaceId, userId: ctx?.userId, projectId: ctx?.projectId, jobId: ctx?.jobId, provider: 'elevenlabs', model: init.model || '', operation: init.operation, keySource: config.elevenKeySource, ok: false, error: last?.code });
  throw last!;
}
