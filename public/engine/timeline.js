// TrueCut — timeline. Pure functions, no DOM: shared by the browser player,
// the server (audio cues, captions, validation) and the tests.
import { resolveStyle } from './styles.js';

export const BEAT = 0.5;            // 120 BPM grid; every cut lands on a beat
export const PRE = 0.18;            // scenes cut in slightly "already moving"
export const VO_LEAD = 0.25;        // voice starts this long after the cut
export const FORMATS = {
  '4x5': { w: 1080, h: 1350, label: 'LinkedIn / Instagram feed 4:5' },
  '9x16': { w: 1080, h: 1920, label: 'Reels / Stories / Shorts 9:16' },
  '1x1': { w: 1080, h: 1080, label: 'Square 1:1' },
};

/** Per scene type: duration bounds (seconds) and a one-line description for the AI + editor. */
export const SCENE_TYPES = {
  stat:     { min: 2.5, max: 4.0, label: 'Big number', desc: 'One real headline number rolls in on an odometer, with a label and up to 3 supporting stat chips. Opens a video well.' },
  headline: { min: 2.5, max: 4.0, label: 'Kinetic headline', desc: 'Up to 3 short lines of huge type over a tilted product screenshot with a scanning line and glowing markers.' },
  bars:     { min: 3.0, max: 4.5, label: 'Number + breakdown', desc: 'Particles converge into a real number, then a bar breakdown (up to 4 rows) and a tagline. Implodes into the reveal if followed by one.' },
  reveal:   { min: 3.0, max: 3.5, label: 'Reveal (the drop)', desc: 'Accent shockwave, the product/character image in a ring with orbiting text, a title and subtitle. The music drops here. Use once.' },
  card:     { min: 3.5, max: 5.0, label: 'Spotlight card', desc: 'A real record (idea, ticket, lead, deal…) rebuilt as a crisp card: typed title, pills, body, note, meta, optional score gauge, over a screenshot.' },
  wall:     { min: 2.5, max: 3.5, label: 'Wall + pick', desc: 'A tilted wall of real items (up to 9) scrolling, one featured item pulled forward and stamped.' },
  selector: { min: 3.5, max: 4.5, label: 'Choose + plan', desc: 'A panel where a choice slides to the selected option, checkboxes tick, and a numbered list builds.' },
  document: { min: 3.0, max: 4.5, label: 'Document typing', desc: 'A real document/draft: title, then lines type out with highlighted words, plus suggestion chips.' },
  action:   { min: 2.5, max: 3.5, label: 'Action + result', desc: 'A big button gets clicked, turns to its done state, and up to 3 result images fan in.' },
  quote:    { min: 3.5, max: 6.0, label: 'Spoken quote', desc: 'A verbatim line from a transcript or customer types in, then an accent highlight sweeps across it.' },
  screen:   { min: 3.0, max: 4.5, label: 'Screen zoom', desc: 'A real screenshot glides in, then the camera zooms to one region with a spotlight and a callout label.' },
  kinetic:  { min: 2.0, max: 4.0, label: 'Kinetic type', desc: '2-6 short phrases (1-3 words each) slam full-screen one after another, alternating ink and accent panels. Pure energy — great for hooks and punchlines.' },
  split:    { min: 3.0, max: 4.5, label: 'Split (image + text)', desc: 'A real screenshot/image fills half the frame with a slow push; a kicker, title and short body sit beside/below it. Editorial and calm.' },
  list:     { min: 3.0, max: 5.0, label: 'List', desc: 'A title and 3-5 items that land one by one with numbers, checks or dots. Steps, features, reasons.' },
  compare:  { min: 3.5, max: 5.0, label: 'Before / after', desc: 'Two columns: the old way (struck through, fading) vs the new way (lit up with checks). Up to 4 items each.' },
  end:      { min: 3.0, max: 4.0, label: 'End card', desc: 'Image, wordmark, tagline and call-to-action button. Always last.' },
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const snap = (x, beat = BEAT) => { const u = beat < 0.45 ? beat * 2 : beat; return Math.max(u, Math.round(x / u) * u); };
export const beatOf = (comp) => 60 / resolveStyle(comp?.style || {}, comp?.brand?.accent).music.bpm;

export function estimateSpeech(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return words ? words / 2.7 + 0.25 : 0;
}

/** Returns timing for every scene, captions with word times, and sound cues. */
export function layout(comp) {
  const scenes = [];
  let t = 0;
  const list = comp.scenes || [];
  const beat = beatOf(comp);
  list.forEach((s, i) => {
    const def = SCENE_TYPES[s.type] || { min: 3, max: 4.5 };
    const vd = s.vo?.text ? (s.vo.duration || estimateSpeech(s.vo.text)) : 0;
    const need = snap(vd + VO_LEAD + 0.55, beat);
    const d = s.duration ? Number(s.duration) : clamp(need, def.min, Math.max(def.max, need));
    scenes.push({ ...s, index: i, start: t, end: t + d, dur: d, voStart: t + VO_LEAD, voDur: vd });
    t += d;
  });
  const duration = t;
  const revealIndex = scenes.findIndex((s) => s.type === 'reveal');
  const captions = buildCaptions(scenes);
  const cues = buildCues(scenes, revealIndex);
  return { scenes, duration, revealIndex, revealAt: revealIndex >= 0 ? scenes[revealIndex].start : null, captions, cues, beat };
}

function buildCaptions(scenes) {
  const out = [];
  for (const s of scenes) {
    if (!s.vo?.text) continue;
    const text = (s.caption || s.vo.text).trim();
    const words = text.split(/\s+/);
    let times;
    const al = s.vo.words;
    if (al && al.length && !s.caption && al.length === words.length) {
      times = al.map((w) => s.voStart + w.s);
    } else {
      const span = Math.max(0.4, (s.voDur || estimateSpeech(text)) - 0.25);
      const tot = words.reduce((a, w) => a + w.length + 1, 0);
      let acc = 0;
      times = words.map((w) => { const st = s.voStart + span * acc / tot; acc += w.length + 1; return st; });
    }
    out.push({ scene: s.index, start: s.voStart, end: s.voStart + Math.max(s.voDur, 0.6), words: words.map((w, i) => ({ w, t: times[i] })) });
  }
  return out;
}

/** Scene-local renderer time T → absolute seconds. Must match runtime.js. */
export function localOffset(s, revealIndex) {
  return s.index === 0 || s.index === revealIndex ? 0 : PRE;
}

function buildCues(scenes, revealIndex) {
  const cues = [];
  const at = (s, T) => s.start + T - localOffset(s, revealIndex);
  scenes.forEach((s, i) => {
    if (i > 0) cues.push({ kind: 'whoosh', t: s.start - 0.3 });
    const p = s.props || {};
    switch (s.type) {
      case 'stat':
        cues.push({ kind: 'ticks', t0: at(s, 0.15), t1: at(s, 1.75), n: 34 }, { kind: 'blip', t: at(s, 1.75), f: 880, g: 0.15, d: 0.25 });
        break;
      case 'headline':
        cues.push({ kind: 'scan', t: at(s, 0.2), d: 1.3 }, { kind: 'pings', t: at(s, 0.3), n: 10 });
        break;
      case 'bars':
        cues.push({ kind: 'shimmer', t: at(s, 0), d: 0.9 }, { kind: 'ticks', t0: at(s, 0.45), t1: at(s, 1.5), n: 28 }, { kind: 'blip', t: at(s, 1.5), f: 880, g: 0.15, d: 0.25 });
        break;
      case 'reveal':
        cues.push({ kind: 'riser', t: s.start - 1.6, d: 1.6 }, { kind: 'impact', t: s.start });
        break;
      case 'card':
        cues.push({ kind: 'typing', t0: at(s, 0.5), t1: at(s, 1.35), rate: 55 });
        if (p.gauge) cues.push({ kind: 'gauge', t: at(s, 0.85), n: Math.max(1, Math.round(p.gauge.value || 0)) });
        break;
      case 'wall':
        cues.push({ kind: 'stamp', t: at(s, 0.95) });
        break;
      case 'selector':
        cues.push({ kind: 'click', t: at(s, 0.55) }, { kind: 'click', t: at(s, 0.9) }, { kind: 'blip', t: at(s, 1.08), f: 987.77, g: 0.25, d: 0.18 });
        (p.checks || []).forEach((c, k) => { if (c.on) cues.push({ kind: 'blip', t: at(s, 1.45 + k * 0.18), f: 1318.5, g: 0.2, d: 0.1 }); });
        break;
      case 'document':
        cues.push({ kind: 'typing', t0: at(s, 0.4), t1: at(s, Math.max(1.2, s.dur - 0.8)), rate: 40 });
        break;
      case 'action':
        cues.push({ kind: 'click', t: at(s, 0.62), g: 2.5 }, { kind: 'success', t: at(s, 0.67) }, { kind: 'whoosh', t: at(s, 0.85), d: 0.5 });
        break;
      case 'quote':
        cues.push({ kind: 'typing', t0: at(s, 0.35), t1: at(s, Math.min(s.dur - 1.4, 2.6)), rate: 22 }, { kind: 'sweep', t: at(s, Math.min(s.dur - 1.2, 2.8)) });
        break;
      case 'screen':
        cues.push({ kind: 'whoosh', t: at(s, 0.05), d: 0.5 }, { kind: 'blip', t: at(s, 1.3), f: 1046.5, g: 0.18, d: 0.2 });
        break;
      case 'kinetic': {
        const n = Math.max(1, (p.words || p.phrases || p.lines || []).length); const span = s.dur - 0.25;
        for (let k = 0; k < n; k++) cues.push({ kind: 'slam', t: at(s, 0.05 + (k * span) / n), k });
        break; }
      case 'split':
        cues.push({ kind: 'whoosh', t: at(s, 0.0), d: 0.5 }, { kind: 'blip', t: at(s, 0.9), f: 784, g: 0.12, d: 0.15 });
        break;
      case 'list': {
        const n = Math.max(1, (p.items || []).length); const span = Math.max(0.8, s.dur - 1.5);
        for (let k = 0; k < n; k++) cues.push({ kind: 'blip', t: at(s, 0.7 + (k * span) / n), f: 660 * Math.pow(2, (k * 3) / 12), g: 0.16, d: 0.14 });
        break; }
      case 'compare':
        cues.push({ kind: 'sweep', t: at(s, 1.0) }, { kind: 'success', t: at(s, 1.7) });
        break;
      case 'end':
        cues.push({ kind: 'sting', t: s.start }, { kind: 'logo', t: at(s, 1.55) });
        break;
    }
  });
  return cues.filter((c) => (c.t ?? c.t0) >= -1);
}
