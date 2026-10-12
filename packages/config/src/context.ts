// Per-request / per-job context. A job runs on behalf of a person in a workspace; their API keys and
// model choices are resolved once when the job starts and carried here, so the pipelines keep reading
// `config.anthropicKey` / `config.model` without knowing who they are working for.
import { AsyncLocalStorage } from 'node:async_hooks';

export type KeySource = 'personal' | 'workspace' | 'server' | 'none';
export type RunContext = {
  workspaceId?: string | null;
  userId?: string | null;
  projectId?: string | null;
  jobId?: string | null;
  keys?: { anthropic?: string; anthropicSource?: KeySource; eleven?: string; elevenSource?: KeySource };
  models?: { analysis?: string; creative?: string; vision?: string };
  keyIds?: { anthropic?: string; elevenlabs?: string };
};

const g = globalThis as any;
const als: AsyncLocalStorage<RunContext> = g.__tcContext || (g.__tcContext = new AsyncLocalStorage<RunContext>());

export function runWithContext<T>(ctx: RunContext, fn: () => T): T { return als.run(ctx, fn); }
export function currentContext(): RunContext | undefined { return als.getStore(); }
