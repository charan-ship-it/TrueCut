import { z } from 'zod';
import { ok, route, body, fail } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { createSkill, getSkillByName, listSkills } from '@truecut/db';
import { parseSkillMd, skillProblem, slugify, SKILL_STAGES, STAGE_LABEL, LIMITS } from '@truecut/core/skills/skills';
import { skillView, SkillFields } from '@/lib/skills';
export const dynamic = 'force-dynamic';

export const GET = route(async (_r: Request, _c: any, u) => {
  const items = await listSkills(u.workspaceId);
  return ok({ items: items.map((s) => skillView(s, u)), stages: SKILL_STAGES.map((k) => ({ id: k, label: STAGE_LABEL[k] })), limits: LIMITS });
});

// either the fields, or a SKILL.md to import
const Create = z.union([SkillFields.strict(), z.object({ markdown: z.string().max(80_000), filename: z.string().max(200).optional() }).strict()]);

export const POST = route(async (req: Request, _c: any, u) => {
  rateLimit('skills', u.id);
  const b = await body(req, Create);
  const imported = 'markdown' in b;
  const v = imported ? parseSkillMd(b.markdown, (b.filename || '').replace(/\.(md|markdown|txt)$/i, '').replace(/^skill$/i, '')) : { ...b, name: slugify(b.name), stages: b.stages || [], always: !!b.always };
  const problem = skillProblem(v);
  if (problem) return fail(imported ? `Couldn't import that file: ${problem}` : problem, 400);
  if (await getSkillByName(u.workspaceId, v.name)) return fail(`Your team already has a skill called “${v.name}”. Rename one of them.`, 409);
  const s = await createSkill(u.workspaceId, u.id || null, { ...v, enabled: imported ? true : (b as any).enabled ?? true, source: imported ? 'import' : 'manual' });
  return ok(skillView({ ...s, stages: (s.stages as string[]) || [], createdByName: null }, u), 201);
});
