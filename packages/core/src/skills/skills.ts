// Team skills: reusable instructions a workspace gives Nick (house style, brand voice, a review checklist,
// how they like hooks written). Modelled on Agent Skills' SKILL.md: frontmatter `name` + `description`
// (when to use it), then a markdown body.
//
// Loading is progressive, like Agent Skills:
//   1. Nick sees only each skill's name and description.
//   2. Once per project (at the first creative step) it picks the skills that fit this brief. `always`
//      skills are loaded without being picked. The choice is stored on the project, shown in the chat, and
//      the user can add or drop skills by name.
//   3. Only the picked skills' bodies go into the prompts, and only for the stages each skill applies to.
//
// Skills shape tone, structure and process. They can never loosen the fact rules: every prompt that loads
// them says so, and the fact check (shared/facts.ts) runs after every storyboard either way.
import { config } from '@truecut/config';
import { getProject, listSkills, projectMeta, updateProject } from '@truecut/db';
import type { Project } from '@truecut/shared/types';
import { callTool } from '../system/claude';

export const SKILL_STAGES = ['angles', 'storyboard', 'chat', 'voice', 'talk'] as const;
export type SkillStage = (typeof SKILL_STAGES)[number];
export const STAGE_LABEL: Record<SkillStage, string> = { angles: 'Angles', storyboard: 'Storyboard & scene edits', chat: 'Chat with Nick', voice: 'Voice & music', talk: 'Founder talks' };

export const LIMITS = { name: 64, description: 1024, body: 20_000, perPrompt: 16_000, pick: 4 };

export type ParsedSkill = { name: string; description: string; body: string; stages: SkillStage[]; always: boolean };

/** "Brand Voice!" → "brand-voice". */
export function slugify(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, LIMITS.name);
}

