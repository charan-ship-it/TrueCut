// Brand language: how a company LOOKS and moves, learned from its own material instead of picked from our
// presets. Nick reads the site's real colours, fonts and shapes plus its logo and screenshots, writes down
// the visual language (palette, type, shape vocabulary, mood, what to avoid), applies it as the project's
// look, and every prompt that draws something (storyboard, founder-talk beats, freehand scenes) gets it.
// A person can also steer it in chat ("warmer", "rounder", "feel like a fintech, not a startup").
import fs from 'node:fs';
import { config } from '@truecut/config';
import { getProject, updateProject, projectMeta, findBrandKit, saveBrandKit, brandKey } from '@truecut/db';
import { projectPath } from '@truecut/storage';
import { DIRECTIONS, FONTS, BACKGROUNDS } from '@truecut/engine/styles.js';
import type { Project } from '@truecut/shared/types';
import { callTool } from '../system/claude';
import { toJpeg } from '../render/media';

export type BrandLanguage = {
  mood: string; shapes: string; motion: string; avoid: string; why: string; base: string;
  palette: Record<string, string>; fonts: { display: string; body: string; mono: string };
  display: { case: string; weight: number; align: string }; card: { radius: number; style: string }; background: string; theme: 'dark' | 'light';
};

const hex = (v: any) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const fontNames = Object.keys(FONTS);

const BRAND_TOOL = {
  name: 'record_brand_language', description: "The company's visual language, as a designer would write it down.",
  input_schema: { type: 'object', required: ['mood', 'shapes', 'palette', 'fonts', 'card', 'base', 'theme'], properties: {
    mood: { type: 'string', description: 'how the brand feels, 1 sentence (e.g. "warm, unhurried, craft-led" or "sharp, technical, no-nonsense")' },
    shapes: { type: 'string', description: 'the shape vocabulary to draw in, ≤260 chars: line weight, corner radius, flat vs shadowed vs outlined, characteristic motifs (circuit lines, soft blobs, grids, hand-drawn marks, photography crops)' },
    motion: { type: 'string', description: 'how things should move, ≤140 chars (snappy and mechanical / slow and eased / playful overshoot)' },
    avoid: { type: 'string', description: 'what would feel off-brand, ≤160 chars' },
    why: { type: 'string', description: 'one short sentence for the user: what you based this on' },
    base: { type: 'string', enum: Object.keys(DIRECTIONS), description: 'the closest built-in direction; its motion and transitions are used underneath the brand palette' },
    theme: { type: 'string', enum: ['dark', 'light'] },
    palette: { type: 'object', required: ['bg', 'bg2', 'ink', 'muted', 'accent', 'card', 'line'], description: 'hex colours (#RRGGBB) taken from the brand, readable together (ink on bg ≥ 4.5:1)', properties: Object.fromEntries(['bg', 'bg2', 'ink', 'muted', 'accent', 'accent2', 'card', 'line'].map((k) => [k, { type: 'string' }])) },
    fonts: { type: 'object', required: ['display', 'body'], description: 'the CLOSEST available fonts to the brand\'s own', properties: { display: { type: 'string', enum: fontNames }, body: { type: 'string', enum: fontNames }, mono: { type: 'string', enum: fontNames } } },
    display: { type: 'object', properties: { case: { type: 'string', enum: ['none', 'uppercase'] }, weight: { type: 'number' }, align: { type: 'string', enum: ['left', 'center'] } } },
    card: { type: 'object', required: ['radius', 'style'], properties: { radius: { type: 'number', description: 'px, 0-40' }, style: { type: 'string', enum: ['solid', 'outline', 'glass'] } } },
    background: { type: 'string', enum: BACKGROUNDS },
  } },
};

async function images(p: Project, max = 4) {
  const out: any[] = [];
  const pick = [...p.visuals.filter((v) => /logo/i.test(v.kind || '')), ...p.visuals.filter((v) => !/logo/i.test(v.kind || ''))].slice(0, max);
  for (const v of pick) {
    try {
      const prev = projectPath(p.id, `assets/_ai_${v.id}.jpg`);
      if (!fs.existsSync(prev)) await toJpeg(projectPath(p.id, v.file), prev, 1100, 5);
      out.push({ type: 'text', text: `Image (${v.kind}, from ${v.origin}):` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(prev).toString('base64') } });
    } catch {}
  }
  return out;
}

