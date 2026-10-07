// Original procedural score + sound design, driven by the composition timeline.
// Nine genres (pulse, cinematic, lofi, synthwave, house, trap, piano, ambient, bright), each with
// its own tempo, key, progression, drum pattern and instruments — picked per video by the creative
// direction. Tension until the reveal, a drop on the reveal, a groove, an end sting on the end card.
// Every UI cue (counters, typing, clicks, stamps, slams) gets a sound. No samples: nothing to license.

export const SR = 48000;
type Buf = Float32Array<ArrayBufferLike>;

function mulberry(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let R = mulberry(11);
const gauss = () => { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const noise = (n: number) => { const b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = gauss(); return b; };
const N = (sec: number) => Math.max(1, Math.floor(sec * SR));

// RBJ biquad
function biquad(x: Buf, type: 'lp' | 'hp' | 'bp', f: number, q = 0.707): Buf {
  const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2; const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const lp = (x: Buf, f: number, q?: number) => biquad(x, 'lp', f, q);
const hp = (x: Buf, f: number) => biquad(x, 'hp', f);
const bp = (x: Buf, lo: number, hi: number) => biquad(x, 'bp', Math.sqrt(lo * hi), Math.sqrt(lo * hi) / (hi - lo));
function sweepBP(x: Buf, f0: number, f1: number, chunks = 32, rev = false) {
  const y = new Float32Array(x.length);
  for (let c = 0; c < chunks; c++) { const a = Math.floor((c * x.length) / chunks), b = Math.floor(((c + 1) * x.length) / chunks); const fr = rev ? 1 - c / chunks : c / chunks; const fc = f0 * Math.pow(f1 / f0, fr); const seg = bp(x, fc * 0.6, Math.min(fc * 1.6, 20000)); y.set(seg.subarray(a, b), a); }
  return y;
}
function env(n: number, a: number, d: number) { const e = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; e[i] = Math.min(1, t / Math.max(a, 1e-4)) * Math.exp(-t / d); } return e; }
const mul = (x: Buf, e: Buf | number) => { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * (typeof e === 'number' ? e : e[i] ?? 0); return y; };
const add = (...xs: Buf[]) => { const n = Math.max(...xs.map((x) => x.length)); const y = new Float32Array(n); for (const x of xs) for (let i = 0; i < x.length; i++) y[i] += x[i]; return y; };
function sine(fn: (t: number) => number, n: number) { const y = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { ph += (2 * Math.PI * fn(i / SR)) / SR; y[i] = Math.sin(ph); } return y; }
function saw(f: number, n: number, det = 0) { const y = new Float32Array(n); const ff = f * (1 + det); for (let i = 0; i < n; i++) { const ph = (ff * i) / SR; y[i] = 2 * (ph - Math.floor(ph + 0.5)); } return y; }
const tanh = (x: Buf, k = 1) => { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = Math.tanh(x[i] * k); return y; };

class Bus { L: Buf; R: Buf; constructor(n: number) { this.L = new Float32Array(n); this.R = new Float32Array(n); }
  place(sig: Buf, t0: number, g = 1, pan = 0) { const i0 = Math.floor(t0 * SR); const gl = g * (1 - Math.max(0, pan)), gr = g * (1 + Math.min(0, pan));
    for (let k = 0; k < sig.length; k++) { const i = i0 + k; if (i < 0) continue; if (i >= this.L.length) break; this.L[i] += sig[k] * gl; this.R[i] += sig[k] * gr; } } }

// ── instruments ──
const kick = (hard = 1) => { const n = N(0.45); const s = sine((t) => 48 + 110 * Math.exp(-t / 0.035), n); for (let i = 0; i < n; i++) s[i] *= Math.exp(-i / SR / (0.28 * hard)); const c = hp(noise(N(0.004)), 3000); for (let i = 0; i < c.length; i++) s[i] += c[i] * 0.3; return tanh(s, 1.6); };
const clap = () => { const n = N(0.35); const s = new Float32Array(n); [0, 0.011, 0.022].forEach((o, k) => { const i0 = N(o); const b = noise(n - i0); for (let i = 0; i < b.length; i++) s[i0 + i] += b[i] * Math.exp(-i / SR / (k < 2 ? 0.012 : 0.12)); }); return bp(s, 900, 3200); };
const hat = (open = false) => { const n = N(open ? 0.25 : 0.05); return mul(hp(noise(n), 7500), env(n, 0.0005, open ? 0.09 : 0.014)); };
const tick = (g = 1) => mul(hp(noise(N(0.02)), 2500), mul(env(N(0.02), 0.0005, 0.004), g));
const blip = (f: number, d = 0.08) => mul(sine(() => f, N(d)), env(N(d), 0.002, d / 4));
const bell = (f: number, dur = 1.4, d = 0.5) => { const n = N(dur); const y = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; y[i] = (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.01 * t) * Math.exp(-t / 0.15) + 0.2 * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t / 0.07)) * Math.min(1, t / 0.002) * Math.exp(-t / d); } return y; };
const whoosh = (dur = 0.45, f0 = 400, f1 = 4000) => { const n = N(dur); const o = sweepBP(noise(n), f0, f1, 24); for (let i = 0; i < n; i++) o[i] *= Math.sin((Math.PI * i) / n) ** 2; return o; };
const snare = () => { const n = N(0.12); const s = mul(bp(noise(n), 1200, 6000), env(n, 0.0005, 0.04)); for (let i = 0; i < n; i++) s[i] += 0.4 * Math.sin(2 * Math.PI * 190 * (i / SR)) * Math.exp(-i / SR / 0.03); return s; };

