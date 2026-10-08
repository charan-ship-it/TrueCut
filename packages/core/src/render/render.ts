// Frame-accurate renderer: headless Chromium plays the exact same player used for preview,
// frame by frame, split across parallel workers; ffmpeg encodes, concatenates and muxes audio.
import { withRenderSlot } from './slots';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, config } from '@truecut/config';
import { getProject, updateProject, newId } from '@truecut/db';
import { projectDir, projectPath } from '@truecut/storage';
import { ffmpeg, ffmpegPath } from './media';
import { toComposition, projectLayout } from '@truecut/shared/compose';
import { buildAudio } from '../audio/soundtrack';
import { launchBrowser } from './browser';
import { FORMATS } from '@truecut/engine/timeline.js';
import type { FormatId, Project, RenderOut } from '@truecut/shared/types';
import type { Log } from '@truecut/queue';

const FPS = 30;
const MIME: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

/** The renderer files (player.html, runtime.js, talk.js, fonts…) served to headless Chromium. */
export function engineDir() { return path.join(ROOT, 'packages', 'engine', 'src'); }

/** Tiny static server: /engine/* → engine, /p/* → project folder. */
export async function staticServer(pid: string) {
  const roots: Record<string, string> = { '/engine/': engineDir(), '/p/': projectDir(pid) };
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '').split('?')[0]);
    const k = Object.keys(roots).find((r) => u.startsWith(r));
    if (!k) { res.writeHead(404); res.end(); return; }
    const f = path.resolve(roots[k], u.slice(k.length));
    if (!f.startsWith(roots[k]) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as any).port as number;
  return { base: `http://127.0.0.1:${port}`, close: () => srv.close() };
}

function encoder(out: string, fps: number) {
  const ch = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(fps), out], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = ''; ch.stderr.on('data', (d) => (err += d));
  const done = new Promise<void>((res, rej) => ch.on('close', (c) => (c === 0 ? res() : rej(new Error('encoder: ' + err.slice(-500))))));
  const write = (b: Buffer) => new Promise<void>((res) => { if (!ch.stdin.write(b)) ch.stdin.once('drain', () => res()); else res(); });
  return { write, end: async () => { ch.stdin.end(); await done; } };
}

export const slug = (s: string) => (s || 'video').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';

export function renderProject(pid: string, formats: FormatId[], log: Log) {
  return withRenderSlot(() => renderProjectNow(pid, formats, log), () => log('Waiting for a free render slot…'));
}
async function renderProjectNow(pid: string, formats: FormatId[], log: Log) {
  let p = await getProject(pid);
  if (!p.scenes.length) throw new Error('Storyboard is empty.');
  log('Building soundtrack…', 2);
  const audio = await buildAudio(pid, (m) => log(m, 3));
  p = await getProject(pid);
  const comp = toComposition(p);
  const L = projectLayout(p);
  const total = Math.ceil(L.duration * FPS);
  const workers = config.workers || Math.max(1, Math.min(6, Math.floor(os.cpus().length / 2)));
  const srv = await staticServer(pid);
  const browser = await launchBrowser();
  const outs: RenderOut[] = [];
  const name = slug(p.intake.productName || p.name);
  const tmp = projectPath(pid, `renders/.tmp-${newId().slice(0, 6)}`); fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const [fi, fmt] of formats.entries()) {
      const dims = FORMATS[fmt];
      const chunk = Math.ceil(total / workers);
      let doneFrames = 0;
      const base = (fi / formats.length) * 100;
      log(`Rendering ${fmt} (${dims.w}×${dims.h}) on ${workers} workers…`, base + 5);
      await Promise.all(Array.from({ length: workers }, async (_, w) => {
        const a = w * chunk, b = Math.min(total, a + chunk); if (a >= b) return;
        const page = await browser.newPage({ viewport: { width: dims.w, height: dims.h } });
        page.on('pageerror', (e) => console.error('[player]', e.message));
        await page.addInitScript((c) => { (window as any).__COMP__ = c; }, comp);
        await page.goto(`${srv.base}/engine/player.html?render=1&format=${fmt}&assetBase=/p/`);
        await page.waitForFunction(() => (window as any).ready, null, { timeout: 60000 });
        await page.evaluate(() => (window as any).ready);
        const enc = encoder(path.join(tmp, `${fmt}-${String(w).padStart(2, '0')}.mp4`), FPS);
        for (let f = a; f < b; f++) {
          await page.evaluate((t) => (window as any).render(t), f / FPS);
          await enc.write(await page.screenshot({ type: 'jpeg', quality: 93 }));
          doneFrames++;
          if (doneFrames % 15 === 0) log(`${fmt}: frame ${doneFrames}/${total}`, base + 5 + (doneFrames / total) * (85 / formats.length));
        }
        await enc.end(); await page.close();
      }));
      const list = path.join(tmp, `${fmt}.txt`);
      fs.writeFileSync(list, fs.readdirSync(tmp).filter((f) => f.startsWith(fmt + '-') && f.endsWith('.mp4')).sort().map((f) => `file '${path.join(tmp, f)}'`).join('\n'));
      const silent = path.join(tmp, `${fmt}-video.mp4`);
      await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
      const rel = `renders/${name}_${L.duration.toFixed(0)}s_${fmt}.mp4`;
      log(`Mixing audio into ${fmt}…`, base + 95 / formats.length);
      await ffmpeg(['-i', silent, '-i', projectPath(pid, audio), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-t', L.duration.toFixed(3), projectPath(pid, rel)]);
      outs.push({ id: 'r' + newId().slice(0, 6), format: fmt, file: rel, at: new Date().toISOString(), duration: L.duration, bytes: fs.statSync(projectPath(pid, rel)).size, srt: `renders/${name}.srt` });
    }
  } finally { await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  fs.writeFileSync(projectPath(pid, `renders/${name}.srt`), srt(L));
  fs.writeFileSync(projectPath(pid, `renders/${name}_FACTS.md`), factsLedger(await getProject(pid)));
  await updateProject(pid, (pp) => { pp.renders = [...outs, ...pp.renders.filter((r) => !outs.some((o) => o.file === r.file))]; pp.stage = 'done'; });
  log(`Done: ${outs.map((o) => o.format).join(', ')}`, 100);
  return outs;
}

const ts = (x: number) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
export function srt(L: any) { return L.captions.map((c: any, i: number) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end + 0.4)}\n${c.words.map((w: any) => w.w).join(' ')}\n`).join('\n'); }

export function factsLedger(p: Project) {
  const lines = [`# ${p.intake.productName || p.name} — facts used in this video`, '', `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by TrueCut. Every on-screen number and claim should trace to a row below.`, '', '| Scene | Spoken line | Facts | Status | Source quote |', '|---|---|---|---|---|'];
  p.scenes.forEach((s, i) => {
    const fs_ = (s.facts || []).map((id) => p.facts.find((f) => f.id === id)).filter(Boolean) as any[];
    if (!fs_.length) lines.push(`| ${i + 1} · ${s.type} | ${s.vo?.text || ''} | — | — | — |`);
    fs_.forEach((f, k) => lines.push(`| ${k ? '' : `${i + 1} · ${s.type}`} | ${k ? '' : s.vo?.text || ''} | ${f.statement.replace(/\|/g, '/')} | ${f.status} | “${String(f.quote).replace(/\|/g, '/').slice(0, 160)}” — ${f.where || f.sourceId || ''} |`));
  });
  lines.push('', '## Sources', ...p.sources.map((s) => `- ${s.kind}: ${s.ref}`));
  return lines.join('\n');
}
