// The team screenshot library: captures from the Chrome extension or uploads, read once by Claude
// (visible text, numbers, what the screen is, any personal data) and reusable in any video.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imageSize } from 'image-size';
import { config } from '@truecut/config';
import { createLibraryAsset, findBySha, getLibraryAsset, updateLibraryAsset, newLibraryId, getProject, updateProject, newId, findLibraryMatches, type LibraryAnalysis, type LibraryAsset } from '@truecut/db';
import { putLibraryFile, readLibraryFile, copyLibraryFileToProject, projectPath, writeAtomic } from '@truecut/storage';
import { defineHandler, enqueue } from '@truecut/queue';
import { ffmpeg } from '../render/media';
import { callTool } from '../system/claude';
import { UserFacingError } from '../system/errors';
import '../system/context';

export const MAX_CAPTURE_BYTES = 25 * 1024 * 1024;
const TYPES: Record<string, { ext: string; mime: string }> = { png: { ext: 'png', mime: 'image/png' }, jpg: { ext: 'jpg', mime: 'image/jpeg' }, webp: { ext: 'webp', mime: 'image/webp' } };

export type CaptureMeta = { title?: string; url?: string; product?: string; tags?: string[]; capturedAt?: string; source?: 'extension' | 'upload' };

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');
export function domainOf(url?: string | null) { try { return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : null; } catch { return null; } }
function cleanUrl(url?: string) {
  try {
    if (!url) return null;
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    // tokens in query strings (magic links, OAuth codes) must not end up in the library
    for (const k of [...u.searchParams.keys()]) if (/token|code|key|secret|session|auth|sig|password|otp/i.test(k)) u.searchParams.set(k, 'REDACTED');
    u.hash = ''; return u.toString().slice(0, 1000);
  } catch { return null; }
}
export function cleanTags(tags: unknown): string[] {
  const arr = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  return [...new Set(arr.map((t) => clip(String(t), 30).toLowerCase()).filter(Boolean))].slice(0, 12);
}

/** Validate and store a capture, then queue it to be read. Returns the asset (or the existing identical one). */
export async function addCapture(o: { workspaceId: string; userId: string | null; data: Buffer; meta: CaptureMeta }) {
  if (!o.data?.length) throw new UserFacingError('The capture is empty.', 'empty');
  if (o.data.length > MAX_CAPTURE_BYTES) throw new UserFacingError('That image is over 25 MB. Capture a smaller area or a single page.', 'too_large');
  let dim: { width?: number; height?: number; type?: string };
  try { dim = imageSize(o.data); } catch { throw new UserFacingError('That file is not an image TrueCut can read (use PNG, JPEG or WebP).', 'bad_image'); }
  const t = TYPES[dim.type === 'jpeg' ? 'jpg' : dim.type || ''];
  if (!t) throw new UserFacingError(`TrueCut can't use ${dim.type || 'that'} images. Use PNG, JPEG or WebP.`, 'bad_image');
  if (!dim.width || !dim.height || dim.width < 16 || dim.height < 16) throw new UserFacingError('That image is too small to use.', 'bad_image');
  if (dim.width > 20000 || dim.height > 40000) throw new UserFacingError('That image is too large in pixels (max 20,000 × 40,000).', 'bad_image');
  const sha = crypto.createHash('sha256').update(o.data).digest('hex');
  const dup = await findBySha(o.workspaceId, sha);
  if (dup) return { asset: dup, duplicate: true };
  const id = newLibraryId();
  const file = `${id}.${t.ext}`;
  await putLibraryFile(o.workspaceId, file, o.data);
  const url = cleanUrl(o.meta.url);
  let asset: LibraryAsset;
  try {
    asset = await createLibraryAsset({
      id, workspaceId: o.workspaceId, createdBy: o.userId, title: clip(o.meta.title, 200) || (url ? domainOf(url) || '' : '') || 'Screenshot',
      url, domain: domainOf(url), product: clip(o.meta.product, 60) || null, tags: cleanTags(o.meta.tags), source: o.meta.source === 'extension' ? 'extension' : 'upload',
      file, mime: t.mime, w: dim.width, h: dim.height, bytes: o.data.length, sha256: sha, status: 'pending',
      capturedAt: o.meta.capturedAt && !isNaN(Date.parse(o.meta.capturedAt)) ? new Date(o.meta.capturedAt) : new Date(),
    });
  } catch (e: any) {
    // two identical uploads raced: the unique index let one through
    if (/library_ws_sha_idx|duplicate key/i.test(e?.message || '')) { const d = await findBySha(o.workspaceId, sha); if (d) return { asset: d, duplicate: true }; }
    throw e;
  }
  await enqueue('library_read', null, { assetId: id, workspaceId: o.workspaceId }, { createdBy: o.userId });
  return { asset, duplicate: false };
}

