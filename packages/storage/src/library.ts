// Files for the team screenshot library: <bucket>/library/<workspace>/<asset>.<ext>, or the same path
// under <TRUECUT_DATA> with local storage. Kept apart from projects so a shot can be used by many videos.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { config } from '@truecut/config';
import { putKey, getKey, deleteKeys, copyKey, signedKeyUrl, keyOf } from './bucket';
import { storageDriver } from './sync';
import { projectPath, ensureProjectDirs } from './files';
import { mimeOf } from './mime';

const SAFE = /^[a-zA-Z0-9_-]{2,64}$/;
export function libraryKey(workspaceId: string, file: string) {
  if (!SAFE.test(workspaceId)) throw new Error('Bad workspace id');
  if (!/^[a-zA-Z0-9_.-]{3,100}$/.test(file) || file.includes('..')) throw new Error('Bad library file name');
  return `library/${workspaceId}/${file}`;
}
const localPath = (key: string) => path.join(config.dataDir, key);

export async function putLibraryFile(workspaceId: string, file: string, data: Buffer) {
  const key = libraryKey(workspaceId, file);
  if (storageDriver() === 's3') { await putKey(key, data, mimeOf(file)); return key; }
  const p = localPath(key); fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p + '.tmp', data); fs.renameSync(p + '.tmp', p);
  return key;
}

export async function readLibraryFile(workspaceId: string, file: string): Promise<Buffer | null> {
  const key = libraryKey(workspaceId, file);
  if (storageDriver() === 's3') {
    const o = await getKey(key); if (!o?.body) return null;
    const chunks: Buffer[] = []; for await (const c of o.body as Readable) chunks.push(Buffer.from(c)); return Buffer.concat(chunks);
  }
  const p = localPath(key); return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

/** Response for the browser: a signed redirect with a bucket, the bytes with local storage. */
export async function libraryFileResponse(workspaceId: string, file: string): Promise<Response> {
  const key = libraryKey(workspaceId, file);
  if (storageDriver() === 's3') return new Response(null, { status: 302, headers: { location: await signedKeyUrl(key, { seconds: 3600, type: mimeOf(file) }), 'cache-control': 'private, max-age=600' } });
  const p = localPath(key);
  if (!fs.existsSync(p)) return new Response('Not found', { status: 404 });
  return new Response(fs.readFileSync(p), { headers: { 'content-type': mimeOf(file), 'cache-control': 'private, max-age=3600' } });
}

export async function deleteLibraryFiles(workspaceId: string, files: string[]) {
  const keys = files.filter(Boolean).map((f) => libraryKey(workspaceId, f));
  if (storageDriver() === 's3') return deleteKeys(keys);
  for (const k of keys) fs.rmSync(localPath(k), { force: true });
}

/** Put a library file into a project's folder as `rel` (server-side copy with a bucket). */
export async function copyLibraryFileToProject(workspaceId: string, file: string, projectId: string, rel: string) {
  const key = libraryKey(workspaceId, file);
  ensureProjectDirs(projectId);
  if (storageDriver() === 's3') { await copyKey(key, keyOf(projectId, rel)); return; }
  fs.copyFileSync(localPath(key), projectPath(projectId, rel));
}
