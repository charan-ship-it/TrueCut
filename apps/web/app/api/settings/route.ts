import { z } from 'zod';
import { ok, route, body } from '@/lib/http';
import { roleOf, requireOwner, authEnabled } from '@/lib/auth';
import { getWorkspaceSettings, updateWorkspaceSettings, listKeys, resolveRunContext, secretsAvailable, monthSpend } from '@truecut/db';
import { MODELS, MODEL_SLOTS } from '@truecut/shared/models';
import { env } from '@truecut/config';
import { forgetBudget } from '@truecut/core/system/claude';
export const dynamic = 'force-dynamic';

async function view(u: { id: string; workspaceId: string }) {
  const [settings, keys, ctx, spent, role] = await Promise.all([getWorkspaceSettings(u.workspaceId), listKeys(u.workspaceId, u.id), resolveRunContext({ workspaceId: u.workspaceId, userId: u.id || null }), monthSpend(u.workspaceId), roleOf(u)]);
  return {
    role, auth: authEnabled(), settings, keys, models: MODELS, slots: MODEL_SLOTS, secretsAvailable: secretsAvailable(), spentThisMonth: spent,
    server: { anthropic: !!env('ANTHROPIC_API_KEY'), elevenlabs: !!env('ELEVENLABS_API_KEY') },
    effective: { anthropic: ctx.keys?.anthropicSource, elevenlabs: ctx.keys?.elevenSource },
  };
}

export const GET = route(async (_r: Request, _c: any, u) => ok(await view(u)));

const ModelId = z.enum(MODELS.map((m) => m.id) as [string, ...string[]]);
const Patch = z.object({
  models: z.object({ analysis: ModelId, creative: ModelId, vision: ModelId }).partial().optional(),
  monthlyBudgetUsd: z.number().nonnegative().max(1_000_000).nullable().optional(),
}).strict();

export const PATCH = route(async (req: Request, _c: any, u) => {
  await requireOwner(u);
  const b = await body(req, Patch);
  await updateWorkspaceSettings(u.workspaceId, b, u.id || null);
  forgetBudget(u.workspaceId);
  return ok(await view(u));
});