const READ_TOOL = {
  name: 'record_screenshot',
  description: 'What this product screenshot shows.',
  input_schema: { type: 'object', required: ['summary', 'kind', 'text', 'numbers', 'sensitive'], properties: {
    summary: { type: 'string', description: 'one sentence: which product/screen this is and what it shows' },
    kind: { type: 'string', enum: ['dashboard', 'list', 'detail', 'editor', 'chat', 'settings', 'chart', 'landing', 'docs', 'other'] },
    product: { type: 'string', description: 'product or brand name visible on screen, if any' },
    text: { type: 'string', description: 'the visible text, verbatim, top to bottom (headings, labels, values, rows). Max ~3000 characters.' },
    numbers: { type: 'array', maxItems: 20, items: { type: 'object', required: ['value', 'label', 'quote'], properties: {
      value: { type: 'number' }, label: { type: 'string', description: 'what the number counts, as labelled on screen' }, quote: { type: 'string', description: 'the exact on-screen text containing the number' } } } },
    sensitive: { type: 'object', required: ['has', 'kinds'], properties: {
      has: { type: 'boolean', description: 'true if real personal or confidential data is readable' },
      kinds: { type: 'array', items: { type: 'string', enum: ['person_name', 'email', 'phone', 'address', 'payment', 'credential', 'customer_data', 'health', 'other'] } },
      note: { type: 'string', description: 'where it appears, briefly' } } },
  } },
};

/** Image blocks for Claude: one image, or for very tall full-page captures, readable vertical tiles. */
async function visionBlocks(src: string, w: number, h: number) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-lib-'));
  try {
    const blocks: any[] = [];
    if (h / w > 2.5) {
      const tw = Math.min(w, 1280); const scale = tw / w; const tileH = Math.round(tw * 1.25); const total = Math.round(h * scale);
      const n = Math.min(6, Math.ceil(total / tileH));
      for (let i = 0; i < n; i++) {
        const out = path.join(tmp, `t${i}.jpg`);
        await ffmpeg(['-i', src, '-vf', `scale=${tw}:-2,crop=${tw}:${Math.min(tileH, total - i * tileH)}:0:${i * tileH}`, '-q:v', '4', '-frames:v', '1', out]);
        blocks.push({ type: 'text', text: `Part ${i + 1} of ${n} (top to bottom)${i === n - 1 && n * tileH < total ? ', the page continues below' : ''}:` });
        blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(out).toString('base64') } });
      }
    } else {
      const out = path.join(tmp, 'a.jpg');
      await ffmpeg(['-i', src, '-vf', `scale='if(gt(iw,ih),min(1568,iw),-2)':'if(gt(iw,ih),-2,min(1568,ih))'`, '-q:v', '3', '-frames:v', '1', out]);
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(out).toString('base64') } });
    }
    return blocks;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export function normalizeAnalysis(out: any): LibraryAnalysis {
  const nums = Array.isArray(out?.numbers) ? out.numbers : [];
  const text = clip(out?.text, 6000);
  const flat = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
  const hay = flat(text);
  return {
    summary: clip(out?.summary, 300), kind: clip(out?.kind, 20) || 'other', text, product: clip(out?.product, 60) || undefined,
    // keep only numbers whose quote really is on screen (the same rule as the fact guard)
    numbers: nums.filter((n: any) => Number.isFinite(Number(n?.value)) && typeof n?.quote === 'string' && n.quote.trim() && hay.includes(flat(n.quote)))
      .slice(0, 20).map((n: any) => ({ value: Number(n.value), label: clip(n.label, 80), quote: clip(n.quote, 200) })),
    sensitive: { has: !!out?.sensitive?.has, kinds: Array.isArray(out?.sensitive?.kinds) ? out.sensitive.kinds.slice(0, 8).map((k: any) => clip(k, 20)) : [], note: clip(out?.sensitive?.note, 200) || undefined },
  };
}

