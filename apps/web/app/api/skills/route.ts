import { z } from 'zod';
import { ok, route, body, fail } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { createSkill, getSkillByName, listSkills } from '@truecut/db';
import { parseSkillMd, skillProblem, slugify, SKILL_STAGES, STAGE_LABEL, LIMITS } from '@truecut/core/skills/skills';
import { skillView, SkillFields } from '@/lib/skills';
import { BUILTIN_SKILLS, BUILTIN_GROUPS, builtinById } from '@truecut/core/skills/builtin';
export const dynamic = 'force-dynamic';

export const GET = route(async (_r: Request, _c: any, u) => {
  const items = await listSkills(u.workspaceId);
  const have = new Set(items.map((s) => s.name));
  const library = BUILTIN_SKILLS.map((b) => ({ id: b.id, group: b.group, name: b.name, description: b.description, stages: b.stages, body: b.body, added: have.has(b.name) }));
  return ok({ items: items.map((s) => skillView(s, u)), library, groups: BUILTIN_GROUPS, stages: SKILL_STAGES.map((k) => ({ id: k, label: STAGE_LABEL[k] })), limits: LIMITS });
});

// either the fields, or a SKILL.md to import
const Create = z.union([SkillFields.strict(), z.object({ markdown: z.string().max(80_000), filename: z.string().max(200).optional() }).strict(), z.object({ builtin: z.array(z.string().max(64)).min(1).max(40) }).strict()]);

export const POST = route(async (req: Request, _c: any, u) => {
  rateLimit('skills', u.id);
  const b = await body(req, Create);
  if ('builtin' in b) {
    // add pre-built skills: copied into the workspace so the team can edit them; names already taken are skipped
    const added: any[] = [];
    for (const id of [...new Set(b.builtin)]) {
      const sk = builtinById(id);
      if (!sk) return fail(`Unknown pre-built skill “${id}”.`, 400);
      if (await getSkillByName(u.workspaceId, sk.name)) continue;
      const s = await createSkill(u.workspaceId, u.id || null, { name: sk.name, description: sk.description, body: sk.body, stages: sk.stages, source: 'builtin' });
      added.push(skillView({ ...s, stages: (s.stages as string[]) || [], createdByName: null }, u));
    }
    return ok({ added }, 201);
  }
  const imported = 'markdown' in b;
  const v = imported ? parseSkillMd(b.markdown, (b.filename || '').replace(/\.(md|markdown|txt)$/i, '').replace(/^skill$/i, '')) : { ...b, name: slugify(b.name), stages: b.stages || [], always: !!b.always };
  const problem = skillProblem(v);
  if (problem) return fail(imported ? `Couldn't import that file: ${problem}` : problem, 400);
  if (await getSkillByName(u.workspaceId, v.name)) return fail(`Your team already has a skill called “${v.name}”. Rename one of them.`, 409);
  const s = await createSkill(u.workspaceId, u.id || null, { ...v, enabled: imported ? true : (b as any).enabled ?? true, source: imported ? 'import' : 'manual' });
  return ok(skillView({ ...s, stages: (s.stages as string[]) || [], createdByName: null }, u), 201);
});
