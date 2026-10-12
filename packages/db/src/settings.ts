// Workspace settings (models, budget) and bring-your-own API keys.
import { and, eq, isNull, or } from 'drizzle-orm';
import { DEFAULT_MODEL_ID, MODELS, type ModelSlots } from '@truecut/shared/models';
import { env, type KeySource, type RunContext } from '@truecut/config';
import { db } from './client';
import { apiKeys, workspaceSettings, memberships } from './schema';
import { newId } from './ids';
import { decryptSecret, encryptSecret } from './secrets';

export type Provider = 'anthropic' | 'elevenlabs';
export const PROVIDERS: Provider[] = ['anthropic', 'elevenlabs'];

export type WorkspaceSettings = { models: ModelSlots; monthlyBudgetUsd: number | null };

const validModel = (m: unknown) => (typeof m === 'string' && MODELS.some((x) => x.id === m) ? m : null);

export async function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings> {
  const [r] = await db().select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)).limit(1);
  const m: any = r?.models || {};
  const fallback = env('TRUECUT_MODEL', DEFAULT_MODEL_ID);
  return {
    models: { analysis: validModel(m.analysis) || fallback, creative: validModel(m.creative) || env('TRUECUT_CREATIVE_MODEL', fallback), vision: validModel(m.vision) || env('TRUECUT_VISION_MODEL', fallback) },
    monthlyBudgetUsd: r?.monthlyBudgetUsd != null ? Number(r.monthlyBudgetUsd) : null,
  };
}

export async function updateWorkspaceSettings(workspaceId: string, patch: Partial<{ models: Partial<ModelSlots>; monthlyBudgetUsd: number | null }>, userId?: string | null) {
  const cur = await getWorkspaceSettings(workspaceId);
  const models = { ...cur.models };
  for (const [k, v] of Object.entries(patch.models || {})) {
    if (!['analysis', 'creative', 'vision'].includes(k)) continue;
    if (!validModel(v)) throw new Error(`Unknown model: ${v}`);
    (models as any)[k] = v;
  }
  let budget = cur.monthlyBudgetUsd;
  if (patch.monthlyBudgetUsd !== undefined) {
    if (patch.monthlyBudgetUsd !== null && (!Number.isFinite(patch.monthlyBudgetUsd) || patch.monthlyBudgetUsd < 0 || patch.monthlyBudgetUsd > 1_000_000)) throw new Error('Budget must be between 0 and 1,000,000 USD, or empty for no limit.');
    budget = patch.monthlyBudgetUsd;
  }
  const values = { workspaceId, models, monthlyBudgetUsd: budget == null ? null : budget.toFixed(2), updatedBy: userId || null, updatedAt: new Date() };
  await db().insert(workspaceSettings).values(values).onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: values });
  return getWorkspaceSettings(workspaceId);
}

export type KeyView = { id: string; provider: Provider; scope: 'personal' | 'workspace'; last4: string; status: string; statusMessage: string | null; createdAt: string; lastUsedAt: string | null };
const view = (r: typeof apiKeys.$inferSelect): KeyView => ({ id: r.id, provider: r.provider as Provider, scope: r.userId ? 'personal' : 'workspace', last4: r.last4, status: r.status, statusMessage: r.statusMessage, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() || null });

/** Keys this person can see: the workspace's and their own. Never the secrets. */
export async function listKeys(workspaceId: string, userId: string): Promise<KeyView[]> {
  const rows = await db().select().from(apiKeys).where(and(eq(apiKeys.workspaceId, workspaceId), or(isNull(apiKeys.userId), eq(apiKeys.userId, userId))));
  return rows.map(view);
}

export async function saveKey(o: { workspaceId: string; userId: string | null; provider: Provider; secret: string; createdBy: string | null }) {
  const secret = o.secret.trim();
  const values = { id: 'k' + newId(), workspaceId: o.workspaceId, userId: o.userId, provider: o.provider, secret: encryptSecret(secret), last4: secret.slice(-4), status: 'ok', statusMessage: null, createdBy: o.createdBy, createdAt: new Date(), lastUsedAt: null };
  // one key per (workspace, person-or-workspace, provider): replace any existing one
  await db().delete(apiKeys).where(and(eq(apiKeys.workspaceId, o.workspaceId), eq(apiKeys.provider, o.provider), o.userId ? eq(apiKeys.userId, o.userId) : isNull(apiKeys.userId)));
  const [r] = await db().insert(apiKeys).values(values).returning();
  return view(r);
}

export async function deleteKey(id: string, workspaceId: string) {
  await db().delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)));
}
export async function getKeyRow(id: string) { const [r] = await db().select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1); return r || null; }

/** Mark a key as rejected by the provider so Settings can show it (and stop retrying with it). */
export async function markKey(id: string, status: 'ok' | 'invalid', message?: string) {
  await db().update(apiKeys).set({ status, statusMessage: message || null, ...(status === 'ok' ? { lastUsedAt: new Date() } : {}) }).where(eq(apiKeys.id, id));
}

export async function memberRole(workspaceId: string, userId: string) {
  const [r] = await db().select({ role: memberships.role }).from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId))).limit(1);
  return r?.role || null;
}

type Resolved = { secret: string; source: KeySource; keyId?: string };
async function resolveKey(workspaceId: string | null | undefined, userId: string | null | undefined, provider: Provider, serverEnv: string): Promise<Resolved> {
  if (workspaceId) {
    const rows = await db().select().from(apiKeys).where(and(eq(apiKeys.workspaceId, workspaceId), eq(apiKeys.provider, provider), userId ? or(isNull(apiKeys.userId), eq(apiKeys.userId, userId)) : isNull(apiKeys.userId)));
    const personal = rows.find((r) => r.userId && r.status === 'ok');
    const shared = rows.find((r) => !r.userId && r.status === 'ok');
    for (const [r, source] of [[personal, 'personal'], [shared, 'workspace']] as const) {
      if (!r) continue;
      try { return { secret: decryptSecret(r.secret), source, keyId: r.id }; } catch (e: any) { await markKey(r.id, 'invalid', e.message); }
    }
  }
  const s = env(serverEnv);
  return s ? { secret: s, source: 'server' } : { secret: '', source: 'none' };
}

/** Everything a job needs to act for this person: keys (personal > workspace > server) and model choices. */
export async function resolveRunContext(o: { workspaceId?: string | null; userId?: string | null; projectId?: string | null; jobId?: string | null }): Promise<RunContext & { keyIds: Partial<Record<Provider, string>> }> {
  const ws = o.workspaceId || null;
  const [a, e, s] = await Promise.all([
    resolveKey(ws, o.userId, 'anthropic', 'ANTHROPIC_API_KEY'),
    resolveKey(ws, o.userId, 'elevenlabs', 'ELEVENLABS_API_KEY'),
    ws ? getWorkspaceSettings(ws) : Promise.resolve(null),
  ]);
  return {
    workspaceId: ws, userId: o.userId || null, projectId: o.projectId || null, jobId: o.jobId || null,
    keys: { anthropic: a.secret, anthropicSource: a.source, eleven: e.secret, elevenSource: e.source },
    models: s?.models,
    keyIds: { anthropic: a.keyId, elevenlabs: e.keyId },
  };
}

