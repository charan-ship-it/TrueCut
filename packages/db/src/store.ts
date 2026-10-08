// File-based project store. One folder per project:
//   data/projects/<id>/project.json, assets/, sources/, vo/, audio/, renders/
import fs from 'node:fs';
import path from 'node:path';
import { customAlphabet } from 'nanoid';
import { config } from '@truecut/config';
import { Project } from '@truecut/shared/types';

export const newId = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 10);
export const projectsDir = () => path.join(config.dataDir, 'projects');
export const projectDir = (id: string) => {
  if (!/^[a-z0-9-]{3,64}$/.test(id)) throw new Error('Bad project id');
  return path.join(projectsDir(), id);
};
export const projectPath = (id: string, rel = '') => {
  const base = projectDir(id);
  const p = path.resolve(base, rel);
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error('Path escapes project folder');
  return p;
};

function writeAtomic(file: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
export { writeAtomic };

export function listProjects(): Project[] {
  const dir = projectsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'project.json')))
    .map((d) => { try { return getProject(d); } catch { return null; } })
    .filter((p): p is Project => !!p)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProject(id: string): Project {
  const f = path.join(projectDir(id), 'project.json');
  if (!fs.existsSync(f)) throw new Error('Project not found');
  return Project.parse(JSON.parse(fs.readFileSync(f, 'utf8')));
}

export function saveProject(p: Project): Project {
  p.updatedAt = new Date().toISOString();
  const parsed = Project.parse(p);
  writeAtomic(path.join(projectDir(p.id), 'project.json'), JSON.stringify(parsed, null, 2));
  return parsed;
}

export function createProject(name: string, id?: string): Project {
  const now = new Date().toISOString();
  const pid = id || newId();
  for (const sub of ['assets', 'sources', 'vo', 'audio', 'renders']) fs.mkdirSync(path.join(projectDir(pid), sub), { recursive: true });
  return saveProject(Project.parse({ id: pid, name: name || 'Untitled video', createdAt: now, updatedAt: now }));
}

export function updateProject(id: string, fn: (p: Project) => void | Project): Project {
  const p = getProject(id);
  const r = fn(p);
  return saveProject((r as Project) || p);
}

export function deleteProject(id: string) {
  fs.rmSync(projectDir(id), { recursive: true, force: true });
}

export function readText(id: string, rel: string): string {
  const f = projectPath(id, rel);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}

/** All extracted source text, labelled per source, for the AI and the fact checker. */
export function corpus(p: Project, max = 160_000): string {
  let out = '';
  for (const s of p.sources) {
    if (s.status !== 'ready' || !s.textFile) continue;
    const t = readText(p.id, s.textFile);
    out += `\n\n===== SOURCE ${s.id} · ${s.kind} · ${s.label} =====\n${t}`;
    if (out.length > max) break;
  }
  return out.slice(0, max);
}
