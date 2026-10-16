import { describe, it, expect } from 'vitest';
import { normalizeScene } from '../src/ads/ai';
import { checkScenes } from '@truecut/shared/facts';

const proj = (scenes: any[] = []): any => ({ intake: { brandName: 'Acme', productName: 'Acme', oneLiner: '', avatarVisual: '' }, visuals: [], facts: [{ id: 'f1', approved: true, status: 'verified', kind: 'metric', statement: 'Saves 40% of time', value: 40, quote: 'saves 40%' }], scenes, questions: [] });

describe('freehand ad scene', () => {
  it('keeps the drawing but strips scripts and handlers', () => {
    const s = normalizeScene(proj(), { type: 'custom', vo: 'x', props: { html: "<svg viewBox='0 0 1080 1080'><script>alert(1)</script><rect onclick='x()' width='9'/></svg>" } });
    expect(s.type).toBe('custom');
    expect(s.props.html).toContain('<rect');
    expect(s.props.html).not.toMatch(/script|onclick/i);
  });
  it('falls back to a headline when there is no drawing', () => {
    const s = normalizeScene(proj(), { type: 'custom', vo: 'Every claim has a source', props: { html: 'nothing here' } });
    expect(s.type).toBe('headline');
  });
  it('fact-checks only the words on screen, not CSS numbers', () => {
    const ok = proj([{ id: 's1', type: 'custom', props: { html: "<svg style='width:900px'><style>.a{opacity:.35;stroke-width:8}</style><text>Saves 40%</text></svg>" }, facts: ['f1'] }]);
    expect(checkScenes(ok).filter((i) => i.level === 'error')).toHaveLength(0);
    const bad = proj([{ id: 's1', type: 'custom', props: { html: "<svg><text>Saves 73%</text></svg>" }, facts: [] }]);
    expect(checkScenes(bad).filter((i) => i.level === 'error')).toHaveLength(1);
  });
});
