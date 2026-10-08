import { ok, route } from '@/lib/http';
import { deleteProject, getProject, updateProject } from '@truecut/db';
import { checkScenes } from '@truecut/shared/facts';
import { projectJobs, isBusy } from '@truecut/queue';
import { Project } from '@truecut/shared/types';
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };
const EDITABLE = ['name', 'intake', 'facts', 'questions', 'visuals', 'scenes', 'music', 'brief', 'stage', 'style', 'favorite', 'kind', 'angleId', 'talk', 'cast'] as const;
const view = (id: string) => { const p = getProject(id); p.agentBusy = isBusy(id); return { project: p, issues: checkScenes(p), jobs: projectJobs(id).slice(0, 12) }; };
export const GET = route(async (_r: Request, { params }: C) => ok(view(params.id)));
export const PATCH = route(async (req: Request, { params }: C) => {
  const b = await req.json();
  updateProject(params.id, (p) => {
    const next: any = { ...p };
    for (const k of EDITABLE) if (b[k] !== undefined) next[k] = b[k];
    // scenes edited → voice for changed lines and the soundtrack are stale
    if (b.scenes) {
      next.scenes = b.scenes.map((s: any) => { const old = p.scenes.find((o) => o.id === s.id); if (s.vo && old?.vo && old.vo.text === s.vo.text) return { ...s, vo: { ...old.vo, ...s.vo } }; if (s.vo) return { ...s, vo: { text: s.vo.text } }; return s; });
      next.audioHash = undefined;
    }
    if (b.music || b.cast) next.audioHash = undefined;
    return Project.parse(next);
  });
  return ok(view(params.id));
});
export const DELETE = route(async (_r: Request, { params }: C) => { deleteProject(params.id); return ok({ deleted: true }); });
