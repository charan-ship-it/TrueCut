// Every project has a working folder on local disk:
//   <TRUECUT_DATA>/projects/<id>/  assets/ sources/ talk/ vo/ audio/ renders/
// The pipelines (ffmpeg, Chromium) read and write real files here. When a bucket is configured,
// the folder is a cache that is hydrated from and flushed to the bucket around each job (see sync.ts).
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@truecut/config';

export const SUBDIRS = ['assets', 'sources', 'talk', 'vo', 'audio', 'renders'];
export const projectsDir = () => path.join(config.dataDir, 'projects');
export function projectDir(id: string) {
  if (!/^[a-z0-9-]{3,64}$/.test(id)) throw new Error('Bad project id');
  return path.join(projectsDir(), id);
}
/** Absolute path of a file inside a project's folder; refuses anything that escapes it. */
export function projectPath(id: string, rel = '') {
  const base = projectDir(id);
  const p = path.resolve(base, rel);
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error('Path escapes project folder');
  return p;
}
export function ensureProjectDirs(id: string) { for (const d of SUBDIRS) fs.mkdirSync(path.join(projectDir(id), d), { recursive: true }); }
export function writeAtomic(file: string, data: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
export function readText(id: string, rel: string): string { const f = projectPath(id, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
export function removeProjectFiles(id: string) { fs.rmSync(projectDir(id), { recursive: true, force: true }); }