/** Read the brand's look from the project's sources (and an optional instruction), store it and apply it. */
export async function deriveBrandLanguage(pid: string, instruction = ''): Promise<BrandLanguage> {
  const p = await getProject(pid);
  const metas = p.sources.map((s: any) => s.meta).filter(Boolean);
  const site = metas.find((m: any) => m?.look) || metas[0] || {};
  const prev = (p as any).brandLanguage as BrandLanguage | undefined;
  const evidence = [
    `Company: ${p.intake.productName || p.name} — ${p.intake.oneLiner || ''}`,
    `Audience: ${p.intake.audience || '—'}. Tone asked for: ${p.intake.tone || '—'}.`,
    site.siteName ? `Site: ${site.siteName}` : '', site.themeColor ? `theme-color: ${site.themeColor}` : '', site.brandColor ? `most-used button/link colour: ${site.brandColor}` : '',
    site.look ? `Computed from the live site: ${JSON.stringify(site.look)}` : 'No computed style data (not from a website).',
    p.intake.brandName ? `Brand name: ${p.intake.brandName}` : '',
    prev ? `Current brand language (refine it, don't restart): ${JSON.stringify({ mood: prev.mood, shapes: prev.shapes, palette: prev.palette, fonts: prev.fonts })}` : '',
    instruction ? `THE PERSON ASKS: ${instruction}` : '',
  ].filter(Boolean).join('\n');
  const out = await callTool<any>({
    model: config.creativeModel, maxTokens: 2500, operation: 'brand_language', what: 'Reading the brand',
    system: 'You are a brand designer. Work out this company\'s visual language from its real material (computed site styles, logo and screenshots below) so a motion designer can make videos that look like the company made them, not like a template. Use the brand\'s own colours: sample from the images and the computed styles; do not invent a palette. Pick the closest available fonts. If the person gave an instruction, it overrides what the material suggests. Be specific about shapes and motion; avoid generic words.',
    tool: BRAND_TOOL, content: [...(await images(p)), { type: 'text', text: evidence }],
  });
  const base = DIRECTIONS[out.base] ? out.base : 'editorial';
  const bp = DIRECTIONS[base].palette as Record<string, string>;
  const palette: Record<string, string> = {}; for (const k of Object.keys(bp)) palette[k] = hex(out.palette?.[k]) ? out.palette[k] : bp[k];
  const fonts = { display: FONTS[out.fonts?.display] ? out.fonts.display : DIRECTIONS[base].fonts.display, body: FONTS[out.fonts?.body] ? out.fonts.body : DIRECTIONS[base].fonts.body, mono: FONTS[out.fonts?.mono] ? out.fonts.mono : DIRECTIONS[base].fonts.mono };
  const lang: BrandLanguage = {
    mood: String(out.mood || '').slice(0, 200), shapes: String(out.shapes || '').slice(0, 300), motion: String(out.motion || '').slice(0, 160), avoid: String(out.avoid || '').slice(0, 200), why: String(out.why || '').slice(0, 220), base, palette, fonts,
    display: { case: out.display?.case === 'uppercase' ? 'uppercase' : 'none', weight: Math.max(300, Math.min(900, Number(out.display?.weight) || DIRECTIONS[base].display.weight)), align: out.display?.align === 'center' ? 'center' : 'left' },
    card: { radius: Math.max(0, Math.min(40, Number(out.card?.radius) ?? 12)), style: ['solid', 'outline', 'glass'].includes(out.card?.style) ? out.card.style : 'solid' },
    background: BACKGROUNDS.includes(out.background) ? out.background : DIRECTIONS[base].background, theme: out.theme === 'dark' ? 'dark' : 'light',
  };
  await updateProject(pid, (pp: any) => { pp.brandLanguage = lang; applyBrandLanguage(pp); pp.audioHash = undefined; });
  await saveToKit(pid, p, lang).catch(() => {});
  return lang;
}

/** What identifies this company across projects: the site host(s) of its sources, then the brand name. */
export function brandKeys(p: Project): string[] {
  const hosts = p.sources.filter((s: any) => s.kind === 'url').map((s: any) => brandKey(String(s.ref || s.label || '')));
  return [...hosts, brandKey(p.intake.brandName || '')].filter(Boolean);
}
async function saveToKit(pid: string, p: Project, lang: BrandLanguage) {
  const m = await projectMeta(pid); if (!m) return;
  await saveBrandKit(m.workspaceId, brandKeys(p), p.intake.brandName || p.intake.productName || p.name, lang, m.createdBy);
}
/** The workspace's saved language for this company, if one exists. */
export async function savedBrand(pid: string): Promise<{ lang: BrandLanguage; name: string } | null> {
  const p = await getProject(pid); const m = await projectMeta(pid); if (!m) return null;
  const k = await findBrandKit(m.workspaceId, brandKeys(p)); if (!k) return null;
  return { lang: k.language as BrandLanguage, name: k.name };
}
/** Use the saved language on this project (no model call). */
export async function useSavedBrand(pid: string): Promise<{ lang: BrandLanguage; name: string } | null> {
  const k = await savedBrand(pid); if (!k) return null;
  await updateProject(pid, (pp: any) => { pp.brandLanguage = k.lang; applyBrandLanguage(pp); pp.audioHash = undefined; });
  return k;
}

/** Put the brand language on the project's look (palette, fonts, card, background) over its base direction. */
export function applyBrandLanguage(pp: any) {
  const l: BrandLanguage | undefined = pp.brandLanguage; if (!l) return;
  pp.style = { ...(pp.style || {}), preset: l.base, palette: l.palette, fonts: l.fonts, display: { ...(DIRECTIONS[l.base]?.display || {}), ...l.display }, card: l.card, background: l.background, theme: l.theme, useBrandAccent: false, brandLook: true };
}

/** A direction picked by hand replaces the brand look (a preset must be what it says it is). */
export function dropBrandLook(style: any) {
  if (!style?.brandLook) return style;
  const { palette, fonts, display, card, background, theme, useBrandAccent, brandLook, ...rest } = style; void palette; void fonts; void display; void card; void background; void theme; void useBrandAccent; void brandLook;
  return rest;
}

/** The text block every drawing prompt gets ('' when the project has no brand language). */
export function brandBlock(p: Project): string {
  const l = (p as any).brandLanguage as BrandLanguage | undefined; if (!l) return '';
  return `\n\nBRAND LANGUAGE (draw in this company's own visual language, not a generic template look)\n- Mood: ${l.mood}\n- Shapes: ${l.shapes}\n- Motion: ${l.motion}\n- Avoid: ${l.avoid}\n- Colours: ink ${l.palette.ink} on ${l.palette.bg}, accent ${l.palette.accent}, card ${l.palette.card}, line ${l.palette.line}. Fonts: ${l.fonts.display} (display), ${l.fonts.body} (body). Corner radius ~${l.card.radius}px, ${l.card.style} cards.\nUse the theme variables (var(--ink), var(--a), var(--bg), var(--card), var(--ln), var(--mu)) so everything follows these colours.`;
}
