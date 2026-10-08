// Environment loading shared by the web app, the worker and the tools.
// Reads <repo>/.env.local and <repo>/.env. TRUECUT_ENV_FILES may list other env files (comma-separated,
// relative to the repo root) from which ONLY the allow-listed API keys are imported, so an existing key
// file can be reused locally without copying the secret. On a host like Railway, set variables directly.
import fs from 'node:fs';
import path from 'node:path';

const ALLOW = ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'];
let loaded = false;

/** The monorepo root (the folder whose package.json declares workspaces), whatever the current app's cwd. */
function findRoot(): string {
  if (process.env.TRUECUT_ROOT) return path.resolve(process.env.TRUECUT_ROOT);
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try { const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); if (pj.workspaces) return dir; } catch {}
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  return process.cwd();
}
export const ROOT = findRoot();

function parse(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  for (const f of ['.env.local', '.env']) {
    const kv = parse(path.join(ROOT, f));
    for (const [k, v] of Object.entries(kv)) if (process.env[k] === undefined) process.env[k] = v;
  }
  const extra = (process.env.TRUECUT_ENV_FILES || process.env.NICK_MOTION_ENV_FILES || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const f of extra) {
    const kv = parse(path.resolve(ROOT, f));
    for (const k of ALLOW) if (!process.env[k] && kv[k]) process.env[k] = kv[k];
  }
}

/** Read a variable. TRUECUT_* is canonical; the legacy NICK_MOTION_* spelling is still honoured. */
export function env(name: string, fallback = ''): string {
  loadEnv();
  const legacy = name.startsWith('TRUECUT_') ? 'NICK_MOTION_' + name.slice(8) : '';
  return process.env[name] || (legacy && process.env[legacy]) || fallback;
}

export const config = {
  get dataDir() { return path.resolve(ROOT, env('TRUECUT_DATA', 'data')); },
  get model() { return env('TRUECUT_MODEL', 'claude-sonnet-4-6'); },
  get creativeModel() { return env('TRUECUT_CREATIVE_MODEL', env('TRUECUT_MODEL', 'claude-sonnet-4-6')); },
  get anthropicKey() { return env('ANTHROPIC_API_KEY'); },
  get elevenKey() { return env('ELEVENLABS_API_KEY'); },
  get defaultVoice() { return env('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL'); },
  get chromium() { return env('TRUECUT_CHROMIUM') || undefined; },
  get ffmpeg() { return env('TRUECUT_FFMPEG') || undefined; },
  get workers() { const n = Number(env('TRUECUT_WORKERS', '0')); return n > 0 ? n : 0; },
};