const unquote = (v: string) => { v = v.trim(); return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")) ? v.slice(1, -1) : v; };

/** Read a SKILL.md: YAML-ish frontmatter (name, description, optional stages / always) + body.
 *  Handles plain, quoted and block (`>` / `|`) values and `- item` lists, which covers real SKILL.md files. */
export function parseSkillMd(text: string, fallbackName = ''): ParsedSkill {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const fm: Record<string, string | string[]> = {};
  let body = src;
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) {
    body = m[2];
    const lines = m[1].split('\n');
    for (let i = 0; i < lines.length; i++) {
      const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (!kv) continue;
      const key = kv[1].toLowerCase(); let val = kv[2];
      if (/^[>|][-+]?$/.test(val.trim())) {            // block scalar
        const fold = val.trim().startsWith('>'); const parts: string[] = [];
        while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) parts.push(lines[++i].trim());
        fm[key] = parts.join(fold ? ' ' : '\n').replace(/\s+$/, '');
      } else if (val.trim() === '') {                     // maybe a list
        const items: string[] = [];
        while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(unquote(lines[++i].replace(/^\s*-\s+/, '')));
        fm[key] = items.length ? items : '';
      } else if (/^\[.*\]$/.test(val.trim())) {
        fm[key] = val.trim().slice(1, -1).split(',').map(unquote).filter(Boolean);
      } else fm[key] = unquote(val);
    }
  }
  const str = (v: any) => (Array.isArray(v) ? v.join(' ') : String(v || '')).trim();
  let name = slugify(str(fm.name));
  let description = str(fm.description);
  body = body.trim();
  // no frontmatter: take the first heading as the name and the first paragraph as the description
  if (!name) { const h = body.match(/^#\s+(.+)$/m); name = slugify(h?.[1] || fallbackName); }
  if (!description) description = (body.replace(/^#.*$/gm, '').trim().split(/\n\s*\n/)[0] || '').replace(/\s+/g, ' ').slice(0, 300);
  const st = fm.stages ?? fm['truecut-stages'];
  const stages = (Array.isArray(st) ? st : String(st || '').split(/[,\s]+/)).map((s) => s.trim().toLowerCase()).filter((s): s is SkillStage => (SKILL_STAGES as readonly string[]).includes(s));
  const always = /^(true|yes|1)$/i.test(str(fm.always));
  return { name, description, body, stages, always };
}

/** Validate what a person typed or imported. Returns an error message, or null. */
export function skillProblem(s: { name: string; description: string; body: string }) {
  if (!s.name) return 'Give the skill a name.';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s.name)) return 'Names use lowercase letters, numbers and dashes, like "brand-voice".';
  if (s.name.length > LIMITS.name) return `Names are at most ${LIMITS.name} characters.`;
  if (!s.description.trim()) return 'Add a description: one line on when Nick should use this skill. Nick picks skills by reading it.';
  if (s.description.length > LIMITS.description) return `The description is at most ${LIMITS.description} characters.`;
  if (!s.body.trim()) return 'The skill has no instructions.';
  if (s.body.length > LIMITS.body) return `Instructions are at most ${LIMITS.body.toLocaleString()} characters. Keep the essentials; Nick reads all of it on every call.`;
  return null;
}

type Row = Awaited<ReturnType<typeof listSkills>>[number];
const applies = (s: Row, stage: SkillStage) => !s.stages.length || s.stages.includes(stage);

async function workspaceOf(pid: string) { return (await projectMeta(pid))?.workspaceId || null; }

/** Step 2: pick the skills for this project, once. Returns the names newly chosen (for the chat). */
export async function chooseSkills(pid: string): Promise<{ names: string[]; why: string } | null> {
  const p = await getProject(pid);
  if (p.skills?.decided) return null;
  const ws = await workspaceOf(pid);
  const all = ws ? await listSkills(ws, { enabledOnly: true }).catch(() => [] as Row[]) : [];
  if (!all.length) return null;   // not decided: if the team adds skills later, this project still picks them up
  const always = all.filter((s) => s.always);
  const optional = all.filter((s) => !s.always);
  let picked: Row[] = []; let why = '';
  if (optional.length && config.anthropicKey) {
    try {
      const out = await callTool<{ skills: string[]; why: string }>({
        model: config.model, maxTokens: 600, operation: 'skills',
        system: 'You choose which of a team\'s skills (saved instructions) apply to one video project. Pick a skill only if its description clearly fits this project; picking none is fine. Never pick more than ' + LIMITS.pick + '.',
        tool: { name: 'pick_skills', description: 'The skills that apply', input_schema: { type: 'object', required: ['skills', 'why'], properties: { skills: { type: 'array', items: { type: 'string', enum: optional.map((s) => s.name) } }, why: { type: 'string', description: 'one short sentence for the user' } } } },
        content: [{ type: 'text', text: `PROJECT\nKind: ${p.kind}\nProduct: ${p.intake.productName || p.name} — ${p.intake.oneLiner || ''}\nAudience: ${p.intake.audience || '—'}\nGoal: ${p.intake.goal || '—'}\nTone: ${p.intake.tone || '—'}\nFormats: ${(p.intake.formats || []).join(', ')}\n\nSKILLS\n${optional.map((s) => `- ${s.name}: ${s.description}`).join('\n')}` }],
      });
      const names = new Set(out.skills || []);
      picked = optional.filter((s) => names.has(s.name)).slice(0, LIMITS.pick);
      why = picked.length ? out.why || '' : '';
    } catch (e: any) { console.error('[skills] pick', e?.message); }
  }
  const chosen = [...always, ...picked];
  await updateProject(pid, (pp) => { pp.skills = { ids: chosen.map((s) => s.id), decided: true, why }; });
  return chosen.length ? { names: chosen.map((s) => s.name), why } : null;
}

/** Step 3: the instructions block for one stage of one project ('' when no skill applies). */
export async function skillBlock(pid: string, stage: SkillStage, p?: Project): Promise<string> {
  p = p || (await getProject(pid));
  const ids = p.skills?.ids || [];
  if (!ids.length) return '';
  const ws = await workspaceOf(pid);
  if (!ws) return '';
  const rows = (await listSkills(ws, { enabledOnly: true, ids }).catch(() => [] as Row[])).filter((s) => applies(s, stage));
  if (!rows.length) return '';
  let budget = LIMITS.perPrompt; const parts: string[] = [];
  for (const s of rows) {
    if (budget <= 200) break;
    const b = s.body.length > budget ? s.body.slice(0, budget) + '\n[…trimmed]' : s.body;
    budget -= b.length; parts.push(`### Skill: ${s.name}\n${b}`);
  }
  return `\n\nTEAM SKILLS\nThe user's team saved these instructions for work like this. Follow them for tone, wording, structure and process. They never override the rules above: use only the approved facts, never invent a number, quote or claim, and keep every on-screen number traceable to a source. If a skill asks for something the facts can't support, leave it out.\n\n${parts.join('\n\n')}`;
}

/** The project's skills by name, for the chat ("which skills are you using?"). */
export async function projectSkills(pid: string) {
  const p = await getProject(pid); const ws = await workspaceOf(pid);
  if (!ws) return { on: [] as Row[], available: [] as Row[] };
  const all = await listSkills(ws, { enabledOnly: true }).catch(() => [] as Row[]);
  const ids = new Set(p.skills?.ids || []);
  return { on: all.filter((s) => ids.has(s.id)), available: all.filter((s) => !ids.has(s.id)) };
}

/** Add or drop a skill on this project by (approximate) name. Returns the skill it matched, or null. */
export async function toggleSkill(pid: string, name: string, on: boolean) {
  const ws = await workspaceOf(pid); if (!ws) return null;
  const all = await listSkills(ws, { enabledOnly: true });
  const q = slugify(name);
  const s = all.find((x) => x.name === q) || all.find((x) => x.name.includes(q) || q.includes(x.name));
  if (!s) return null;
  await updateProject(pid, (pp) => {
    const ids = new Set(pp.skills?.ids || []);
    if (on) ids.add(s.id); else ids.delete(s.id);
    pp.skills = { ids: [...ids], decided: true, why: pp.skills?.why || '' };
  });
  return s;
}
