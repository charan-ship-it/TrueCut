// ffmpeg / ffprobe helpers (static binaries shipped via npm, so no system install is needed).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export function ffmpegPath(): string {
  if (process.env.NICK_MOTION_FFMPEG) return process.env.NICK_MOTION_FFMPEG;
  try { const p = require('ffmpeg-static'); if (p && fs.existsSync(p)) return p; } catch {}
  return 'ffmpeg';
}
export function run(bin: string, args: string[], opts: { input?: Buffer } = {}): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const ch = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = []; let err = '';
    ch.stdout.on('data', (d) => out.push(d));
    ch.stderr.on('data', (d) => { err += d.toString(); if (err.length > 200_000) err = err.slice(-100_000); });
    ch.on('error', reject);
    ch.on('close', (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out), stderr: err }));
    if (opts.input) ch.stdin.end(opts.input); else ch.stdin.end();
  });
}

export async function ffmpeg(args: string[], input?: Buffer) {
  const r = await run(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { input });
  if (r.code !== 0) throw new Error('ffmpeg failed: ' + r.stderr.slice(-800));
  return r.stdout;
}

export async function probeDuration(file: string): Promise<number> {
  // ffmpeg prints "Duration: 00:00:02.35" for any media file (no ffprobe needed)
  const r = await run(ffmpegPath(), ['-hide_banner', '-i', file]);
  const m = r.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (m) return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
  const pcm = await decodeAudio(file, 8000); return pcm.length / 8000;
}

/** Decode any audio file to mono float32 PCM at `sr`. */
export async function decodeAudio(file: string, sr = 48000): Promise<Float32Array> {
  const buf = await ffmpeg(['-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-']);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)).slice();
}

/** Resize/convert an image to JPEG with max width (used for screenshots and AI vision payloads). */
export async function toJpeg(src: string, dst: string, maxW = 2000, q = 3) {
  await ffmpeg(['-i', src, '-vf', `scale='min(${maxW},iw)':-2`, '-q:v', String(q), '-frames:v', '1', dst]);
}

export function ffmpegWorks(): boolean {
  try { return spawnSync(ffmpegPath(), ['-version']).status === 0; } catch { return false; }
}