// Freeverb-lite (4 combs + 2 allpasses) — cheap, smooth tail
function reverb(x: Buf) {
  const combs = [1557, 1617, 1491, 1422].map((d) => Math.round((d * SR) / 44100)); const aps = [556, 441].map((d) => Math.round((d * SR) / 44100));
  const out = new Float32Array(x.length);
  for (const d of combs) { const buf = new Float32Array(d); let idx = 0, lpv = 0; for (let i = 0; i < x.length; i++) { const y = buf[idx]; lpv = y * 0.6 + lpv * 0.4; buf[idx] = x[i] + lpv * 0.82; idx = (idx + 1) % d; out[i] += y * 0.25; } }
  for (const d of aps) { const buf = new Float32Array(d); let idx = 0; for (let i = 0; i < out.length; i++) { const b = buf[idx]; const y = -out[i] + b; buf[idx] = out[i] + b * 0.5; idx = (idx + 1) % d; out[i] = y; } }
  return out;
}


// extra instruments
const keys = (f: number, dur = 1.2) => { const n = N(dur); const y = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; const trem = 1 + 0.15 * Math.sin(2 * Math.PI * 5 * t); y[i] = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t / 0.3) + 0.12 * Math.sin(2 * Math.PI * f * 4.01 * t) * Math.exp(-t / 0.05)) * trem * Math.min(1, t / 0.004) * Math.exp(-t / (dur * 0.45)); } return y; };
const strings = (fs: number[], dur: number) => { const n = N(dur); let s: Buf = new Float32Array(n); for (const f of fs) for (const d of [-0.006, 0, 0.006]) s = add(s, saw(f, n, d)); s = lp(s, 1100); for (let i = 0; i < n; i++) { const t = i / SR; s[i] *= Math.min(1, t / Math.min(0.6, dur * 0.4)) * Math.min(1, Math.max(0, (dur - t) / 0.4)); } return s; };
const stab = (fs: number[], dur = 0.22) => { const n = N(dur); let s: Buf = new Float32Array(n); for (const f of fs) s = add(s, saw(f, n, 0.004), mul(sine(() => f * 2, n), 0.5)); return mul(lp(s, 2400), env(n, 0.002, dur / 3)); };
const pluck = (f: number, d = 0.18, cut = 2600) => { const m = N(d); return mul(lp(saw(f, m), cut), env(m, 0.002, d / 3)); };
const b808 = (f: number, dur = 0.8) => { const n = N(dur); const s = sine((t) => f * (1 + 0.5 * Math.exp(-t / 0.03)), n); for (let i = 0; i < n; i++) s[i] *= Math.min(1, i / N(0.003)) * Math.exp(-i / SR / (dur * 0.6)); return tanh(s, 2.2); };
const subBass = (f: number, dur: number) => { const n = N(dur); const s = sine(() => f, n); for (let i = 0; i < n; i++) { const t = i / SR; s[i] *= Math.min(1, t / 0.01) * Math.min(1, Math.max(0, (dur - t) / 0.05)); } return s; };
const shaker = () => { const n = N(0.06); return mul(hp(noise(n), 5000), env(n, 0.006, 0.02)); };
const rim = () => { const n = N(0.05); return add(mul(bp(noise(n), 1500, 4000), env(n, 0.0005, 0.008)), mul(sine(() => 1700, n), env(n, 0.0005, 0.01))); };
const bigSnare = () => { const s = snare(); const n = N(0.6); const t = new Float32Array(n); t.set(s); const tail = mul(bp(noise(n), 1500, 7000), env(n, 0.001, 0.18)); return add(t, mul(tail, 0.5)); };
const crackle = (dur: number) => { const n = N(dur); const y = new Float32Array(n); for (let i = 0; i < n; i++) if (R() < 0.0009) { const a = (R() - 0.5) * 0.8; for (let k = 0; k < 40 && i + k < n; k++) y[i + k] += a * Math.exp(-k / 6); } const hiss = lp(noise(n), 6000); for (let i = 0; i < n; i++) y[i] += hiss[i] * 0.012; return y; };
const slamHit = () => { const n = N(0.5); const k = kick(0.8); const nz = mul(bp(noise(n), 300, 5000), env(n, 0.0005, 0.06)); return tanh(add(k, nz), 1.3); };

