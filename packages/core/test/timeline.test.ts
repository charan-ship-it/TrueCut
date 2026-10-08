import { describe, it, expect } from 'vitest';
import { layout, snap, SCENE_TYPES, FORMATS } from '@truecut/engine/timeline.js';

// a small public storyboard (one of each common scene role) with voiced lines
const line = (text: string, duration: number) => ({ text, duration });
const demo = { scenes: [
  { id: 's1', type: 'stat', vo: line('One hundred eighty-nine meetings.', 2.1), props: { value: 189 } },
  { id: 's2', type: 'headline', vo: line('Every one of them, full of ideas.', 2.3), props: { lines: ['Every one of them,', 'full of ideas.'] } },
  { id: 's3', type: 'bars', vo: line('Hiding in plain sight.', 1.6), props: { value: 457 } },
  { id: 's4', type: 'reveal', vo: line('Meet Nick.', 0.9), props: { title: 'Meet Nick.' } },
  { id: 's5', type: 'card', vo: line('He reads every call and scores every idea.', 2.8), props: {} },
  { id: 's6', type: 'end', vo: line('Book a demo.', 1.0), props: { wordmark: 'Nick' } },
] };

describe('timeline', () => {
  it('snaps durations to the 120 BPM beat grid', () => {
    const L = layout(demo);
    for (const s of L.scenes) expect((s.dur / 0.5) % 1).toBe(0);
    expect(snap(2.26)).toBe(2.5);
  });
  it('respects per-type min/max unless the voice needs longer', () => {
    const L = layout(demo);
    for (const s of L.scenes) { const d = (SCENE_TYPES as any)[s.type]; expect(s.dur).toBeGreaterThanOrEqual(d.min); }
    const long = layout({ scenes: [{ id: 'a', type: 'reveal', vo: { text: 'x', duration: 6 } }] });
    expect(long.scenes[0].dur).toBeGreaterThanOrEqual(6);
  });
  it('places the drop on the reveal scene and the sting on the end card', () => {
    const L = layout(demo);
    expect(L.revealAt).toBe(L.scenes.find((s: any) => s.type === 'reveal').start);
    expect(L.cues.some((c: any) => c.kind === 'impact' && c.t === L.revealAt)).toBe(true);
    expect(L.cues.some((c: any) => c.kind === 'sting')).toBe(true);
  });
  it('builds captions with increasing word times inside each line', () => {
    const L = layout(demo);
    expect(L.captions.length).toBe(demo.scenes.length);
    for (const c of L.captions) for (let i = 1; i < c.words.length; i++) expect(c.words[i].t).toBeGreaterThanOrEqual(c.words[i - 1].t);
  });
  it('uses ElevenLabs word timings when they match the caption', () => {
    const L = layout({ scenes: [{ id: 'a', type: 'stat', vo: { text: 'Hello big world', duration: 1.2, words: [{ w: 'Hello', s: 0, e: .3 }, { w: 'big', s: .4, e: .6 }, { w: 'world', s: .7, e: 1 }] } }] });
    expect(L.captions[0].words.map((w: any) => +(w.t - L.scenes[0].voStart).toFixed(2))).toEqual([0, 0.4, 0.7]);
  });
  it('has the three social formats', () => { expect(Object.keys(FORMATS)).toEqual(['4x5', '9x16', '1x1']); });
});
