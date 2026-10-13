import { z } from 'zod';
import { SKILL_STAGES } from '@truecut/core/skills/skills';
import { roleOf } from './auth';

type U = { id: string; workspaceId: string };
export const skillView = (s: any, u: U) => ({
  id: s.id, name: s.name, description: s.description, body: s.body, stages: s.stages || [], always: s.always, enabled: s.enabled,
  source: s.source, createdBy: s.createdByName || null, mine: !!u.id && s.createdBy === u.id, updatedAt: s.updatedAt,
});
export async function canEditSkill(s: { createdBy: string | null }, u: U) {
  return (!!u.id && s.createdBy === u.id) || (await roleOf(u)) === 'owner';
}

const Stage = z.enum(SKILL_STAGES);
export const SkillFields = z.object({
  name: z.string().max(200), description: z.string().max(4000), body: z.string().max(60_000),
  stages: z.array(Stage).max(SKILL_STAGES.length).optional(), always: z.boolean().optional(), enabled: z.boolean().optional(),
});
