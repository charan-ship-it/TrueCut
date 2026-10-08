// Source ingestion: URL (crawl + real screenshots), local folder/repo path, uploads, pasted text.
import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';
import type { Page } from 'playwright';
import { launchBrowser } from '../render/browser';
import { getProject, updateProject, newId } from '@truecut/db';
import { projectPath, writeAtomic, ensureProjectDirs, storageDriver } from '@truecut/storage';
import { env } from '@truecut/config';
import { toJpeg } from '../render/media';
import type { Source, Visual } from '@truecut/shared/types';

type Log = (msg: string, pct?: number) => void;
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MEDIA_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const TXT_EXT = new Set(['.md', '.mdx', '.txt', '.csv', '.html', '.htm', '.rst', '.vtt', '.srt']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage', '.venv', 'venv', '__pycache__', '.turbo', '.cache', 'vendor', '.idea', '.vscode', 'tmp', 'data']);

async function setSource(pid: string, sid: string, patch: Partial<Source>) {
  await updateProject(pid, (p) => { const s = p.sources.find((x) => x.id === sid); if (s) Object.assign(s, patch); });
}
async function addVisuals(pid: string, vs: Visual[]) {
  if (!vs.length) return;
  await updateProject(pid, (p) => { for (const v of vs) if (!p.visuals.find((x) => x.file === v.file)) p.visuals.push(v); });
}
function sizeOf(file: string) { try { const d = imageSize(fs.readFileSync(file)); return { w: d.width || 0, h: d.height || 0 }; } catch { return { w: 0, h: 0 }; } }
const clean = (s: string) => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// ───────────────────────── URL ─────────────────────────
const PRIORITY = ['product', 'feature', 'pricing', 'how', 'platform', 'solution', 'customer', 'case', 'use-case', 'about', 'why', 'demo', 'integrat', 'security', 'blog'];

async function dismissBanners(page: Page) {
  for (const label of ['Accept all', 'Accept', 'I agree', 'Agree', 'Got it', 'OK', 'Allow all']) {
    try { const b = page.getByRole('button', { name: label, exact: false }).first(); if (await b.isVisible({ timeout: 300 })) { await b.click({ timeout: 800 }); await page.waitForTimeout(300); return; } } catch {}
  }
}

// Plain-JS string so no bundler helpers (e.g. tsx's __name) leak into the page context.
const EXTRACT_JS = `(() => {
  const meta = (n) => (document.querySelector('meta[name="' + n + '"],meta[property="' + n + '"]') || {}).content || '';
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } };
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: abs(a.getAttribute('href') || ''), text: (a.textContent || '').trim().slice(0, 60) }))
    .filter((l) => l.href.startsWith(location.origin) && !l.href.includes('#') && !/\\.(pdf|zip|png|jpg|svg)$/i.test(l.href));
  const logos = [...document.querySelectorAll('header img, nav img, a[href="/"] img, img[alt*="logo" i], img[src*="logo" i], img[class*="logo" i]')]
    .map((i) => abs(i.currentSrc || i.src)).filter(Boolean).slice(0, 3);
  const s = document.querySelector('header svg, nav svg, a[href="/"] svg');
  const svgLogo = s && s.getBoundingClientRect().width > 40 ? s.outerHTML.slice(0, 20000) : '';
  const counts = {};
  for (const el of [...document.querySelectorAll('button, a')].slice(0, 400)) {
    const c = getComputedStyle(el).backgroundColor; const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/);
    if (!m || (m[4] && +m[4] < 0.5)) continue; const r = +m[1], g = +m[2], b = +m[3]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 60 || mx < 80) continue; const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join(''); counts[hex] = (counts[hex] || 0) + 1;
  }
  const brandColor = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [''])[0];
  const heads = [...document.querySelectorAll('h1,h2,h3')].map((h) => (h.textContent || '').trim()).filter(Boolean).slice(0, 40);
  return { title: document.title, description: meta('description') || meta('og:description'), siteName: meta('og:site_name'),
    themeColor: meta('theme-color'), ogImage: abs(meta('og:image')), logos, svgLogo, brandColor, heads,
    text: ((document.body && document.body.innerText) || '').slice(0, 30000), links, height: document.documentElement.scrollHeight };
})()`;
type Extracted = { title: string; description: string; siteName: string; themeColor: string; ogImage: string; logos: string[]; svgLogo: string; brandColor: string; heads: string[]; text: string; links: { href: string; text: string }[]; height: number };
async function extract(page: Page): Promise<Extracted> { return page.evaluate(EXTRACT_JS) as Promise<Extracted>; }

export async function ingestUrl(pid: string, sid: string, url: string, log: Log, maxPages = 4) {
  const browser = await launchBrowser();
  const visuals: Visual[] = [];
  let text = '';
  const pages: { url: string; title: string }[] = [];
  let meta: Record<string, any> = {};
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36 NickMotion/0.1' });
    const page = await ctx.newPage();
    const queue = [url]; const seen = new Set<string>();
    while (queue.length && pages.length < maxPages) {
      const u = queue.shift()!; const key = u.replace(/\/$/, '');
      if (seen.has(key)) continue; seen.add(key);
      log(`Opening ${u}`, 5 + pages.length * (80 / maxPages));
      try { await page.goto(u, { waitUntil: 'networkidle', timeout: 30000 }); } catch { try { await page.goto(u, { waitUntil: 'load', timeout: 30000 }); } catch (e: any) { log(`Skipped ${u}: ${e.message}`); continue; } }
      await page.waitForTimeout(1200); await dismissBanners(page);
      const ex = await extract(page);
      pages.push({ url: page.url(), title: ex.title });
      if (pages.length === 1) {
        meta = { siteName: ex.siteName, title: ex.title, description: ex.description, themeColor: ex.themeColor, brandColor: ex.brandColor, origin: new URL(page.url()).origin };
        const ranked = ex.links.map((l) => ({ ...l, score: PRIORITY.findIndex((k) => (l.href + ' ' + l.text).toLowerCase().includes(k)) }))
          .filter((l) => l.score >= 0).sort((a, b) => a.score - b.score);
        for (const l of ranked) if (!queue.includes(l.href)) queue.push(l.href);
        // logo + og image
        for (const [i, src] of [...ex.logos.map((l) => [l, 'logo']), ...(ex.ogImage ? [[ex.ogImage, 'image']] : [])].entries()) {
          try {
            const r = await page.request.get(src[0] as string, { timeout: 15000 }); if (!r.ok()) continue;
            const ct = r.headers()['content-type'] || ''; if (ct.includes('svg')) continue;
            const id = 'v' + newId().slice(0, 7); const raw = projectPath(pid, `assets/${id}.src`); fs.writeFileSync(raw, await r.body());
            const file = `assets/${id}.png`; const { w, h } = sizeOf(raw); if (w < 32) { fs.rmSync(raw); continue; }
            fs.renameSync(raw, projectPath(pid, file));
            visuals.push({ id, file, w, h, origin: src[0] as string, sourceId: sid, kind: src[1] === 'logo' ? 'logo' : 'image', use: true } as Visual);
          } catch {}
          if (i > 3) break;
        }
        if (ex.svgLogo) { const id = 'v' + newId().slice(0, 7); const file = `assets/${id}.svg`; writeAtomic(projectPath(pid, file), ex.svgLogo); meta.svgLogo = file; }
      }
      text += `\n\n## PAGE ${page.url()}\nTitle: ${ex.title}\n${ex.description ? 'Description: ' + ex.description + '\n' : ''}Headings: ${ex.heads.join(' | ')}\n\n${clean(ex.text)}`;
      // real screenshots: viewport-sized frames down the page
      const shots = Math.min(4, Math.max(1, Math.ceil(ex.height / 900)));
      for (let k = 0; k < shots; k++) {
        await page.evaluate(`window.scrollTo(0, ${k * 860})`); await page.waitForTimeout(450);
        const id = 'v' + newId().slice(0, 7); const png = projectPath(pid, `assets/${id}.png`); const jpg = `assets/${id}.jpg`;
        await page.screenshot({ path: png }); await toJpeg(png, projectPath(pid, jpg), 2000, 3); fs.rmSync(png, { force: true });
        const { w, h } = sizeOf(projectPath(pid, jpg));
        visuals.push({ id, file: jpg, w, h, origin: `${page.url()} @ ${k * 860}px`, sourceId: sid, kind: 'screenshot', use: k < 2 } as Visual);
      }
      await page.evaluate('window.scrollTo(0, 0)');
    }
    await ctx.close();
  } finally { await browser.close(); }
  const textFile = `sources/${sid}.txt`;
  writeAtomic(projectPath(pid, textFile), text.trim());
  await addVisuals(pid, visuals);
  await setSource(pid, sid, { status: 'ready', textFile, chars: text.length, pages, meta, label: meta.siteName || meta.title || url });
  log(`Read ${pages.length} page(s), captured ${visuals.length} visuals`, 100);
}

