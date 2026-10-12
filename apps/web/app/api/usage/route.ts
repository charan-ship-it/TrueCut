import { ok, route, fail } from '@/lib/http';
import { usageSummary, getWorkspaceSettings } from '@truecut/db';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request, _c: any, u) => {
  const m = new URL(req.url).searchParams.get('month');
  if (m && !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return fail('month must look like 2026-10');
  const month = m ? new Date(`${m}-01T00:00:00Z`) : undefined;
  const [summary, settings] = await Promise.all([usageSummary(u.workspaceId, month), getWorkspaceSettings(u.workspaceId)]);
  return ok({ ...summary, budget: settings.monthlyBudgetUsd });
});
