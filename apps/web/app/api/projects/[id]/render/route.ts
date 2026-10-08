import { ok, route, fail } from '@/lib/http';
import { startRender } from '@truecut/core/director/actions';
import { getProject } from '@truecut/db';
import { checkScenes } from '@truecut/shared/facts';
export const dynamic = 'force-dynamic';
export const POST = route(async (req: Request, { params }: { params: { id: string } }) => {
  const b = await req.json().catch(() => ({}));
  const p = getProject(params.id);
  const formats = (b.formats?.length ? b.formats : p.intake.formats).filter((f: string) => ['4x5', '9x16', '1x1'].includes(f));
  if (!formats.length) return fail('Pick at least one format.');
  const errors = checkScenes(p).filter((i) => i.level === 'error');
  if (errors.length && !b.override) return fail('Fact check failed — fix or approve the flagged numbers first (or render anyway from the Render tab).', 409);
  return ok({ jobs: [startRender(params.id, formats).id] });
});
