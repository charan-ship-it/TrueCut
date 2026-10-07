import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { layout, snap, SCENE_TYPES, FORMATS } from '../public/engine/timeline.js';

const demo = JSON.parse(fs.readFileSync('scripts/fixtures/agent-nick-demo.json', 'utf8'));

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