// ── genres ──
type Prog = { ch: number[][]; root: number[] };
const PROGS: Record<string, Prog> = {
  minor: { ch: [[0, 3, 7, 10], [-4, 0, 3, 8], [3, 7, 10, 14], [-2, 2, 5, 10]], root: [0, -4, 3, -2] },
  major: { ch: [[0, 4, 7, 11], [-5, -1, 2, 7], [-3, 0, 4, 9], [-7, -3, 0, 5]], root: [0, -5, -3, 5] },
  jazz: { ch: [[0, 3, 7, 10, 14], [-7, -4, 0, 3, 7], [-2, 2, 5, 9], [3, 7, 10, 14]], root: [0, 5, -2, 3] },
  dark: { ch: [[0, 3, 7], [-4, 0, 3], [-5, -2, 2], [-4, 0, 3]], root: [0, -4, -5, -4] },
  epic: { ch: [[0, 3, 7], [-4, 0, 3, 8], [-7, -3, 0], [-2, 2, 5]], root: [0, -4, 5, -2] },
};
type G = {
  prog: string; steps: { k: number[]; s?: number[]; c?: number[]; h?: number[]; o?: number[]; sh?: number[]; r?: number[] };
  swing?: number; snare?: 'snare' | 'big'; kickHard?: number; hatRolls?: boolean;
  chord: 'pad' | 'keys' | 'strings' | 'stab' | 'none'; lead: 'arp' | 'pluck' | 'bell' | 'keys' | 'none';
  bass: 'pulse' | 'offbeat' | '808' | 'octave' | 'sub' | 'none'; crackle?: boolean; pre: 'drone' | 'strings' | 'keys' | 'arp' | 'dark';
  drums?: number; music?: number; sidechain?: number; boom?: boolean;
};
const ALL16 = [...Array(16).keys()];
export const GENRE: Record<string, G> = {
  pulse: { prog: 'minor', steps: { k: [0, 4, 8, 12], c: [4, 12], h: [2, 6, 10, 14], sh: [1, 3, 5, 7, 9, 11, 13, 15], o: [14] }, chord: 'pad', lead: 'arp', bass: 'offbeat', pre: 'drone', sidechain: 0.55 },
  synthwave: { prog: 'minor', steps: { k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14] }, snare: 'big', chord: 'pad', lead: 'arp', bass: 'octave', pre: 'arp', sidechain: 0.35 },
  house: { prog: 'major', steps: { k: [0, 4, 8, 12], c: [4, 12], o: [2, 6, 10, 14], sh: ALL16.filter((x) => x % 2) }, chord: 'stab', lead: 'none', bass: 'offbeat', pre: 'keys', sidechain: 0.6 },
  trap: { prog: 'dark', steps: { k: [0, 7, 10], s: [8], h: [0, 2, 4, 6, 8, 10, 12, 14] }, hatRolls: true, chord: 'none', lead: 'bell', bass: '808', pre: 'dark', kickHard: 0.7, drums: 1.1 },
  lofi: { prog: 'jazz', steps: { k: [0, 7, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] }, swing: 0.32, chord: 'keys', lead: 'none', bass: 'sub', crackle: true, pre: 'keys', kickHard: 0.8, drums: 0.8 },
  cinematic: { prog: 'epic', steps: { k: [0, 10], r: [] }, chord: 'strings', lead: 'bell', bass: 'sub', pre: 'strings', boom: true, kickHard: 1.4, drums: 0.9, music: 1.2 },
  piano: { prog: 'major', steps: { k: [0, 8], sh: [2, 6, 10, 14], r: [4, 12] }, chord: 'keys', lead: 'keys', bass: 'sub', pre: 'keys', kickHard: 0.7, drums: 0.55 },
  ambient: { prog: 'minor', steps: { k: [0, 8], h: [4, 12], r: [6, 14] }, chord: 'pad', lead: 'bell', bass: 'sub', pre: 'drone', kickHard: 0.7, drums: 0.6, music: 1.15 },
  bright: { prog: 'major', steps: { k: [0, 6, 8], c: [4, 12], sh: ALL16.filter((x) => x % 2), h: [2, 10] }, chord: 'stab', lead: 'pluck', bass: 'pulse', pre: 'arp', sidechain: 0.4 },
};

