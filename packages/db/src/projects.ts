// Projects. The whole project document lives in projects.data (validated by the shared zod schema);
// updates take a row lock so the web app and the worker can both edit a project without losing writes.
import { desc, eq } from 'drizzle-orm';
import { Project } from '@truecut/shared/types';
import { db } from './client';
import { projects } from './schema';
import { newId } from './ids';
import { DEFAULT_WORKSPACE_ID, ensureDefaultWorkspace } from './workspaces';

export type ProjectSummary = ReturnType<typeof summarize>;

/** Small listing view kept beside the document (so the sidebar never loads every chat). */
export function summarize(p: Project) {
  const last = [...p.chat].reverse().find((m) => m.text);
  return {
    scenes: p.scenes.length, beats: p.talk?.beats?.length || 0, renders: p.renders.length,
    thumb: (p.product as any)?.poster || p.visuals.find((v) => v.use && v.kind === 'screenshot')?.file || p.visuals[0]?.file || p.talk?.media?.[0]?.poster || null,
    video: p.renders[0]?.file || null, style: p.style?.preset || 'signal', favorite: !!p.favorite, length: p.intake.length, last: last?.text?.slice(0, 120) || '',
  };
}

export class NotFound extends Error { constructor() { super('Project not found'); } }

export async function getProject(id: string): Promise<Project> {
  const [row] = await db().select({ data: projects.data }).from(projects).where(eq(projects.id, id)).limit(1);
  if (!row) throw new NotFound();
  return Project.parse(row.data);
}

/** Owner/workspace columns for access checks. */
export async function projectMeta(id: string) {
  const [row] = await db().select({ id: projects.id, workspaceId: projects.workspaceId, createdBy: projects.createdBy }).from(projects).where(eq(projects.id, id)).limit(1);
  return row || null;
}

export async function createProject(name: string, opts: { id?: string; workspaceId?: string; createdBy?: string | null } = {}): Promise<Project> {
  const ws = opts.workspaceId || (await ensureDefaultWorkspace());
  const now = new Date().toISOString();
  const p = Project.parse({ id: opts.id || newId(), name: name || 'Untitled video', createdAt: now, updatedAt: now });
  await db().insert(projects).values({ id: p.id, workspaceId: ws, createdBy: opts.createdBy || null, name: p.name, kind: p.kind, stage: p.stage, data: p, summary: summarize(p) });
  return p;
}

/** Read-modify-write under a row lock. `fn` must be synchronous (it runs inside the transaction). */
export async function updateProject(id: string, fn: (p: Project) => void | Project): Promise<Project> {
  return db().transaction(async (tx: any) => {
    const [row] = await tx.select({ data: projects.data }).from(projects).where(eq(projects.id, id)).for('update').limit(1);
    if (!row) throw new NotFound();
    const p = Project.parse(row.data);
    const r = fn(p);
    const next = Project.parse({ ...((r as Project) || p), updatedAt: new Date().toISOString() });
    await tx.update(projects).set({ data: next, name: next.name, kind: next.kind, stage: next.stage, summary: summarize(next), updatedAt: new Date(next.updatedAt) }).where(eq(projects.id, id));
    return next;
  });
}

export async function listProjects(workspaceId = DEFAULT_WORKSPACE_ID) {
  return db().select({ id: projects.id, name: projects.name, kind: projects.kind, stage: projects.stage, summary: projects.summary, createdBy: projects.createdBy, updatedAt: projects.updatedAt, createdAt: projects.createdAt })
    .from(projects).where(eq(projects.workspaceId, workspaceId)).orderBy(desc(projects.updatedAt)).limit(500);
}

export async function deleteProject(id: string) { await db().delete(projects).where(eq(projects.id, id)); }

/** Import a project document as-is (used by tools/import-projects.ts). */
export async function importProject(p: Project, opts: { workspaceId?: string; createdBy?: string | null } = {}) {
  const ws = opts.workspaceId || (await ensureDefaultWorkspace());
  const parsed = Project.parse(p);
  await db().insert(projects).values({ id: parsed.id, workspaceId: ws, createdBy: opts.createdBy || null, name: parsed.name, kind: parsed.kind, stage: parsed.stage, data: parsed, summary: summarize(parsed), createdAt: new Date(parsed.createdAt || Date.now()), updatedAt: new Date(parsed.updatedAt || Date.now()) })
    .onConflictDoUpdate({ target: projects.id, set: { data: parsed, name: parsed.name, kind: parsed.kind, stage: parsed.stage, summary: summarize(parsed) } });
}
