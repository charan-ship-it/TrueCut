import { z } from 'zod';
import { ok, projectRoute, body } from '@/lib/http';
import { attachToProject, suggestForProject } from '@truecut/core/library/library';
import { assetView } from '@/lib/library';
import { projectMeta } from '@truecut/db';

/** Library shots come from the project's own workspace, never the viewer's other ones. */
const wsOf = async (pid: string) => (await projectMeta(pid))!.workspaceId;
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };

/** Library shots that look like they belong to this project. */
export const GET = projectRoute(async (_r: Request, { params }: C) => ok({ items: (await suggestForProject(params.id, await wsOf(params.id))).map(assetView) }));

/** Add chosen shots to the project (as visuals and sources). */
export const POST = projectRoute(async (req: Request, { params }: C) => {
  const b = await body(req, z.object({ ids: z.array(z.string().regex(/^l[a-z0-9]{6,20}$/)).min(1).max(30) }).strict());
  return ok({ added: await attachToProject(params.id, b.ids, await wsOf(params.id)) });
});
