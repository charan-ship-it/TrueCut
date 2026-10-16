import { describe, it, expect } from 'vitest';
import { drawingStills, DESIGN_PLAYBOOK, DESIGN_CRAFT, DESIGN_PROCESS, EXEMPLARS } from '../src/design/craft';
import { sanitizeMarkup } from '@truecut/engine/talk.js';

describe('design-first guide', () => {
  it('carries the reference-based playbook: formats, hooks, pacing, sound-off', () => {
    for (const w of [/SaaS explainer/, /mistake callout/, /1\.7 seconds/, /sound off/, /problem, solution, outcome/, /lower thirds/, /score it yourself/]) expect(DESIGN_PLAYBOOK).toMatch(w);
  });
  it('carries the process, the craft guide and sanitised exemplars', () => {
    expect(DESIGN_PROCESS).toMatch(/Find the picture/);
    expect(DESIGN_CRAFT).toMatch(/Playful/);
    for (const m of EXEMPLARS.match(/<svg[\s\S]*?<\/svg>/g) || []) expect(sanitizeMarkup(m)).toBe(m.replace(/<!--[\s\S]*?-->/g, ''));
    expect((EXEMPLARS.match(/<svg/g) || []).length).toBe(2);
  });
  it('renders a freehand drawing at different times (animation is driven by the clock)', async () => {
    const html = "<svg viewBox='0 0 900 700'><style>@keyframes g{from{opacity:0;transform:translateX(-300px)}to{opacity:1;transform:none}}.a{animation:g 1s both}</style><circle class='a' cx='450' cy='350' r='160' fill='var(--a)'/></svg>";
    const st = await drawingStills({ preset: 'editorial' }, '#e8590c', [{ id: 'x', html, w: 900, h: 700, says: 'x' }], [0.01, 2]);
    expect(st.x).toHaveLength(2);
    expect(st.x[0].equals(st.x[1])).toBe(false);
    expect(st.x[1].length).toBeGreaterThan(2500);
  }, 60000);
});
