// Nick's agent loop, on the Claude Agent SDK.
//
// The SDK runs the loop (model → tool calls → results → model …). Nick's tools are our own: each one is an
// in-process MCP tool that validates its arguments and returns a short confirmation. The built-in Claude Code
// tools (shell, files, web) are switched off, so Nick can only do what we give him.
//
// What stays ours, on purpose:
//   · the budget check before a run and the usage ledger after it (same as every other Claude call)
//   · conversation history and project state, which live in Postgres and are passed in each turn
//     (the SDK session is not persisted: workers restart, and the database is the source of truth)
//   · the actual edits: tools only record what Nick decided; the caller executes them with the same code
//     the deterministic chat rules use, so an edit behaves the same however it was requested.
import os from 'node:os';
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { config, currentContext } from '@truecut/config';
import { recordUsage } from '@truecut/db';
import { assertBudget } from '../system/claude';
import { MissingKey, UserFacingError } from '../system/errors';

export { z };
export type AgentTool = { name: string; description: string; shape: Record<string, any>; run: (args: any) => string | Promise<string> };

export type AgentRun = { text: string; costUsd: number; turns: number; tools: number; stop: string };

export const sdkEnabled = () => /^(1|true|on)$/i.test(process.env.NICK_SDK || '') && !!config.anthropicKey;

/** Run one agent turn. Throws MissingKey / BudgetExceeded / UserFacingError like callTool does. */
export async function runAgent(o: { system: string; prompt: string; tools: AgentTool[]; operation: string; maxTurns?: number; maxBudgetUsd?: number; timeoutMs?: number }): Promise<AgentRun> {
  const ctx = currentContext(); const key = config.anthropicKey;
  if (!key) throw new MissingKey('anthropic', 'Chatting with Nick');
  await assertBudget(ctx?.workspaceId, config.anthropicKeySource);
  const server = createSdkMcpServer({ name: 'nick', version: '1.0.0', tools: o.tools.map((t) => tool(t.name, t.description, t.shape, async (args: any) => {
    try { return { content: [{ type: 'text' as const, text: String(await t.run(args)) }] }; }
    catch (e: any) { return { content: [{ type: 'text' as const, text: `Error: ${e?.message || e}` }], isError: true }; }
  })) });
  const allowed = o.tools.map((t) => `mcp__nick__${t.name}`);
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), o.timeoutMs || 120_000);
  const t0 = Date.now(); let res: any = null; let tools = 0; let turns = 0; let lastText = '';
  try {
    const q = query({ prompt: o.prompt, options: {
      model: config.model, systemPrompt: o.system, tools: [], mcpServers: { nick: server }, allowedTools: allowed,
      canUseTool: async (name: string) => (allowed.includes(name) ? { behavior: 'allow' as const, updatedInput: undefined as any } : { behavior: 'deny' as const, message: 'That tool is not available.' }),
      maxTurns: o.maxTurns || 6, maxBudgetUsd: o.maxBudgetUsd || 0.5, persistSession: false, settingSources: [], skills: [], cwd: os.tmpdir(), abortController: ac,
      env: { ...process.env, ANTHROPIC_API_KEY: key, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } as any,
    } });
    for await (const m of q as AsyncIterable<any>) {
      if (m.type === 'assistant') { turns++; for (const b of m.message?.content || []) { if (b.type === 'tool_use') tools++; if (b.type === 'text') lastText = b.text; } }
      if (m.type === 'result') res = m;
    }
  } catch (e: any) {
    void recordUsage({ workspaceId: ctx?.workspaceId, userId: ctx?.userId, projectId: ctx?.projectId, jobId: ctx?.jobId, provider: 'anthropic', model: config.model, operation: o.operation, keySource: config.anthropicKeySource, ok: false, error: String(e?.message || e).slice(0, 200), durationMs: Date.now() - t0 });
    throw new UserFacingError(ac.signal.aborted ? 'Nick took too long on that. Try a smaller request.' : 'Nick could not finish that request. Please try again.', 'agent_failed', true);
  } finally { clearTimeout(timer); }
  const u = res?.usage || {}; const cost = Number(res?.total_cost_usd) || 0;
  void recordUsage({ workspaceId: ctx?.workspaceId, userId: ctx?.userId, projectId: ctx?.projectId, jobId: ctx?.jobId, provider: 'anthropic', model: config.model, operation: o.operation,
    inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0, cacheWriteTokens: u.cache_creation_input_tokens || 0, cacheReadTokens: u.cache_read_input_tokens || 0,
    costUsd: cost, keySource: config.anthropicKeySource, ok: res?.subtype === 'success', error: res?.subtype === 'success' ? null : String(res?.subtype || 'no result'), durationMs: Date.now() - t0 });
  if (!res || res.subtype !== 'success') throw new UserFacingError('Nick could not finish that request. Please try again.', 'agent_failed', true);
  return { text: String(res.result || lastText || '').trim(), costUsd: cost, turns, tools, stop: res.subtype };
}
