import { describe, expect, it } from 'vitest';
import { TALK_TEMPLATES, templateFrom, templateById } from '../src/talk/templates';
import { BUILTIN_SKILLS } from '../src/skills/builtin';
import { DIRECTIONS, CAPTIONS } from '@truecut/engine/styles.js';
import { TALK_LAYOUTS, speakerBox, isCardLayout } from '@truecut/engine/talk.js';

describe('founder-talk templates', () => {
  it('only reference real layouts, looks, captions and skills', () => {
    const skills = new Set(BUILTIN_SKILLS.map((s) => s.id));
    for (const t of TALK_TEMPLATES) {
      expect(TALK_LAYOUTS).toContain(t.layout);
      expect(Object.keys(DIRECTIONS)).toContain(t.direction);
      expect(CAPTIONS).toContain(t.captions);
      for (const s of t.skills) expect(skills.has(s), `${t.id} → ${s}`).toBe(true);
    }
    expect(new Set(TALK_TEMPLATES.map((t) => t.id)).size).toBe(TALK_TEMPLATES.length);
  });
  it('matches names from chat', () => {
    expect(templateFrom('use the loom template')?.id).toBe('loom-walkthrough');
    expect(templateFrom('try the hot take style')?.id).toBe('hot-take');
    expect(templateFrom('make it shorter')).toBeNull();
    expect(templateById('hiring')?.layout).toBe('clean');
  });
});
describe('talk layouts', () => {
  it('keep the speaker box inside the frame, with even sizes', () => {
    for (const f of ['9x16', '4x5', '1x1']) for (const l of TALK_LAYOUTS) {
      const b = speakerBox(f, l); const W = 1080; const H = f === '9x16' ? 1920 : f === '4x5' ? 1350 : 1080;
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(W); expect(b.y + b.h).toBeLessThanOrEqual(H);
      expect(b.w % 2 + b.h % 2 + b.x % 2 * 0).toBe(0);
    }
    expect(isCardLayout('bubble')).toBe(true); expect(isCardLayout('split')).toBe(false);
  });
});
