import { ok, route, fail } from '@/lib/http';
import { createProject, listProjects } from '@truecut/db';
import { addSource } from '@truecut/core/sources/ingest';
import { startIngest } from '@truecut/core/director/actions';
import { startTurn, detectSources } from '@truecut/core/director/agent';
import { readAction } from '@/lib/chatreq';
import { updateProject } from '@truecut/db';
import { isBusy } from '@truecut/queue';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ok(listProjects().map((p) => ({ id: p.id, name: p.name, stage: p.stage, updatedAt: p.updatedAt, scenes: p.scenes.length, renders: p.renders.length, thumb: p.product?.poster || p.visuals.find((v) => v.use && v.kind === 'screenshot')?.file || p.visuals[0]?.file || null, video: p.renders[0]?.file || null, style: p.style?.preset || 'signal', favorite: p.favorite, kind: p.kind, length: p.intake.length, busy: isBusy(p.id), last: p.chat[p.chat.length - 1]?.text?.slice(0, 120) || '' }))));
export const POST = route(async (req: Request) => {
  // Chat-first: {message} or multipart → create the project and start Nick's first turn.
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data') || req.headers.get('x-nm-chat')) {
    const p = createProject('Untitled video');
    const action = await readAction(req, p.id);
    const opts = (action as any).options || {};
    updateProject(p.id, (pp) => { if (opts.length) pp.intake.length = Number(opts.length); if (opts.formats?.length) pp.intake.formats = opts.formats; if (opts.kind) pp.kind = opts.kind; if (opts.preset) pp.style = { preset: opts.preset };
      const first = action.type === 'message' ? [...(action.attachments || []), ...detectSources(action.text)][0] : null; if (first) pp.name = first.label.replace(/^www\./, '').split('/')[0] || pp.name; });
    const job = startTurn(p.id, action);
    return ok({ id: p.id, job: job.id }, 201);
  }
  const b = await req.json().catch(() => ({}));
  const p = createProject(String(b.name || '').trim() || 'Untitled video');
  const jobs: string[] = [];
  for (const s of b.sources || []) {
    if (!s?.value) continue;
    const src = addSource(p.id, s.kind, s.value, s.label);
    jobs.push(startIngest(p.id, src.id, s.kind, s.value).id);
  }
  return ok({ id: p.id, jobs }, 201);
});