// ───────────────────────── local path ─────────────────────────
function walk(dir: string, out: string[], depth = 0) {
  if (depth > 6 || out.length > 4000) return;
  let ents: fs.Dirent[] = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(f, out, depth + 1); }
    else if (e.isFile()) out.push(f);
  }
}
function textRank(rel: string) {
  const r = rel.toLowerCase(); const base = path.basename(r);
  if (/^readme/.test(base)) return 0;
  if (/(product|positioning|marketing|brief|pitch|about|overview|launch|messaging|case)/.test(r)) return 1;
  if (/^(docs|doc|documentation)\//.test(r) || r.includes('/docs/')) return 2;
  if (/(transcript|interview|call|meeting|testimonial|review)/.test(r)) return 1;
  if (/(changelog|license|contributing|code_of_conduct|node_modules)/.test(r)) return 9;
  if (/(^|\/)(mocks?|mockups?|fixtures?|golden|seeds?|samples?|examples?|tests?|__tests__|eval|stories|storybook)(\/|[-_.])/.test(r) || /(mock|fixture|dummy|lorem)/.test(base)) return 9; // placeholder data is not proof
  return 3;
}
function imgRank(rel: string, w: number) {
  const r = rel.toLowerCase(); let s = 3;
  if (/(screenshot|screen|shot|demo|ui|dashboard|product|hero)/.test(r)) s = 0;
  else if (/(public|assets|static|images|img|media)/.test(r)) s = 1;
  if (/(icon|favicon|sprite|badge|emoji|avatar-?\d|logo)/.test(r)) s = /logo/.test(r) ? 2 : 8;
  if (/(mock|fixture|test|sample|example|dummy)/.test(r)) s += 6;
  if (w < 500) s += 3;
  return s;
}

/** Folder/file paths only mean something when TrueCut runs on your own machine. */
export function pathsAllowed() { const v = env('TRUECUT_ALLOW_PATHS'); return v ? /^(1|true|yes)$/i.test(v) : storageDriver() === 'local'; }
export const PATHS_OFF = "This TrueCut runs on a server, so it can't open folders on your computer. Upload the files, or paste a link to the repo or site.";

export async function ingestPath(pid: string, sid: string, abs: string, log: Log) {
  if (!pathsAllowed()) throw new Error(PATHS_OFF);
  if (!fs.existsSync(abs)) throw new Error(`Path not found: ${abs}`);
  const stat = fs.statSync(abs);
  const root = stat.isDirectory() ? abs : path.dirname(abs);
  const files: string[] = []; if (stat.isDirectory()) walk(abs, files); else files.push(abs);
  log(`Found ${files.length} files`, 10);
  const texts = files.filter((f) => TXT_EXT.has(path.extname(f).toLowerCase()) || path.basename(f) === 'package.json')
    .map((f) => ({ f, rel: path.relative(root, f), size: fs.statSync(f).size })).filter((x) => x.size < 600_000)
    .sort((a, b) => textRank(a.rel) - textRank(b.rel) || a.rel.length - b.rel.length);
  let text = ''; const used: string[] = [];
  for (const t of texts) {
    if (textRank(t.rel) >= 9) continue;
    let body = fs.readFileSync(t.f, 'utf8');
    if (path.basename(t.f) === 'package.json') { try { const j = JSON.parse(body); body = `name: ${j.name}\ndescription: ${j.description || ''}\nkeywords: ${(j.keywords || []).join(', ')}`; } catch { continue; } }
    if (/\.html?$/.test(t.f)) body = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    body = clean(body).slice(0, 25000);
    if (body.length < 40) continue;
    text += `\n\n## FILE ${t.rel}\n${body}`; used.push(t.rel);
    if (text.length > 150_000) break;
  }
  log(`Read ${used.length} text files`, 45);
  const imgs = files.filter((f) => IMG_EXT.has(path.extname(f).toLowerCase())).map((f) => ({ f, rel: path.relative(root, f), ...sizeOf(f) }))
    .filter((x) => x.w >= 300 && x.h >= 200).sort((a, b) => imgRank(a.rel, a.w) - imgRank(b.rel, b.w) || b.w * b.h - a.w * a.h).slice(0, 40);
  const visuals: Visual[] = [];
  for (const [i, im] of imgs.entries()) {
    const id = 'v' + newId().slice(0, 7); const ext = path.extname(im.f).toLowerCase();
    let file: string;
    if (ext === '.png' && im.w <= 1400) { file = `assets/${id}.png`; fs.copyFileSync(im.f, projectPath(pid, file)); }
    else { file = `assets/${id}.jpg`; await toJpeg(im.f, projectPath(pid, file), 2000, 3); }
    const sz = sizeOf(projectPath(pid, file));
    visuals.push({ id, file, w: sz.w, h: sz.h, origin: im.rel, sourceId: sid, kind: /logo/i.test(im.rel) ? 'logo' : /shot|screen/i.test(im.rel) ? 'screenshot' : 'image', use: i < 16 } as Visual);
    if (i % 5 === 0) log(`Copied ${i + 1}/${imgs.length} images`, 45 + (50 * i) / imgs.length);
  }
  const textFile = `sources/${sid}.txt`;
  writeAtomic(projectPath(pid, textFile), text.trim());
  await addVisuals(pid, visuals);
  await setSource(pid, sid, { status: 'ready', textFile, chars: text.length, meta: { files: used.slice(0, 60), images: imgs.length } });
  log(`Read ${used.length} files and ${visuals.length} images`, 100);
}

// ───────────────────────── text + uploads ─────────────────────────
export async function ingestText(pid: string, sid: string, text: string) {
  const textFile = `sources/${sid}.txt`;
  writeAtomic(projectPath(pid, textFile), clean(text));
  await setSource(pid, sid, { status: 'ready', textFile, chars: text.length });
}

/** Where an upload from the browser is stored before it is read (see the uploads API route). */
export const uploadPath = (sid: string, name: string) => `sources/${sid}${path.extname(name).toLowerCase()}`;

/** Read a file the browser uploaded (already in the project folder at uploadPath). */
export async function ingestStoredUpload(pid: string, sid: string) {
  const src = (await getProject(pid)).sources.find((x) => x.id === sid);
  if (!src) throw new Error('Source not found');
  const name = String(src.meta?.name || src.label);
  const rel = String(src.meta?.upload || uploadPath(sid, name));
  const file = projectPath(pid, rel);
  if (!fs.existsSync(file)) { await setSource(pid, sid, { status: 'error', error: 'The uploaded file is missing. Please upload it again.' }); return; }
  const ext = path.extname(name).toLowerCase();
  if (IMG_EXT.has(ext)) {
    const id = 'v' + newId().slice(0, 7);
    const out = ext === '.png' ? `assets/${id}.png` : `assets/${id}.jpg`;
    if (ext === '.png') fs.copyFileSync(file, projectPath(pid, out)); else await toJpeg(file, projectPath(pid, out), 2000, 3);
    const { w, h } = sizeOf(projectPath(pid, out));
    await addVisuals(pid, [{ id, file: out, w, h, origin: name, sourceId: sid, kind: /logo/i.test(name) ? 'logo' : 'image', use: true } as Visual]);
    await setSource(pid, sid, { status: 'ready', chars: 0 });
    return;
  }
  if (TXT_EXT.has(ext) || ext === '.json') { await ingestText(pid, sid, fs.readFileSync(file, 'utf8').slice(0, 300_000)); return; }
  if (MEDIA_EXT.has(ext)) { // recordings are transcribed by the talk pipeline (needs a job + progress)
    await setSource(pid, sid, { status: 'pending', meta: { ...(src.meta || {}), mediaFile: rel, name } }); return;
  }
  await setSource(pid, sid, { status: 'error', error: `Unsupported file type ${ext}. Use images, recordings (.mp4/.mov/.mp3/.wav/.m4a), .md, .txt, .csv, .html, .vtt or paste the text.` });
}

/** A file type TrueCut can read (checked by the upload route before accepting bytes). */
export const canUpload = (name: string) => { const e = path.extname(name).toLowerCase(); return IMG_EXT.has(e) || TXT_EXT.has(e) || MEDIA_EXT.has(e) || e === '.json'; };

export async function addSource(pid: string, kind: Source['kind'], ref: string, label?: string, meta?: Record<string, any>): Promise<Source> {
  const s: Source = { id: 's' + newId().slice(0, 7), kind, ref, label: label || ref.slice(0, 80), addedAt: new Date().toISOString(), status: 'pending', chars: 0, ...(meta ? { meta } : {}) };
  await updateProject(pid, (p) => { p.sources.push(s); });
  return s;
}

export async function removeSource(pid: string, sid: string) {
  await updateProject(pid, (p) => { p.sources = p.sources.filter((s) => s.id !== sid); p.visuals = p.visuals.filter((v) => v.sourceId !== sid); });
}

export { getProject };
