// Keeps a project's local working folder and the bucket in step.
//   hydrate(pid)  before a job: download what is missing or changed remotely
//   flush(pid)    during/after a job: upload what changed locally, delete what the job removed
// A manifest (.truecut-sync.json in the folder) records what was last seen on both sides, so each pass
// only moves the difference. Deletes are limited to files this folder knew about: a job on another
// worker can add files to the same project without this one ever removing them.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { bucketConfig, deleteObjects, getObject, listObjects, putObject } from './bucket';
import { projectDir, ensureProjectDirs } from './files';
import { mimeOf } from './mime';

type Entry = { size: number; mtimeMs: number; etag: string };
type Manifest = Record<string, Entry>;
const MANIFEST = '.truecut-sync.json';

export function storageDriver(): 'local' | 's3' { return bucketConfig() ? 's3' : 'local'; }

const locks = new Map<string, Promise<unknown>>();
function serial<T>(pid: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(pid) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(pid, next.catch(() => {}));
  return next;
}

function readManifest(pid: string): Manifest { try { return JSON.parse(fs.readFileSync(path.join(projectDir(pid), MANIFEST), 'utf8')); } catch { return {}; } }
function writeManifest(pid: string, m: Manifest) { const f = path.join(projectDir(pid), MANIFEST); fs.writeFileSync(f + '.tmp', JSON.stringify(m)); fs.renameSync(f + '.tmp', f); }

function walk(dir: string, base = dir, out: string[] = []) {
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    if (e.name.startsWith('.') || e.name.endsWith('.tmp')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out); else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

export function hydrate(pid: string): Promise<{ downloaded: number }> {
  if (storageDriver() === 'local') { ensureProjectDirs(pid); return Promise.resolve({ downloaded: 0 }); }
  return serial(pid, async () => {
    ensureProjectDirs(pid);
    const m = readManifest(pid); const dir = projectDir(pid);
    const remote = await listObjects(pid);
    let downloaded = 0;
    for (const o of remote) {
      const file = path.join(dir, o.rel); const st = fs.existsSync(file) ? fs.statSync(file) : null; const e = m[o.rel];
      // same object as last time: keep the local file, even if a job changed it and hasn't flushed yet
      if (st && e && e.etag === o.etag) continue;
      if (st && !e && st.size === o.size) { m[o.rel] = { size: st.size, mtimeMs: st.mtimeMs, etag: o.etag }; continue; }
      const r = await getObject(pid, o.rel); if (!r?.body) continue;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.dl.tmp`;
      await pipeline(r.body, fs.createWriteStream(tmp)); fs.renameSync(tmp, file);
      const s2 = fs.statSync(file); m[o.rel] = { size: s2.size, mtimeMs: s2.mtimeMs, etag: o.etag }; downloaded++;
    }
    // objects deleted elsewhere (another worker, or the project was deleted): drop our copy too, unless
    // this folder changed the file since (then the next flush uploads it as new)
    const live = new Set(remote.map((o) => o.rel));
    for (const k of Object.keys(m)) {
      if (live.has(k)) continue;
      const file = path.join(dir, k); const st = fs.existsSync(file) ? fs.statSync(file) : null;
      if (st && st.size === m[k].size && st.mtimeMs === m[k].mtimeMs) fs.rmSync(file, { force: true });
      delete m[k];
    }
    writeManifest(pid, m);
    return { downloaded };
  });
}

/** Upload local changes. `settleMs` skips files written very recently (still being written) on mid-job passes. */
export function flush(pid: string, opts: { settleMs?: number } = {}): Promise<{ uploaded: number; deleted: number }> {
  if (storageDriver() === 'local') return Promise.resolve({ uploaded: 0, deleted: 0 });
  return serial(pid, async () => {
    const dir = projectDir(pid); if (!fs.existsSync(dir)) return { uploaded: 0, deleted: 0 };
    const m = readManifest(pid); const now = Date.now();
    const files = walk(dir); const seen = new Set(files);
    let uploaded = 0;
    for (const rel of files) {
      const st = fs.statSync(path.join(dir, rel)); const e = m[rel];
      if (e && e.size === st.size && e.mtimeMs === st.mtimeMs) continue;
      if (opts.settleMs && now - st.mtimeMs < opts.settleMs) continue;
      const etag = await putObject(pid, rel, fs.createReadStream(path.join(dir, rel)), mimeOf(rel));
      m[rel] = { size: st.size, mtimeMs: st.mtimeMs, etag }; uploaded++;
    }
    const gone = Object.keys(m).filter((k) => !seen.has(k));
    if (!opts.settleMs) { await deleteObjects(pid, gone); for (const k of gone) delete m[k]; }
    writeManifest(pid, m);
    return { uploaded, deleted: opts.settleMs ? 0 : gone.length };
  });
}

/** Store one file (an upload from the browser) in the project: local folder, then bucket. */
export async function saveFile(pid: string, rel: string, src: NodeJS.ReadableStream | Buffer): Promise<{ size: number }> {
  ensureProjectDirs(pid);
  const file = path.join(projectDir(pid), rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.up.tmp`;
  try { if (Buffer.isBuffer(src)) fs.writeFileSync(tmp, src); else await pipeline(src, fs.createWriteStream(tmp)); }
  catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
  fs.renameSync(tmp, file);
  const st = fs.statSync(file);
  if (storageDriver() === 's3') {
    // the bucket is the copy that matters; the web app doesn't keep large uploads on its own disk
    try { await serial(pid, () => putObject(pid, rel, fs.createReadStream(file), mimeOf(rel))); }
    finally { fs.rmSync(file, { force: true }); }
  }
  return { size: st.size };
}

export async function removeProject(pid: string) {
  if (storageDriver() === 's3') { const all = await listObjects(pid); await deleteObjects(pid, all.map((o) => o.rel)); }
  fs.rmSync(projectDir(pid), { recursive: true, force: true });
}
