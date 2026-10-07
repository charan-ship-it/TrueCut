// Project → engine composition (what the player renders).
import type { Project } from './types';
import { layout } from '../public/engine/timeline.js';
import { talkTimeline } from '../public/engine/talk.js';

export function toComposition(p: Project) {
  const i = p.intake;
  if (p.kind === 'talk' && p.talk?.beats?.length) return talkComposition(p);
  const assets: Record<string, { url: string }> = {};
  for (const v of p.visuals) assets[v.id] = { url: v.file };
  return {
    title: p.brief?.title || p.name,
    brand: {
      name: i.brandName || i.productName || p.name,
      product: i.productName || p.name,
      accent: /^#[0-9a-f]{6}$/i.test(i.accent) ? i.accent : '#F47920',
      hudImage: i.avatarVisual || undefined,
      hudPre: i.brandName || i.productName || p.name,
      hudName: i.productName || p.name,
      hudSub: i.dataLabel || '',
    },
    assets,
    captions: true,
    style: p.style || { preset: 'signal' },
    scenes: p.scenes.map((s) => ({ ...s, vo: s.vo ? { text: s.vo.text, duration: s.vo.duration, words: s.vo.words } : undefined })),
  };
}

export function projectLayout(p: Project) { return layoutOf(toComposition(p) as any); }

/** Talk compositions: the beats + the speaker proxies; captions are supplied by the server (word groups). */
function talkComposition(p: Project) {
  const i = p.intake; const assets: Record<string, { url: string }> = {};
  for (const v of p.visuals) assets[v.id] = { url: v.file };
  return {
    mode: 'talk', title: p.talk.title || p.name,
    brand: { name: i.brandName || i.productName || p.name, product: i.productName, accent: /^#[0-9a-f]{6}$/i.test(i.accent) ? i.accent : '#F47920' },
    assets, style: p.style || { preset: 'editorial' },
    talk: { layout: p.talk.layout, beats: p.talk.beats, duration: p.talk.duration, label: p.talk.label, proxies: p.talk.proxies, showCaptions: p.talk.showCaptions, captions: p.talk.captions || [] },
  };
}
export function layoutOf(comp: any) { return comp?.mode === 'talk' ? talkTimeline(comp) : layout(comp); }
