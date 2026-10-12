// The one place TrueCut talks to Claude. Every call:
//   · uses the model and API key of the person/workspace the job runs for (see system/context.ts)
//   · is checked against the workspace's monthly budget first
//   · retries rate limits, overload and network errors with backoff (SDK), and recovers once from a
//     truncated answer by asking again with more room
//   · is recorded in the usage ledger (tokens, cost estimate, success or failure)
//   · turns provider errors into messages people can act on
//   · asks for the answer through a tool; models that can't be forced to call it (tool_choice "tool")
//     are asked to call it, which is remembered per model
import Anthropic from '@anthropic-ai/sdk';
import { config, currentContext } from '@truecut/config';
import { recordUsage, markKey, monthSpend, getWorkspaceSettings } from '@truecut/db';
import { costOf } from '@truecut/shared/models';
import { BudgetExceeded, MissingKey, UserFacingError } from './errors';

type Tool = { name: string; description: string; input_schema: any };
export type CallToolOpts = { model: string; system: string; tool: Tool; content: any[]; maxTokens?: number; operation?: string; what?: string };

const g = globalThis as any;
const clients: Map<string, Anthropic> = g.__tcClaude || (g.__tcClaude = new Map());
function client(key: string) {
  let c = clients.get(key);
  if (!c) { c = new Anthropic({ apiKey: key, maxRetries: 4, timeout: 10 * 60_000 }); clients.set(key, c); if (clients.size > 50) clients.delete(clients.keys().next().value!); }
  return c;
}

// budget checks are cached briefly so a burst of calls doesn't hammer the database
const budgetCache = new Map<string, { at: number; spent: number; budget: number | null }>();
export async function assertBudget(workspaceId?: string | null, keySource?: string) {
  if (!workspaceId || keySource === 'personal') return;
  const fresh = async () => { const [spent, s] = await Promise.all([monthSpend(workspaceId), getWorkspaceSettings(workspaceId)]); const v = { at: Date.now(), spent, budget: s.monthlyBudgetUsd }; budgetCache.set(workspaceId, v); return v; };
  let b = budgetCache.get(workspaceId);
  if (!b || Date.now() - b.at > 15_000) b = await fresh();
  // before refusing, re-read: an owner may have just raised the cap (from another process)
  if (b.budget != null && b.spent >= b.budget && Date.now() - b.at > 1_000) b = await fresh();
  if (b.budget != null && b.spent >= b.budget) throw new BudgetExceeded(b.spent, b.budget);
}
export const forgetBudget = (workspaceId: string) => budgetCache.delete(workspaceId);

/** Provider error → something a person can act on. Exported for tests. */
export function explainClaudeError(e: any): UserFacingError {
  const status = e?.status as number | undefined;
  const msg = String(e?.error?.error?.message || e?.message || e);
  if (e instanceof UserFacingError) return e;
  if (status === 401) return new UserFacingError('Claude rejected the API key. Check or replace it in Settings → API keys.', 'invalid_key');
  if (status === 403) return new UserFacingError(`This API key isn't allowed to use that model or feature (${msg.slice(0, 120)}). Pick another model in Settings or use a different key.`, 'forbidden');
  if (status === 400 && /credit balance|billing|purchase credits/i.test(msg)) return new UserFacingError('The Anthropic account behind this API key is out of credits. Top it up in the Anthropic Console, or use another key in Settings.', 'no_credit');
  if (status === 404 && /model/i.test(msg)) return new UserFacingError(`The model "${msg.match(/claude-[\w.-]+/)?.[0] || 'selected'}" isn't available to this API key. Choose another in Settings → Models & budget.`, 'model_unavailable');
  if (status === 413 || /prompt is too long|too many tokens/i.test(msg)) return new UserFacingError('The sources are too large for one request. Remove a few sources or pages and try again.', 'too_large');
  if (status === 429) return new UserFacingError('Claude is rate-limiting this API key right now. TrueCut retried a few times; please try again in a minute.', 'rate_limited', true);
  if (status === 529 || status === 503) return new UserFacingError('Claude is overloaded right now. TrueCut retried a few times; please try again in a minute.', 'overloaded', true);
  if (status && status >= 500) return new UserFacingError(`Claude had a server error (${status}). Please try again.`, 'provider_error', true);
  if (/timed? ?out|ETIMEDOUT|ECONNRESET|fetch failed|ENOTFOUND/i.test(msg)) return new UserFacingError("Couldn't reach Claude (network). Please try again.", 'network', true);
  return new UserFacingError(`Claude request failed: ${msg.slice(0, 200)}`, 'unknown');
}

