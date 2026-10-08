import { ok, route } from '@/lib/http';
import { createProject, listProjects, updateProject } from '@truecut/db';
import type { ProjectSummary } from '@truecut/db';
import { addSource } from '@truecut/core/sources/ingest';
import { startIngest } from '@truecut/core/director/actions';
import { startTurn } from '@truecut/core/director/agent';
import { readAction, applyOptions } from '@/lib/chatreq';
import { busyProjects } from '@truecut/queue';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const rows = await listProjects();
  const busy = await busyProjects(rows.map((r) => r.id));
  return ok(rows.map((r) => ({ id: r.id, name: r.name, stage: r.stage, kind: r.kind, updatedAt: r.updatedAt.toISOString(), createdBy: r.createdBy, ...(r.summary as ProjectSummary), busy: busy.has(r.id) })));
});

export const POST = route(async (req: Request) => {
  // Chat-first (x-nm-chat): {action} → create the project and start Nick's first turn.
  // With files the browser creates the project first ({name}), uploads, then posts the action to /chat.
  if (req.headers.get('x-nm-chat')) {
    const p = await createProject('Untitled video');
    const action = await readAction(req);
    await updateProject(p.id, (pp) => applyOptions(pp, action));
    const job = await startTurn(p.id, action);
    return ok({ id: p.id, job: job.id }, 201);
  }
  const b = await req.json().catch(() => ({}));
  const p = await createProject(String(b.name || '').trim() || 'Untitled video');
  const jobs: string[] = [];
  for (const s of b.sources || []) {
    if (!s?.value) continue;
    const src = await addSource(p.id, s.kind, s.value, s.label);
    jobs.push((await startIngest(p.id, src.id, s.kind, s.value)).id);
  }
  return ok({ id: p.id, jobs }, 201);
});
