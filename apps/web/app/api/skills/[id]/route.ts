import { ok, route, body, fail } from '@/lib/http';
import { deleteSkill, getSkill, getSkillByName, updateSkill } from '@truecut/db';
import { skillProblem, slugify } from '@truecut/core/skills/skills';
import { canEditSkill, skillView, SkillFields } from '@/lib/skills';
export const dynamic = 'force-dynamic';
type C = { params: { id: string } };

export const PATCH = route(async (req: Request, { params }: C, u) => {
  const s = await getSkill(params.id, u.workspaceId);
  if (!s) return fail('Not found', 404);
  if (!(await canEditSkill(s, u))) return fail('Only the person who added this skill or a workspace owner can change it.', 403);
  const b = await body(req, SkillFields.partial().strict());
  const next = { name: b.name !== undefined ? slugify(b.name) : s.name, description: b.description ?? s.description, body: b.body ?? s.body };
  const problem = skillProblem(next);
  if (problem) return fail(problem, 400);
  if (next.name !== s.name && (await getSkillByName(u.workspaceId, next.name))) return fail(`Your team already has a skill called “${next.name}”.`, 409);
  const r = await updateSkill(s.id, u.workspaceId, { ...b, ...next });
  return ok(skillView({ ...r!, stages: (r!.stages as string[]) || [], createdByName: null }, u));
});

export const DELETE = route(async (_r: Request, { params }: C, u) => {
  const s = await getSkill(params.id, u.workspaceId);
  if (!s) return fail('Not found', 404);
  if (!(await canEditSkill(s, u))) return fail('Only the person who added this skill or a workspace owner can delete it.', 403);
  await deleteSkill(s.id, u.workspaceId);
  return ok({ deleted: true });
});