export type Cue = { kind: string; t?: number; t0?: number; t1?: number; n?: number; f?: number; g?: number; d?: number; rate?: number; k?: number };
export type ScoreInput = { voPresence?: number; musicGain?: number; duration: number; revealAt: number | null; endAt: number | null; cues: Cue[]; vo: { t: number; pcm: Float32Array }[]; music: boolean | { genre?: string; bpm?: number; key?: number }; seed?: number };

export function score(inp: ScoreInput): { L: Buf; R: Buf } {
  R = mulberry(inp.seed ?? 11);
  const mopt = typeof inp.music === 'object' ? inp.music : {};
  const musicOn = inp.music !== false;
  const gname = GENRE[mopt.genre || ''] ? mopt.genre! : 'pulse';
  const G = GENRE[gname];
  const BEAT = 60 / Math.max(60, Math.min(160, mopt.bpm || 120));
  const S16 = BEAT / 4, BAR = BEAT * 4;
  let key = Math.round(mopt.key || 0) % 12; if (key > 6) key -= 12;
  const tr = Math.pow(2, key / 12);
  const P = PROGS[G.prog];
  const hz = (semi: number, base = 220) => base * tr * Math.pow(2, semi / 12);
  const DUR = inp.duration + 0.6; const n = N(DUR);
  const MUS = new Bus(n), DRM = new Bus(n), SFX = new Bus(n);
  const HIRE = inp.revealAt ?? Math.min(3, inp.duration * 0.15);
  const END = inp.endAt ?? inp.duration;
  if (musicOn) {
    const root0 = hz(P.root[0], 55);
    // ── pre-drop tension (genre-flavoured) ──
    const pn = N(HIRE + 0.4);
    const fadeAtDrop = (i: number) => 1 - Math.min(1, Math.max(0, (i / SR - (HIRE - 0.15)) / 0.12));
    if (G.pre === 'drone' || G.pre === 'dark') {
      const drone: Buf = new Float32Array(pn); const s3 = lp(saw(root0 * 2, pn, 0.003), G.pre === 'dark' ? 250 : 400);
      for (let i = 0; i < pn; i++) { const t = i / SR; drone[i] = (Math.sin(2 * Math.PI * root0 * t) + 0.5 * Math.sin(2 * Math.PI * root0 * 1.4983 * t) + 0.25 * s3[i]) * Math.min(1, t / 1.2) * fadeAtDrop(i) * (0.55 + 0.45 * Math.min(1, t / Math.max(1, HIRE - 0.5))); }
      MUS.place(drone, 0, 0.16);
    }
    if (G.pre === 'strings') { const s = strings(P.ch[0].map((x) => hz(x - 12)), HIRE + 0.2); for (let i = 0; i < s.length; i++) s[i] *= fadeAtDrop(i) * Math.min(1, (i / SR) / Math.max(0.5, HIRE * 0.7)); MUS.place(s, 0, 0.09); }
    if (G.pre === 'keys') for (let t = 0, k = 0; t < HIRE - 0.3; t += BEAT, k++) { const ch = P.ch[Math.floor(t / BAR) % 4]; MUS.place(keys(hz(ch[k % ch.length]), BEAT * 2), t, 0.13 * Math.min(1, 0.4 + t / HIRE), k % 2 ? 0.3 : -0.3); }
    if (G.pre === 'arp') for (let t = 0, k = 0; t < HIRE - 0.2; t += S16 * 2, k++) { const ch = P.ch[Math.floor(t / BAR) % 4]; MUS.place(pluck(hz(ch[[0, 2, 1, 3][k % 4] % ch.length]) * 2, 0.16, 500 + 2500 * (t / HIRE)), t, 0.08 + 0.06 * (t / HIRE), k % 2 ? 0.35 : -0.35); }
    if (G.pre === 'dark') for (let t = 0, k = 0; t < HIRE - 0.3; t += BEAT * 2, k++) MUS.place(bell(hz(P.ch[0][k % 3] + 12), 1.6, 0.6), t, 0.06, k % 2 ? 0.3 : -0.3);
    for (let t = 0; t < HIRE - 0.5; t += BEAT * 2) { DRM.place(kick(0.6), t, G.pre === 'keys' ? 0.25 : 0.45); if (gname !== 'cinematic') DRM.place(kick(0.5), t + BEAT / 3, 0.2); }
    if (G.boom) for (let t = 0; t < HIRE - 0.5; t += BAR) DRM.place(tanh(sine((tt) => 45 + 30 * Math.exp(-tt / 0.2), N(1.6)).map((v, i) => v * Math.exp(-i / SR / 0.6)) as Buf, 1.5), t, 0.5);
    for (let t = Math.min(3, HIRE * 0.33); t < HIRE - 0.15; t += S16) DRM.place(hat(), t, (0.08 + 0.1 * Math.min(1, t / HIRE)) * (gname === 'cinematic' || gname === 'piano' ? 0.4 : 1), Math.round(t / S16) % 2 ? 0.25 : -0.25);
    for (let t = Math.max(0, HIRE - 3.5); t < HIRE - 0.25; t += S16) { const k = N(0.22); MUS.place(mul(lp(saw(root0, k), 220 + 900 * (1 - (HIRE - t) / 3.5)), env(k, 0.005, 0.09)), t, 0.22); }
    // ── groove after the drop ──
    const kenv = new Float32Array(n);
    const dl = G.drums ?? 1, ml = G.music ?? 1;
    const swing = (step: number) => (step % 2 ? (G.swing || 0) * S16 : 0);
    for (let bar = 0; HIRE + bar * BAR < END - 0.01; bar++) {
      const t0 = HIRE + bar * BAR; const ci = bar % 4; const ch = P.ch[ci]; const rf = hz(P.root[ci], 55);
      for (let st = 0; st < 16; st++) {
        const t = t0 + st * S16 + swing(st); if (t >= END - 0.01) break;
        const S = G.steps;
        if (S.k.includes(st)) { DRM.place(G.boom && st === 0 ? tanh(add(kick(G.kickHard || 1), mul(sine((tt) => 40 + 30 * Math.exp(-tt / 0.2), N(1.2)), env(N(1.2), 0.002, 0.5))), 1.3) : kick(G.kickHard || 1), t, 0.85 * dl); const i0 = N(t); for (let k = 0; k < N(0.3) && i0 + k < n; k++) kenv[i0 + k] = Math.max(kenv[i0 + k], Math.exp(-k / SR / 0.09)); }
        if (S.c?.includes(st)) DRM.place(clap(), t, 0.5 * dl);
        if (S.s?.includes(st)) DRM.place(G.snare === 'big' ? bigSnare() : snare(), t, 0.55 * dl);
        if (S.h?.includes(st)) DRM.place(hat(), t, 0.2 * dl, 0.2);
        if (S.o?.includes(st)) DRM.place(hat(true), t, 0.14 * dl, 0.3);
        if (S.sh?.includes(st)) DRM.place(shaker(), t, 0.1 * dl, -0.3);
        if (S.r?.includes(st)) DRM.place(rim(), t, 0.16 * dl, -0.2);
        if (G.hatRolls && st >= 12 && bar % 2 === 1) for (let r = 0; r < 3; r++) DRM.place(hat(), t + (r * S16) / 3, 0.12 * dl, 0.25);
        // bass
        if (G.bass === 'offbeat' && st % 4 === 2) { const k = N(S16 * 1.6); MUS.place(mul(lp(add(saw(rf, k), mul(sine(() => rf, k), 0.6)), 380), env(k, 0.004, 0.12)), t, 0.5); }
        if (G.bass === 'octave' && st % 2 === 0) { const k = N(S16 * 1.6); const f = rf * (st % 4 ? 2 : 1); MUS.place(mul(lp(saw(f, k), 600), env(k, 0.003, 0.1)), t, 0.4); }
        if (G.bass === 'pulse' && [0, 3, 6, 10, 12].includes(st)) { const k = N(S16 * 1.5); MUS.place(mul(lp(add(saw(rf * 2, k), sine(() => rf, k)), 700), env(k, 0.003, 0.09)), t, 0.4); }
        if (G.bass === '808' && G.steps.k.includes(st)) MUS.place(b808(rf, Math.min(BEAT * 2.5, 1.4)), t, 0.7);
      }
      if (G.bass === 'sub') MUS.place(subBass(rf, Math.min(BAR, END - t0) - 0.02), t0, 0.35);
      // chords
      const m = Math.min(BAR + 0.3, END - t0 + 0.3);
      if (G.chord === 'pad') { let pad: Buf = new Float32Array(N(m)); for (const f of ch.map((x) => hz(x))) for (const d of [-0.004, 0.004]) pad = add(pad, saw(f, N(m), d)); pad = lp(pad, gname === 'ambient' ? 900 : 1400); for (let i = 0; i < pad.length; i++) { const t = i / SR; pad[i] *= Math.min(1, t / 0.25) * Math.min(1, Math.max(0, (m - t) / 0.3)); } MUS.place(pad, t0, 0.045 * ml, -0.15); MUS.place(pad, t0 + 0.012, 0.045 * ml, 0.15); }
      if (G.chord === 'strings') { const s = strings(ch.map((x) => hz(x - 12)), m); MUS.place(s, t0, 0.07 * ml, -0.1); MUS.place(strings(ch.map((x) => hz(x)), m), t0, 0.04 * ml, 0.1); }
      if (G.chord === 'keys') for (const off of gname === 'lofi' ? [0, BEAT * 1.5 + S16 * (G.swing || 0), BEAT * 3] : [0, BEAT * 2]) if (t0 + off < END) ch.forEach((x, j) => MUS.place(keys(hz(x), BEAT * 2.2), t0 + off + j * 0.012, 0.07 * ml, j % 2 ? 0.2 : -0.2));
      if (G.chord === 'stab') for (const st of gname === 'house' ? [2, 6, 10, 14] : [0, 3, 6, 10]) { const t = t0 + st * S16; if (t < END) MUS.place(stab(ch.map((x) => hz(x))), t, 0.06 * ml, st % 4 ? 0.2 : -0.2); }
      // lead
      if (G.lead === 'arp') for (let k = 0; k < 16; k++) { const t = t0 + k * S16; if (t >= END) break; MUS.place(pluck(hz(ch[[0, 2, 1, 3][k % 4] % ch.length]) * 2, Math.min(0.16, S16 * 1.3)), t, 0.085 * ml, k % 2 ? 0.35 : -0.35); }
      if (G.lead === 'pluck') [0, 3, 6, 8, 11, 14].forEach((k, j) => { const t = t0 + k * S16; if (t < END) MUS.place(pluck(hz(ch[(j * 2) % ch.length]) * 2, 0.22, 3500), t, 0.1 * ml, j % 2 ? 0.3 : -0.3); });
      if (G.lead === 'bell') [0, 6, 10].forEach((k, j) => { const t = t0 + k * S16; if (t < END) MUS.place(bell(hz(ch[(bar + j) % ch.length] + 12), 1.5, 0.5), t, 0.07 * ml, j % 2 ? 0.3 : -0.3); });
      if (G.lead === 'keys') for (let k = 0; k < 8; k++) { const t = t0 + k * S16 * 2; if (t >= END) break; MUS.place(keys(hz(ch[[0, 1, 2, 3, 2, 1, 2, 3][k] % ch.length] + 12), 0.9), t, 0.06 * ml, k % 2 ? 0.3 : -0.3); }
    }
    if (G.crackle) MUS.place(crackle(END - HIRE + 0.5), HIRE, 0.5);
    for (let k = 0; k < 8 && END - 2 * BEAT + k * BEAT / 4 > HIRE; k++) DRM.place(snare(), END - 2 * BEAT + k * BEAT / 4, (0.18 + 0.05 * k) * dl);
    const sc = G.sidechain ?? 0.3; for (let i = 0; i < n; i++) { const v = 1 - sc * kenv[i]; MUS.L[i] *= v; MUS.R[i] *= v; }
    // end sting: the tonic chord, voiced wide
    const sn = N(3.2); let st: Buf = new Float32Array(sn); for (const f of [...P.ch[0].map((x) => hz(x)), hz(P.ch[0][0] - 12), hz(P.ch[0][2] + 12)]) for (const d of [-0.003, 0.003]) st = add(st, saw(f, sn, d));
    st = lp(st, 2000); for (let i = 0; i < sn; i++) { const t = i / SR; st[i] *= Math.min(1, t / 0.05) * Math.exp(-t / 1.6); }
    MUS.place(st, END, 0.07);
    for (let i = 0; i < n; i++) { const t = i / SR; const g = t >= HIRE && t < END ? 0.5 : 1; MUS.L[i] *= g; MUS.R[i] *= g; DRM.L[i] *= g; DRM.R[i] *= g; }
  }
  // cues
  for (const c of inp.cues) {
    const t = c.t ?? 0;
    switch (c.kind) {
      case 'whoosh': SFX.place(whoosh(c.d || 0.45), t, 0.35, R() * 0.6 - 0.3); break;
      case 'ticks': { const k = c.n || 20; for (let i = 0; i < k; i++) { const u = i / k; SFX.place(tick(), c.t0! + (c.t1! - c.t0!) * (1 - Math.pow(1 - u, 1.8)), 0.5 * (1 - 0.5 * u), R() * 0.4 - 0.2); } break; }
      case 'blip': SFX.place(blip(c.f || 880, c.d || 0.1), t, c.g ?? 0.15); break;
      case 'scan': SFX.place(whoosh(c.d || 1.3, 200, 2500), t, 0.22); break;
      case 'pings': for (let i = 0; i < (c.n || 8); i++) SFX.place(blip(1600 + 140 * i, 0.1), t + i * 0.12, 0.07, R() - 0.5); break;
      case 'shimmer': for (let i = 0; i < 40; i++) SFX.place(blip(2000 + R() * 2500, 0.06), t + R() * (c.d || 0.9), 0.04, R() * 1.4 - 0.7); break;
      case 'riser': if (musicOn) { const d = c.d || 1.6; const m = N(d); const o = sweepBP(noise(m), 300, 6000, 40); const sw = sine((tt) => 180 + 900 * (tt / d) ** 2, m); for (let i = 0; i < m; i++) { const u = i / m; o[i] = o[i] * u ** 2.2 + 0.35 * sw[i] * u * u; } for (let i = Math.max(0, m - N(0.08)); i < m; i++) o[i] *= (m - i) / N(0.08); SFX.place(o, t, 0.5); } break;
      case 'impact': if (musicOn) { const m = N(2.2); const boom = tanh(sine((tt) => 30 + 40 * Math.exp(-tt / 0.15), m), 2); const cr = hp(noise(m), 3500); const o = new Float32Array(m); for (let i = 0; i < m; i++) { const tt = i / SR; o[i] = boom[i] * Math.exp(-tt / 0.9) * 0.9 + cr[i] * Math.exp(-tt / 1.1) * 0.35; } SFX.place(o, t, 0.9); } break;
      case 'typing': { const dur = Math.max(0.2, (c.t1 ?? t) - (c.t0 ?? t)); const k = Math.min(140, Math.round(dur * (c.rate || 30))); for (let i = 0; i < k; i++) SFX.place(tick(0.7), c.t0! + (i / k) * dur + R() * 0.01, 0.23, R() * 0.4 - 0.2); break; }
      case 'gauge': for (let i = 0; i < Math.min(12, c.n || 5); i++) SFX.place(blip(660 * Math.pow(2, (i * 2) / 12), 0.09), t + i * 0.1, 0.13); break;
      case 'stamp': SFX.place(blip(523.25, 0.2), t, 0.25); SFX.place(blip(784, 0.25), t + 0.05, 0.2); break;
      case 'click': SFX.place(tick(c.g || 1.5), t, 0.5); break;
      case 'success': [[523.25, 0], [659.25, 0.06], [783.99, 0.12]].forEach(([f, o]) => SFX.place(bell(f, 1, 0.35), t + o, 0.14)); break;
      case 'sweep': SFX.place(whoosh(0.6, 800, 6000), t, 0.25); SFX.place(blip(1318.5, 0.3), t + 0.5, 0.15); break;
      case 'sting': if (musicOn) { const m = N(2); SFX.place(tanh(sine((tt) => 38 + 50 * Math.exp(-tt / 0.1), m), 2).map((v, i) => v * Math.exp(-i / SR / 0.7)) as Buf, t, 0.6); } break;
      case 'slam': SFX.place(slamHit(), t, 0.55, ((c.k || 0) % 2 ? 0.2 : -0.2)); SFX.place(blip(hz([0, 3, 7, 10, 12][(c.k || 0) % 5] + 12), 0.12), t + 0.01, 0.08); break;
      case 'logo': SFX.place(bell(1318.51), t, 0.22); SFX.place(bell(1975.53, 1.2, 0.4), t + 0.07, 0.12); break;
    }
  }
  // voice + ducking
  const vo = new Float32Array(n);
  for (const v of inp.vo) { const i0 = N(v.t); for (let k = 0; k < v.pcm.length && i0 + k < n; k++) vo[i0 + k] += v.pcm[k]; }
  const pres = bp(vo, 2500, 6000); const presence = inp.voPresence ?? 0.25; for (let i = 0; i < n; i++) vo[i] += presence * pres[i];
  const win = N(0.2); const duck = new Float32Array(n); let acc = 0; const half = win >> 1;
  for (let i = 0; i < n + half; i++) { if (i < n) acc += Math.abs(vo[i]); if (i - win >= 0) acc -= Math.abs(vo[i - win]); const j = i - half; if (j >= 0 && j < n) duck[j] = 1 - 0.6 * Math.min(1, acc / win / 0.012); }
  const sm = lp(duck, 6);
  const L = new Float32Array(n), Rr = new Float32Array(n);
  const wetInL = new Float32Array(n), wetInR = new Float32Array(n);
  for (let i = 0; i < n; i++) { const mg = inp.musicGain ?? 1; const mL = (MUS.L[i] * 0.38 + DRM.L[i] * 0.42) * mg, mR = (MUS.R[i] * 0.38 + DRM.R[i] * 0.42) * mg; wetInL[i] = mL * 0.5 + SFX.L[i] * 0.33; wetInR[i] = mR * 0.5 + SFX.R[i] * 0.33; L[i] = mL + SFX.L[i] * 0.55; Rr[i] = mR + SFX.R[i] * 0.55; }
  const wL = reverb(wetInL), wR = reverb(wetInR);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) { L[i] = (L[i] + wL[i] * 0.18) * sm[i] + vo[i]; Rr[i] = (Rr[i] + wR[i] * 0.18) * sm[i] + vo[i]; peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rr[i])); }
  const fadeStart = n - N(0.6);
  for (let i = 0; i < n; i++) { const f = i > fadeStart ? (n - i) / (n - fadeStart) : 1; L[i] = (Math.tanh((L[i] / peak) * 1.1) / Math.tanh(1.1)) * 0.95 * f; Rr[i] = (Math.tanh((Rr[i] / peak) * 1.1) / Math.tanh(1.1)) * 0.95 * f; }
  return { L, R: Rr };
}

export function wav(L: Buf, R: Buf): Buffer {
  const n = L.length; const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); }
  return b;
}
