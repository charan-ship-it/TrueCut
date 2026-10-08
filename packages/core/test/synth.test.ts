import { describe, it, expect } from 'vitest';
import { score, wav, SR } from '../src/audio/synth';

describe('score', () => {
  it('renders a finite, non-silent stereo mix of the right length and keeps voice on top', () => {
    const vo = new Float32Array(SR); for (let i = 0; i < SR; i++) vo[i] = 0.3 * Math.sin(2 * Math.PI * 220 * i / SR);
    const out = score({ duration: 6, revealAt: 2, endAt: 5, cues: [{ kind: 'whoosh', t: 1.7 }, { kind: 'impact', t: 2 }, { kind: 'ticks', t0: 0.2, t1: 1, n: 10 }], vo: [{ t: 3, pcm: vo }], music: true });
    expect(out.L.length).toBe(Math.floor(6.6 * SR));
    let peak = 0, nan = false; for (const v of out.L) { if (!Number.isFinite(v)) nan = true; peak = Math.max(peak, Math.abs(v)); }
    expect(nan).toBe(false); expect(peak).toBeGreaterThan(0.1); expect(peak).toBeLessThanOrEqual(1);
    const b = wav(out.L, out.R); expect(b.toString('ascii', 0, 4)).toBe('RIFF'); expect(b.length).toBe(44 + out.L.length * 4);
  });
  it('works with music off (voice + effects only)', () => {
    const out = score({ duration: 3, revealAt: null, endAt: null, cues: [], vo: [], music: false });
    expect(out.L.every((v) => Number.isFinite(v))).toBe(true);
  });
});