defineHandler<{ assetId: string; workspaceId: string }>('library_read', async ({ assetId, workspaceId }, { log }) => {
  const a = await getLibraryAsset(assetId, workspaceId);
  if (!a) return { skipped: 'deleted' };
  const data = await readLibraryFile(workspaceId, a.file);
  if (!data) { await updateLibraryAsset(a.id, { status: 'error', error: 'The image file is missing. Delete this capture and take it again.' }); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-libsrc-'));
  try {
    const src = path.join(tmp, a.file); fs.writeFileSync(src, data);
    log('Making a thumbnail', 20);
    const thumbName = `${a.id}_t.jpg`; const thumb = path.join(tmp, thumbName);
    await ffmpeg(['-i', src, '-vf', `scale='min(640,iw)':-2,crop=iw:'min(ih,iw*1.6)':0:0`, '-q:v', '4', '-frames:v', '1', thumb]);
    await putLibraryFile(workspaceId, thumbName, fs.readFileSync(thumb));
    if (!config.anthropicKey) {
      await updateLibraryAsset(a.id, { status: 'ready', error: 'Not read yet: add an Anthropic API key in Settings, then choose "Read again".', analysis: null });
      return { read: false };
    }
    log('Reading the screenshot', 50);
    const out = await callTool<any>({
      model: config.visionModel, maxTokens: 4000, operation: 'library_read', what: 'Reading a screenshot',
      system: 'You read product screenshots for a video team. Transcribe what is actually visible; never guess hidden or cut-off values. Flag personal or confidential data a viewer could read (real people\'s names, emails, phone numbers, customer records, payment or login details).',
      tool: READ_TOOL,
      content: [{ type: 'text', text: `Screenshot titled "${a.title}"${a.url ? ` from ${a.url}` : ''}.` }, ...(await visionBlocks(src, a.w, a.h)), { type: 'text', text: 'Call record_screenshot.' }],
    });
    const analysis = normalizeAnalysis(out);
    await updateLibraryAsset(a.id, { status: 'ready', error: null, analysis, product: a.product || analysis.product || null });
    log(analysis.sensitive.has ? 'Read. Contains personal data: flagged' : 'Read', 100);
    return { read: true, sensitive: analysis.sensitive.has };
  } catch (e: any) {
    await updateLibraryAsset(a.id, { status: 'ready', error: `Couldn't read it: ${e?.message || e}`.slice(0, 300) });
    throw e;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

export const rereadAsset = (a: LibraryAsset, userId: string | null) => enqueue('library_read', null, { assetId: a.id, workspaceId: a.workspaceId }, { createdBy: userId });

/** The text a library shot contributes to a project's sources (so its numbers count as sourced facts). */
export function assetSourceText(a: LibraryAsset) {
  const an = a.analysis as LibraryAnalysis | null;
  return [`Screenshot from the team library: "${a.title}"${a.url ? ` (${a.url})` : ''}, captured ${(a.capturedAt || a.createdAt).toISOString().slice(0, 10)}.`,
    an?.summary || '', an?.text ? `Visible text:\n${an.text}` : ''].filter(Boolean).join('\n\n');
}

/** Copy library shots into a project as visuals + one source each. Skips ones already in it. */
export async function attachToProject(pid: string, assetIds: string[], workspaceId: string) {
  const p = await getProject(pid);
  const have = new Set(p.sources.filter((s) => s.kind === 'library').map((s) => s.ref));
  const added: { sourceId: string; visualId: string; assetId: string }[] = [];
  for (const id of [...new Set(assetIds)].slice(0, 30)) {
    if (have.has(id)) continue;
    const a = await getLibraryAsset(id, workspaceId);
    if (!a) continue;
    const ext = path.extname(a.file) || '.png';
    const visualId = 'v' + newId().slice(0, 7); const sourceId = 's' + newId().slice(0, 7);
    const rel = `assets/lib_${a.id}${ext}`; const textFile = `sources/${sourceId}.txt`;
    await copyLibraryFileToProject(workspaceId, a.file, pid, rel);
    const text = assetSourceText(a);
    writeAtomic(projectPath(pid, textFile), text);
    const an = a.analysis as LibraryAnalysis | null;
    await updateProject(pid, (pp) => {
      pp.sources.push({ id: sourceId, kind: 'library', ref: a.id, label: a.title, addedAt: new Date().toISOString(), status: 'ready', textFile, chars: text.length, meta: { url: a.url, product: a.product, sensitive: !!an?.sensitive?.has } } as any);
      pp.visuals.push({ id: visualId, file: rel, w: a.w, h: a.h, origin: `Library · ${a.title}`, sourceId, kind: 'screenshot', use: !an?.sensitive?.has, description: an?.summary || a.title } as any);
    });
    added.push({ sourceId, visualId, assetId: a.id });
  }
  return added;
}

/** Shots in the library that look like they belong to this project (same site or product). */
export async function suggestForProject(pid: string, workspaceId: string, extraNames: string[] = []) {
  const p = await getProject(pid);
  const used = new Set(p.sources.filter((s) => s.kind === 'library').map((s) => s.ref));
  const domains = p.sources.filter((s) => s.kind === 'url').map((s) => domainOf(/^https?:/.test(s.ref) ? s.ref : 'https://' + s.ref)).filter(Boolean) as string[];
  const names = [p.intake.productName, p.intake.brandName, ...extraNames].filter((n) => n && !/^untitled/i.test(n)) as string[];
  const rows = await findLibraryMatches(workspaceId, { domains, names });
  return rows.filter((r) => !used.has(r.id));
}
