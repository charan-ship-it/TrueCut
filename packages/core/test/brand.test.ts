import { describe, expect, it } from 'vitest';
import { applyBrandLanguage, dropBrandLook, brandBlock } from '../src/brand/language';
import { resolveStyle } from '@truecut/engine/styles.js';

const lang = { mood: 'warm, craft-led', shapes: 'thin outlines, soft 14px corners, paper grain', motion: 'slow eased', avoid: 'neon, glitch', why: 'from the site', base: 'editorial',
  palette: { bg: '#F6F1E7', bg2: '#ECE4D3', ink: '#1F2A24', muted: '#6B746D', accent: '#2F6B4F', accent2: '#1F2A24', card: '#FFFFFF', line: '#D9D0BD' },
  fonts: { display: 'Fraunces', body: 'DM Sans', mono: 'IBM Plex Mono' }, display: { case: 'none', weight: 600, align: 'left' }, card: { radius: 14, style: 'outline' }, background: 'paper', theme: 'light' as const };

describe('brand language', () => {
  it('becomes the project look, over a base direction', () => {
    const p: any = { style: { preset: 'neon', captions: 'outline' }, brandLanguage: lang };
    applyBrandLanguage(p);
    const s = resolveStyle(p.style, '#FF0000');
    expect(s.palette.accent).toBe('#2F6B4F');          // the brand's own colour, not the generic brand accent or the preset's
    expect(s.palette.bg).toBe('#F6F1E7');
    expect(s.fonts.display).toBe('Fraunces');
    expect(s.card.radius).toBe(14);
    expect(p.style.captions).toBe('outline');           // unrelated choices survive
  });
  it('is dropped when a preset direction is chosen by hand', () => {
    const p: any = { style: { preset: 'editorial', captions: 'pill' }, brandLanguage: lang }; applyBrandLanguage(p);
    const s = dropBrandLook(p.style);
    expect(s.palette).toBeUndefined(); expect(s.captions).toBe('pill');
    expect(resolveStyle({ ...s, preset: 'neon' }).palette.accent).not.toBe('#2F6B4F');
  });
  it('gives drawing prompts the language, and nothing when there is none', () => {
    expect(brandBlock({ brandLanguage: lang } as any)).toMatch(/BRAND LANGUAGE[\s\S]*soft 14px corners[\s\S]*#2F6B4F/);
    expect(brandBlock({} as any)).toBe('');
  });
});
