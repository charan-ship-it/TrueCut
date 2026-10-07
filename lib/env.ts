// Environment loading shared by the Next server and the CLI scripts.
// Besides .env.local/.env, TRUECUT_ENV_FILES may list other env files (comma-separated,
// relative to this folder) from which ONLY the allow-listed keys are imported — so an existing
// key file (e.g. ../linkedin-nick/.env) can be reused without copying the secret.
import fs from 'node:fs';
import path from 'node:path';

const ALLOW = ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'];
let loaded = false;

export const ROOT = process.env.TRUECUT_ROOT || process.env.NICK_MOTION_ROOT || process.cwd();

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

export function env(name: string, fallback = ''): string {
  loadEnv();
  // TRUECUT_* is the current prefix; NICK_MOTION_* is still honoured for older setups
  const alt = name.startsWith('NICK_MOTION_') ? 'TRUECUT_' + name.slice(12) : '';
  return (alt && process.env[alt]) || process.env[name] || fallback;
}

export const config = {
  get dataDir() { return path.resolve(ROOT, env('NICK_MOTION_DATA', 'data')); },
  get model() { return env('NICK_MOTION_MODEL', 'claude-sonnet-4-6'); },
  get creativeModel() { return env('NICK_MOTION_CREATIVE_MODEL', env('NICK_MOTION_MODEL', 'claude-sonnet-4-6')); },
  get anthropicKey() { return env('ANTHROPIC_API_KEY'); },
  get elevenKey() { return env('ELEVENLABS_API_KEY'); },
  get defaultVoice() { return env('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL'); },
  get chromium() { return env('NICK_MOTION_CHROMIUM') || undefined; },
  get workers() { const n = Number(env('NICK_MOTION_WORKERS', '0')); return n > 0 ? n : 0; },
};