// Models that answered "tool_choice type tool/any is not supported": ask them nicely instead.
const autoOnly: Set<string> = g.__tcAutoTool || (g.__tcAutoTool = new Set());
const forcedUnsupported = (e: any) => e?.status === 400 && /tool_choice/i.test(String(e?.error?.error?.message || e?.message || ''));

/** A JSON object in a text answer, for a model that wrote the result instead of calling the tool. */
function jsonFromText(msg: any) {
  const t = (msg.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) || t.match(/(\{[\s\S]*\})/);
  if (!m) return null;
  try { const v = JSON.parse(m[1]); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

export async function callTool<T>(opts: CallToolOpts): Promise<T> {
  const ctx = currentContext();
  const key = config.anthropicKey;
  if (!key) throw new MissingKey('anthropic', opts.what || 'Writing with AI');
  await assertBudget(ctx?.workspaceId, config.anthropicKeySource);
  const operation = opts.operation || opts.tool.name.replace(/^record_/, '');
  let maxTokens = opts.maxTokens || 12000;
  let grewOnce = false; let nudged = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = Date.now();
    const auto = autoOnly.has(opts.model);
    try {
      const msg = await client(key).messages.create({
        model: opts.model, max_tokens: maxTokens,
        system: auto ? `${opts.system}\n\nGive your answer only by calling the \`${opts.tool.name}\` tool, once, with the complete result. Do not answer in plain text.` : opts.system,
        tools: [opts.tool as any], tool_choice: (auto ? { type: 'auto' } : { type: 'tool', name: opts.tool.name }) as any,
        messages: [{ role: 'user', content: opts.content }],
      });
      const u: any = msg.usage || {};
      const usage = { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, cacheRead: u.cache_read_input_tokens || 0 };
      const truncated = msg.stop_reason === 'max_tokens';
      void recordUsage({ workspaceId: ctx?.workspaceId, userId: ctx?.userId, projectId: ctx?.projectId, jobId: ctx?.jobId, provider: 'anthropic', model: opts.model, operation,
        inputTokens: usage.input, outputTokens: usage.output, cacheWriteTokens: usage.cacheWrite, cacheReadTokens: usage.cacheRead,
        costUsd: costOf(opts.model, usage), keySource: config.anthropicKeySource, ok: !truncated, error: truncated ? 'truncated (max_tokens)' : null, durationMs: Date.now() - t0 });
      if (ctx?.workspaceId && config.anthropicKeySource !== 'personal') { const b = budgetCache.get(ctx.workspaceId); if (b) b.spent += costOf(opts.model, usage); }
      if (ctx?.keyIds?.anthropic && attempt === 0) void markKey(ctx.keyIds.anthropic, 'ok').catch(() => {});
      const tu: any = msg.content.find((b: any) => b.type === 'tool_use' && b.name === opts.tool.name);
      if (truncated && !grewOnce) { grewOnce = true; maxTokens = Math.min(Math.round(maxTokens * 1.8), 64_000); continue; } // ran out of room: once more, with more
      if (tu) return tu.input as T;
      const fromText = !truncated && auto ? jsonFromText(msg) : null;
      if (fromText) return fromText as T;
      if (auto && !nudged && !truncated) { nudged = true; continue; } // it chatted instead of answering: ask once more
      if (truncated) break;
      throw new UserFacingError('Claude did not return a structured answer. Please try again.', 'no_tool_output', true);
    } catch (e: any) {
      if (e instanceof UserFacingError) throw e;
      if (forcedUnsupported(e) && !autoOnly.has(opts.model)) { autoOnly.add(opts.model); continue; } // this model can't be forced to use the tool
      const err = explainClaudeError(e);
      void recordUsage({ workspaceId: ctx?.workspaceId, userId: ctx?.userId, projectId: ctx?.projectId, jobId: ctx?.jobId, provider: 'anthropic', model: opts.model, operation, keySource: config.anthropicKeySource, ok: false, error: `${e?.status || ''} ${err.code}`.trim(), durationMs: Date.now() - t0 });
      if (err.code === 'invalid_key' && ctx?.keyIds?.anthropic) await markKey(ctx.keyIds.anthropic, 'invalid', 'Rejected by Anthropic (401)').catch(() => {});
      throw err;
    }
  }
  throw new UserFacingError('Claude ran out of room twice for this answer. Try a shorter video or fewer sources.', 'truncated');
}
