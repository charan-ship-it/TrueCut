// Truecut — founder talk engine. A real person on camera + an illustrated "explainer" panel that
// changes with every beat of what they say (headline with one accent word, a subline, and an
// animated illustration composed from the motion toolkit below).
// Pure helpers at the top are shared with the server (timing, cues, captions); the DOM lives in mount().
import { FORMATS } from './timeline.js';
import { resolveStyle, fontFaceCss, rgb } from './styles.js';

export const TALK_LAYOUTS = ['split', 'overlay'];
export const PANEL = { '9x16': 0.6, '4x5': 0.56, '1x1': 0.52 };

/** Where the speaker sits for a format + layout (in output pixels). The cut video is rendered to exactly this box. */
export function speakerBox(format, lay = 'split') {
  const f = FORMATS[format] || FORMATS['9x16'];
  if (lay === 'overlay') return { x: 0, y: 0, w: f.w, h: f.h };
  const ph = Math.round(f.h * (PANEL[format] || 0.58) / 2) * 2;
  return { x: 0, y: ph, w: f.w, h: f.h - ph };
}

/** Beats are contiguous on the output timeline; fill gaps and clamp to the cut's duration. */
export function talkLayout(comp) {
  const T = comp.talk || {};
  const dur = Math.max(0.5, Number(T.duration) || 0);
  const src = (T.beats || []).filter((b) => b && b.end > b.start).sort((a, b) => a.start - b.start);
  const beats = src.map((b, i) => ({ ...b, index: i, start: i === 0 ? 0 : b.start, end: i === src.length - 1 ? dur : Math.max(b.end, src[i + 1].start) }));
  for (let i = 1; i < beats.length; i++) beats[i].start = beats[i - 1].end;
  const cues = beats.slice(1).map((b) => ({ kind: 'blip', t: b.start, f: 1046.5, g: 0.06, d: 0.12 }));
  beats.forEach((b) => { if (b.visual?.kind === 'stat' || b.visual?.kind === 'meter') cues.push({ kind: 'ticks', t0: b.start + 0.3, t1: b.start + Math.min(1.6, (b.end - b.start) * 0.7), n: 16 }); });
  return { duration: dur, beats, cues, captions: T.captions || [] };
}

/** Same shape as timeline.layout() so the editor UI (monitor, timeline strip) works for talks too. */
export function talkTimeline(comp) {
  const L = talkLayout(comp);
  return { duration: L.duration, beat: 0.5, revealAt: null, revealIndex: -1, cues: L.cues, captions: L.captions,
    scenes: L.beats.map((b, i) => ({ id: b.id, index: i, start: b.start, end: b.end, dur: b.end - b.start, type: b.visual?.kind || 'beat', vo: { text: b.headline }, props: b.visual || {} })) };
}

// ───────────────────────── tiny animation kit ─────────────────────────
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const pr = (t, a, b) => cl((t - a) / Math.max(1e-4, b - a));
const eo = (x) => 1 - Math.pow(1 - x, 3);
const eo5 = (x) => 1 - Math.pow(1 - x, 5);
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eb = (x) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a, b, x) => a + (b - a) * x;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function mk(p, tag, cls, st, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (st) Object.assign(e.style, st); if (html != null) e.innerHTML = html; p.appendChild(e); return e; }
function tf(e, { x = 0, y = 0, s = 1, r = 0, o, b } = {}) { e.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`; if (o != null) e.style.opacity = o; if (b != null) e.style.filter = b > 0.05 ? `blur(${b}px)` : 'none'; }
const fmtN = (v, dec = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// outline icon set (24-grid), drawn at any size
const ICON = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 10h8M8 13h5"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
  db: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
  building: '<path d="M5 21V4h10v17M15 9h4v12M3 21h18M8 8h2M8 12h2M8 16h2M12 8h0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.6-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18Z"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2M9 15l-3-3c1.5-5 5.5-9 13-9 0 7.5-4 11.5-9 13Z"/><circle cx="15" cy="9" r="1.5"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  heart: '<path d="M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 15.3 12 20 12 20Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
};
const ICONS = Object.keys(ICON).concat(['person']);
function icon(name, size, color, fill) {
  if (name === 'person') return `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="4.2" fill="${fill || color}"/><path d="M3.6 21.5c.7-4.6 4.1-7.3 8.4-7.3s7.7 2.7 8.4 7.3Z" fill="${fill || color}"/></svg>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill || 'none'}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ICON.doc}</svg>`;
}
const iconName = (n) => (ICONS.includes(n) ? n : { people: 'person', user: 'person', users: 'person', file: 'doc', files: 'folder', message: 'chat', meeting: 'chat', data: 'db', database: 'db', email: 'mail', graph: 'chart', idea: 'bulb', security: 'shield', time: 'clock', org: 'building', company: 'building', world: 'globe' }[String(n || '').toLowerCase()] || 'doc');

// ───────────────────────── the motion toolkit ─────────────────────────
// Each primitive builds into `el` (a W×h box) and returns update(lt, d) where lt is beat-local time.
// They share a vocabulary: thin ink outlines, paper cards, one accent, staggered entrances, a "step"
// in the middle of the beat (highlight, drain, type, dissolve) and a little ambient drift.
const TOOLKIT = {
  // stacked labelled cards; `highlight` turns one accent; later cards dim if `focus`
  cards(el, p, k) {
    const items = (p.items || []).slice(0, 4); const n = Math.max(1, items.length);
    const cw = Math.min(760, k.w * 0.74), ch = Math.min(150, (k.h - 40) / n - 22);
    const top = (k.h - (n * ch + (n - 1) * 22)) / 2;
    const cards = items.map((it, i) => { const c = mk(el, 'div', 'tk-card', { left: (k.w - cw) / 2 + 'px', top: top + i * (ch + 22) + 'px', width: cw + 'px', height: ch + 'px' },
      `<div class="tk-num">${String(i + 1).padStart(2, '0')}</div><div class="tk-ct">${esc(it.title || it)}</div>${it.sub ? `<div class="tk-cs">${esc(it.sub)}</div>` : ''}<div class="tk-ci">${icon(iconName(it.icon || 'doc'), ch * 0.34, 'currentColor')}</div>`); return c; });
    const hi = p.highlight ?? -1;
    return (lt, d) => {
      cards.forEach((c, i) => { const a = 0.08 + i * 0.22; const q = eb(pr(lt, a, a + 0.5)); tf(c, { y: (1 - q) * -40, s: lerp(0.94, 1, q), o: cl(pr(lt, a, a + 0.25)) });
        const on = i === hi && lt > d * 0.38; c.classList.toggle('on', on); c.style.opacity = hi >= 0 && lt > d * 0.38 && i !== hi ? 0.45 : c.style.opacity; });
    };
  },
  // a grid of icons; tags appear; some cells light up (in sequence if `sequence`)
  grid(el, p, k) {
    const n = Math.max(3, Math.min(16, p.count || 9)); const cols = p.cols || (n <= 6 ? 3 : 4); const rows = Math.ceil(n / cols);
    const gap = 26; const cell = Math.min(170, (k.w * 0.82 - gap * (cols - 1)) / cols, (k.h - 70 - gap * (rows - 1)) / rows);
    const gw = cols * cell + (cols - 1) * gap, gx = (k.w - gw) / 2, gy = (k.h - (rows * cell + (rows - 1) * gap)) / 2 + 24;
    const nm = iconName(p.icon || 'folder'); const person = nm === 'person';
    const tones = ['#C9A27E', '#8E9AAE', '#E2864A', '#9CAE8F', '#6E7891', '#E5C09A'];
    const cells = Array.from({ length: n }, (_, i) => mk(el, 'div', 'tk-cell', { left: gx + (i % cols) * (cell + gap) + 'px', top: gy + Math.floor(i / cols) * (cell + gap) + 'px', width: cell + 'px', height: cell + 'px' },
      `${icon(nm, cell * 0.5, 'var(--ink)', person ? tones[i % tones.length] : undefined)}${person ? `<i class="tk-wave">${'<b></b>'.repeat(7)}</i>` : ''}`));
    const tags = (p.tags || []).slice(0, 4).map((t) => mk(el, 'div', 'tk-tag', {}, esc(t)));
    let tx = gx; tags.forEach((t) => { t.style.left = tx + 'px'; t.style.top = gy - 64 + 'px'; tx += t.textContent.length * 13 + 56; });
    const hi = new Set(p.highlight || []);
    return (lt, d) => {
      cells.forEach((c, i) => { const a = 0.05 + (i % cols) * 0.05 + Math.floor(i / cols) * 0.08; const q = eo5(pr(lt, a, a + 0.4)); tf(c, { s: lerp(0.7, 1, q), o: q });
        let on = hi.has(i) && lt > d * 0.3;
        if (p.sequence) { const step = Math.floor(pr(lt, d * 0.25, d) * Math.max(1, n) * 0.999); on = lt > d * 0.25 && (i === (step * 5 + 1) % n); }
        c.classList.toggle('on', on); });
      tags.forEach((t, i) => { const a = d * 0.35 + i * 0.35; const q = eb(pr(lt, a, a + 0.4)); tf(t, { y: (1 - q) * 14, s: lerp(0.8, 1, q), o: cl(q) }); });
      el.querySelectorAll('.tk-wave b').forEach((b, j) => { b.style.transform = `scaleY(${0.3 + 0.7 * Math.abs(Math.sin(lt * 9 + j * 1.3))})`; });
    };
  },
  // a dashboard window: KPI counters roll up, bars grow, one bar is the accent
  bars(el, p, k) {
    const ww = Math.min(860, k.w * 0.8), wh = Math.min(560, k.h - 30); const win = mk(el, 'div', 'tk-win', { left: (k.w - ww) / 2 + 'px', top: (k.h - wh) / 2 + 'px', width: ww + 'px', height: wh + 'px' });
    mk(win, 'div', 'tk-wbar', {}, `<span>${esc(p.title || 'Overview')}</span><span class="tk-dots"><i></i><i></i><i></i></span>`);
    const kpis = (p.kpis || []).slice(0, 3); const kr = mk(win, 'div', 'tk-kpis');
    const kv = kpis.map((x) => { const b = mk(kr, 'div', 'tk-kpi', {}, `<small>${esc(x.label)}</small><b>0</b>`); return { b: b.querySelector('b'), v: Number(String(x.value).replace(/[^0-9.-]/g, '')) || 0, raw: x.value }; });
    const vals = (p.values || [3, 5, 4, 7, 6, 9, 5, 8]).slice(0, 12).map(Number); const mx = Math.max(...vals, 1); const hi = p.highlight ?? vals.indexOf(mx);
    const area = mk(win, 'div', 'tk-bars', { height: wh - (kpis.length ? 210 : 110) + 'px' });
    const bars = vals.map((v, i) => mk(area, 'i', i === hi ? 'on' : ''));
    return (lt, d) => {
      const q = eo5(pr(lt, 0, 0.5)); tf(win, { y: (1 - q) * 40, o: q, s: lerp(0.96, 1, q) });
      kv.forEach((x, i) => { const r = eio(pr(lt, 0.3 + i * 0.1, Math.min(d * 0.7, 1.8))); x.b.textContent = r >= 1 ? String(x.raw) : fmtN(x.v * r); });
      bars.forEach((b, i) => { const r = eo(pr(lt, 0.35 + i * 0.06, 0.9 + i * 0.06)); b.style.height = (vals[i] / mx) * 100 * r + '%'; });
    };
  },
  // a labelled meter that fills or drains (from→to), with an optional row of people where one leaves
  meter(el, p, k) {
    const ppl = Math.min(7, p.people || 0); const row = mk(el, 'div', 'tk-row', { top: k.h * 0.18 + 'px' });
    const ps = Array.from({ length: ppl }, (_, i) => mk(row, 'span', 'tk-p' + (i === p.leaving ? ' on' : ''), {}, icon('person', 96, 'var(--ink)', i === p.leaving ? 'var(--a)' : '#B9B2A6')));
    const bw = Math.min(760, k.w * 0.74); const box = mk(el, 'div', 'tk-meter', { left: (k.w - bw) / 2 + 'px', top: (ppl ? k.h * 0.58 : k.h * 0.42) + 'px', width: bw + 'px' }, `<div class="tk-mh"><span>${esc(p.label || '')}</span><b>0%</b></div><div class="tk-mt"><i></i></div>`);
    const lab = box.querySelector('b'), fill = box.querySelector('.tk-mt i');
    const from = Number(p.from ?? 0), to = Number(p.to ?? 100); const unit = p.unit ?? '%';
    return (lt, d) => {
      ps.forEach((s, i) => { const q = eo5(pr(lt, i * 0.05, i * 0.05 + 0.35)); const leave = i === p.leaving ? eio(pr(lt, d * 0.35, d * 0.6)) : 0; tf(s, { y: (1 - q) * 30 - leave * 40, o: q * (1 - leave), s: 1 - leave * 0.3 }); });
      const q = eo(pr(lt, 0.15, 0.5)); tf(box, { y: (1 - q) * 20, o: q });
      const r = eio(pr(lt, d * 0.3, d * 0.75)); const v = lerp(from, to, r); fill.style.width = cl(v / Math.max(from, to, 100)) * 100 + '%'; lab.textContent = p.showValue === false ? '' : fmtN(v) + unit;
      box.classList.toggle('down', to < from && r > 0.05);
    };
  },
  // an app window: breadcrumbs, a live badge, rows typing in, then a highlighted notes block
  window(el, p, k) {
    const ww = Math.min(900, k.w * 0.84), wh = Math.min(620, k.h - 20); const win = mk(el, 'div', 'tk-win', { left: (k.w - ww) / 2 + 'px', top: (k.h - wh) / 2 + 'px', width: ww + 'px', height: wh + 'px' });
    mk(win, 'div', 'tk-wbar', {}, `<span>${esc((p.crumbs || [p.title || 'App']).join('  ·  '))}</span>${p.badge ? `<span class="tk-badge"><i></i>${esc(p.badge)}</span>` : ''}`);
    const rows = (p.rows || []).slice(0, 5).map((r) => mk(win, 'div', 'tk-wrow', {}, `<b>${esc(r.who || '')}</b><span></span>`));
    const note = p.note ? mk(win, 'div', 'tk-note', {}, `<div class="tk-nt">${esc(p.note.title || 'Notes')}</div>${(p.note.items || []).slice(0, 4).map((x) => `<div class="tk-ni">${esc(x)}</div>`).join('')}`) : null;
    const texts = (p.rows || []).slice(0, 5).map((r) => String(r.text || ''));
    return (lt, d) => {
      const q = eo5(pr(lt, 0, 0.45)); tf(win, { y: (1 - q) * 40, o: q, s: lerp(0.96, 1, q) });
      const span = note ? d * 0.5 : d * 0.8; let acc = 0.35;
      rows.forEach((r, i) => { const per = span / Math.max(1, rows.length); const a = 0.35 + i * per; const n = Math.floor(cl((lt - a) / per) * texts[i].length); r.querySelector('span').textContent = texts[i].slice(0, n); r.style.opacity = lt > a - 0.05 ? 1 : 0; acc = a; });
      if (note) { const qq = eo(pr(lt, d * 0.55, d * 0.55 + 0.4)); tf(note, { y: (1 - qq) * 20, o: qq }); note.querySelectorAll('.tk-ni').forEach((x, i) => { x.style.opacity = cl(pr(lt, d * 0.6 + i * 0.2, d * 0.6 + i * 0.2 + 0.2)); }); }
    };
  },
  // chat bubbles that type, then (optionally) dissolve into particles: "never captured"
  bubbles(el, p, k) {
    const n = Math.min(9, p.count || 7); const cols = n > 4 ? 4 : n; const bw = 150, bh = 92, gap = 40;
    const rows = Math.ceil(n / cols); const gx = (k.w - (cols * bw + (cols - 1) * gap)) / 2, gy = (k.h - (rows * bh + (rows - 1) * 70)) / 2;
    const bs = Array.from({ length: n }, (_, i) => mk(el, 'div', 'tk-bub', { left: gx + (i % cols) * (bw + gap) + (Math.floor(i / cols) % 2 ? (bw + gap) / 2 : 0) + 'px', top: gy + Math.floor(i / cols) * (bh + 70) + 'px', width: bw + 'px', height: bh + 'px' }, '<i></i><i></i><i></i>'));
    const parts = []; for (let i = 0; i < n * 10; i++) parts.push(mk(el, 'b', 'tk-dust'));
    return (lt, d) => {
      const dis = p.dissolve === false ? 0 : pr(lt, d * 0.45, d * 0.85);
      bs.forEach((b, i) => { const a = 0.05 + i * 0.08; const q = eb(pr(lt, a, a + 0.4)); const di = cl(dis * 1.6 - (i % 3) * 0.2); tf(b, { s: lerp(0.6, 1, q) * (1 - di * 0.2), o: cl(q) * (1 - di), b: di * 6 });
        b.querySelectorAll('i').forEach((x, j) => { x.style.transform = `translateY(${-Math.max(0, Math.sin(lt * 7 - j * 0.9)) * 8}px)`; }); });
      parts.forEach((s, i) => { const b = bs[i % n]; const di = cl(dis * 1.6 - ((i % n) % 3) * 0.2); const ang = (i * 137.5) % 360 * Math.PI / 180; const dist = di * (60 + (i % 7) * 18);
        s.style.left = parseFloat(b.style.left) + bw / 2 + Math.cos(ang) * dist + 'px'; s.style.top = parseFloat(b.style.top) + bh / 2 + Math.sin(ang) * dist - di * 40 + 'px'; s.style.opacity = di > 0 && di < 1 ? (1 - di) * 0.9 : 0; });
    };
  },
  // a brand tile with chips: "Meet X"
  brand(el, p, k, ctx) {
    const tile = mk(el, 'div', 'tk-brand', { left: k.w / 2 - 210 + 'px', top: k.h * 0.18 + 'px' }, `${p.image ? `<img src="${esc(ctx.assetUrl(p.image))}">` : ''}<b>${esc(p.name || '')}</b>${p.kicker ? `<small>${esc(p.kicker)}</small>` : ''}`);
    const tl = mk(el, 'div', 'tk-btl', { top: k.h * 0.18 + 250 + 'px' }, esc(p.tagline || ''));
    const chips = mk(el, 'div', 'tk-chips', { top: k.h * 0.18 + 320 + 'px' }, (p.chips || []).slice(0, 4).map((c) => `<span>${esc(c)}</span>`).join(''));
    return (lt) => { const q = eb(pr(lt, 0.05, 0.6)); tf(tile, { s: lerp(0.6, 1, q), o: cl(q), r: (1 - q) * -4 }); const t2 = eo(pr(lt, 0.45, 0.85)); tf(tl, { y: (1 - t2) * 14, o: t2 });
      chips.querySelectorAll('span').forEach((c, i) => { const qq = eb(pr(lt, 0.7 + i * 0.12, 1.1 + i * 0.12)); tf(c, { s: lerp(0.7, 1, qq), o: cl(qq) }); }); };
  },
  // one big number (from the speaker's words) with a label
  stat(el, p, k) {
    const v = Number(String(p.value).replace(/[^0-9.-]/g, '')) || 0; const dec = String(p.value).includes('.') ? 1 : 0;
    const big = mk(el, 'div', 'tk-stat', { top: k.h * 0.2 + 'px' }); const lab = mk(el, 'div', 'tk-statl', { top: k.h * 0.2 + 260 + 'px' }, esc(p.label || ''));
    return (lt, d) => { const r = eio(pr(lt, 0.15, Math.min(1.6, d * 0.6))); big.textContent = `${p.prefix || ''}${r >= 1 ? String(p.value).replace(/^[^0-9.-]+/, '') : fmtN(v * r, dec)}${p.suffix || ''}`; tf(big, { s: lerp(0.85, 1, eo(pr(lt, 0, 0.4))), o: cl(pr(lt, 0, 0.2)) }); tf(lab, { o: eo(pr(lt, 0.5, 0.9)), y: (1 - eo(pr(lt, 0.5, 0.9))) * 12 }); };
  },
  // the speaker's own line, set big, a highlighter sweeping across the key words
  quote(el, p, k) {
    const q = mk(el, 'div', 'tk-quote', { top: k.h * 0.14 + 'px' }); const ws = String(p.text || '').split(/\s+/).filter(Boolean);
    const hl = new Set((p.highlight || []).map((x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '')));
    const spans = ws.map((w) => { const s = mk(q, 'span', hl.has(w.toLowerCase().replace(/[^a-z0-9]/g, '')) ? 'hl' : '', {}, esc(w) + ' '); return s; });
    return (lt, d) => { spans.forEach((s, i) => { const a = 0.05 + i * (Math.min(1.2, d * 0.4) / ws.length); tf(s, { o: cl(pr(lt, a, a + 0.2)), y: (1 - eo(pr(lt, a, a + 0.3))) * 14 }); if (s.classList.contains('hl')) s.style.backgroundSize = `${eio(pr(lt, d * 0.4, d * 0.65)) * 100}% 38%`; }); };
  },
  // a checklist / steps that land one by one
  list(el, p, k) {
    const items = (p.items || []).slice(0, 5); const lh = Math.min(118, (k.h - 40) / Math.max(3, items.length));
    const top = (k.h - items.length * lh) / 2; const lw = Math.min(800, k.w * 0.78);
    const rows = items.map((it, i) => mk(el, 'div', 'tk-li', { left: (k.w - lw) / 2 + 'px', top: top + i * lh + 'px', width: lw + 'px', height: lh - 16 + 'px' }, `<span class="tk-lm">${p.marker === 'number' ? i + 1 : '✓'}</span><span>${esc(it.title || it)}</span>`));
    return (lt, d) => rows.forEach((r, i) => { const a = 0.15 + i * Math.min(0.45, (d * 0.7) / Math.max(1, rows.length)); const q = eb(pr(lt, a, a + 0.4)); tf(r, { x: (1 - q) * -60, o: cl(q) }); });
  },
  // before → after columns
  compare(el, p, k) {
    const cw = Math.min(420, k.w * 0.4); const mkCol = (side, x, good) => { const c = mk(el, 'div', 'tk-col' + (good ? ' good' : ''), { left: x + 'px', top: k.h * 0.1 + 'px', width: cw + 'px', height: k.h * 0.8 + 'px' }, `<div class="tk-colh">${esc(side.label || (good ? 'After' : 'Before'))}</div>${(side.items || []).slice(0, 4).map((x) => `<div class="tk-coli"><i>${good ? '✓' : '×'}</i><span>${esc(x)}</span></div>`).join('')}`); return c; };
    const L = mkCol(p.left || {}, k.w / 2 - cw - 20, false), R = mkCol(p.right || {}, k.w / 2 + 20, true);
    return (lt, d) => { const a = eo5(pr(lt, 0, 0.45)); tf(L, { x: (1 - a) * -50, o: a * (1 - 0.4 * pr(lt, d * 0.45, d * 0.6)) }); const b = eb(pr(lt, d * 0.35, d * 0.35 + 0.5)); tf(R, { x: (1 - b) * 50, o: cl(b) });
      L.querySelectorAll('.tk-coli').forEach((x, i) => { x.classList.toggle('struck', lt > d * 0.4 + i * 0.12); }); };
  },
  // nodes connected by a line, a pulse travelling along it
  flow(el, p, k) {
    const steps = (p.steps || []).slice(0, 5); const n = Math.max(2, steps.length); const sp = (k.w * 0.8) / (n - 1); const x0 = k.w * 0.1, y = k.h * 0.45;
    const line = mk(el, 'div', 'tk-fline', { left: x0 + 'px', top: y + 'px', width: k.w * 0.8 + 'px' }, '<i></i><b></b>');
    const nodes = steps.map((s, i) => mk(el, 'div', 'tk-fnode', { left: x0 + i * sp - 60 + 'px', top: y - 60 + 'px' }, `<span>${icon(iconName(s.icon || 'check'), 46, 'currentColor')}</span><em>${esc(s.title || s)}</em>`));
    return (lt, d) => { const r = eio(pr(lt, 0.1, d * 0.8)); line.querySelector('i').style.width = r * 100 + '%'; line.querySelector('b').style.left = r * 100 + '%';
      nodes.forEach((nd, i) => { const at = 0.1 + (i / (n - 1)) * (d * 0.8 - 0.1); const q = eb(pr(lt, at - 0.1, at + 0.3)); tf(nd, { s: lerp(0.6, 1, q), o: cl(q) }); nd.classList.toggle('on', lt > at); }); };
  },
  // a central object with dots flowing into it: "it stays with the organisation"
  orbit(el, p, k) {
    const c = mk(el, 'div', 'tk-orb', { left: k.w / 2 - 110 + 'px', top: k.h / 2 - 130 + 'px' }, icon(iconName(p.icon || 'building'), 150, 'var(--ink)'));
    const lab = mk(el, 'div', 'tk-statl', { top: k.h / 2 + 110 + 'px', fontSize: '30px' }, esc(p.label || ''));
    const dots = Array.from({ length: 18 }, () => mk(el, 'b', 'tk-dot'));
    return (lt) => { tf(c, { s: lerp(0.7, 1, eb(pr(lt, 0, 0.5))), o: cl(pr(lt, 0, 0.25)) }); tf(lab, { o: eo(pr(lt, 0.4, 0.8)) });
      dots.forEach((s, i) => { const ph = ((lt * 0.45 + i / dots.length) % 1); const ang = i * 2.39996; const rr = (1 - eio(ph)) * (k.w * 0.42); s.style.left = k.w / 2 + Math.cos(ang) * rr + 'px'; s.style.top = k.h / 2 - 20 + Math.sin(ang) * rr * 0.7 + 'px'; s.style.opacity = lt > 0.3 ? Math.sin(ph * Math.PI) : 0; }); };
  },
  // a real screenshot from the sources, framed, with a slow push and an optional callout
  image(el, p, k, ctx) {
    const ww = Math.min(900, k.w * 0.84), wh = Math.min(k.h - 30, ww * (p.aspect || 0.62));
    const f = mk(el, 'div', 'tk-win', { left: (k.w - ww) / 2 + 'px', top: (k.h - wh) / 2 + 'px', width: ww + 'px', height: wh + 'px', padding: 0 }, `<img src="${esc(ctx.assetUrl(p.image))}" style="width:100%;height:100%;object-fit:cover;object-position:50% 0;display:block">`);
    const call = p.callout ? mk(el, 'div', 'tk-tag', { left: (k.w - ww) / 2 + 24 + 'px', top: (k.h + wh) / 2 - 70 + 'px', fontSize: '24px', height: '46px' }, esc(p.callout)) : null;
    const img = f.querySelector('img');
    return (lt, d) => { const q = eo5(pr(lt, 0, 0.5)); tf(f, { y: (1 - q) * 40, o: q }); img.style.transform = `scale(${1.02 + 0.06 * pr(lt, 0, d)})`; if (call) { const c = eb(pr(lt, d * 0.4, d * 0.4 + 0.4)); tf(call, { s: lerp(0.7, 1, c), o: cl(c) }); } };
  },
};
export const TOOLKIT_KINDS = Object.keys(TOOLKIT);
export const TOOLKIT_ICONS = ICONS;

function talkCss(S, fontBase) {
  const P = S.palette; const [ar, ag, ab] = rgb(P.accent); const [ir, ig, ib] = rgb(P.ink);
  return `${fontFaceCss(fontBase)}
.tk{position:relative;overflow:hidden;font-family:'${S.fonts.body}',sans-serif;color:var(--ink);--ink:${P.ink};--mu:${P.muted};--bg:${P.bg};--bg2:${P.bg2};--card:${P.card};--ln:${P.line};--a:${P.accent};--ar:${ar},${ag},${ab};--ir:${ir},${ig},${ib}}
.tk *{box-sizing:border-box}.tk .ab{position:absolute}
.tk-panel{position:absolute;left:0;right:0;top:0;overflow:hidden;background:var(--bg)}
.tk-paper{position:absolute;inset:0;background:radial-gradient(ellipse at 30% 0%,var(--bg) 0%,var(--bg2) 100%)}
.tk-beat{position:absolute;inset:0}
.tk-ill{position:absolute;left:0;right:0}
.tk-head{position:absolute;left:40px;right:40px;text-align:center}
.tk-h{font-weight:700;letter-spacing:-.025em;line-height:1.02;white-space:nowrap}
.tk-h .ac{font-family:'Fraunces','Playfair Display',serif;font-style:italic;font-weight:700;color:var(--a);letter-spacing:-.01em}
.tk-h .w{display:inline-block;will-change:transform,opacity}
.tk-sub{color:var(--mu);margin-top:10px;font-weight:500}
.tk-card{position:absolute;background:var(--card);border:2px solid rgba(var(--ir),.85);border-radius:6px;padding:20px 26px;box-shadow:6px 6px 0 rgba(var(--ir),.12);display:flex;flex-direction:column;justify-content:center;transition:none}
.tk-card .tk-num{font:600 18px 'IBM Plex Mono',monospace;color:var(--a)}
.tk-card .tk-ct{font-weight:700;font-size:38px;letter-spacing:-.02em}
.tk-card .tk-cs{font-size:20px;color:var(--mu);margin-top:2px}
.tk-card .tk-ci{position:absolute;right:26px;top:50%;transform:translateY(-50%);color:rgba(var(--ir),.7)}
.tk-card.on{background:var(--a);border-color:var(--a);color:#fff;box-shadow:0 18px 40px -12px rgba(var(--ar),.6)}
.tk-card.on .tk-num,.tk-card.on .tk-cs,.tk-card.on .tk-ci{color:#fff}
.tk-cell{position:absolute;border:2px solid rgba(var(--ir),.75);border-radius:6px;background:var(--card);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px}
.tk-cell.on{background:rgba(var(--ar),.16);border-color:var(--a)}
.tk-wave{display:flex;gap:4px;height:22px;align-items:center;opacity:0}.tk-cell.on .tk-wave{opacity:1}
.tk-wave b{width:5px;height:20px;background:var(--a);border-radius:2px}
.tk-tag{position:absolute;display:inline-flex;align-items:center;height:40px;padding:0 16px;border:2px solid rgba(var(--ir),.8);border-radius:6px;background:var(--card);font-weight:600;font-size:20px;white-space:nowrap}
.tk-win{position:absolute;background:var(--card);border:2px solid rgba(var(--ir),.8);border-radius:8px;overflow:hidden;box-shadow:10px 10px 0 rgba(var(--ir),.08);padding-bottom:20px}
.tk-wbar{display:flex;justify-content:space-between;align-items:center;height:56px;padding:0 22px;border-bottom:2px solid rgba(var(--ir),.15);font:600 20px 'IBM Plex Mono',monospace;color:var(--mu)}
.tk-dots i{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid rgba(var(--ir),.4);margin-left:6px}
.tk-badge{display:inline-flex;align-items:center;gap:8px;color:var(--a)}.tk-badge i{width:12px;height:12px;border-radius:50%;background:var(--a)}
.tk-kpis{display:flex;gap:16px;padding:20px 22px 0}
.tk-kpi{flex:1;border:2px solid rgba(var(--ir),.15);border-radius:6px;padding:12px 16px}
.tk-kpi small{display:block;font:600 14px 'IBM Plex Mono',monospace;color:var(--mu);text-transform:uppercase;letter-spacing:.06em}
.tk-kpi b{font-size:44px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tk-bars{display:flex;align-items:flex-end;gap:18px;padding:20px 30px 0;border-bottom:2px solid rgba(var(--ir),.25);margin:0 22px}
.tk-bars i{flex:1;background:rgba(var(--ir),.18);border-radius:3px 3px 0 0;height:0}.tk-bars i.on{background:var(--a)}
.tk-row{position:absolute;left:0;right:0;display:flex;justify-content:center;gap:34px}
.tk-p{display:inline-block}.tk-p.on{outline:3px solid var(--a);outline-offset:8px;border-radius:4px}
.tk-meter{position:absolute}
.tk-mh{display:flex;justify-content:space-between;font:600 22px 'IBM Plex Mono',monospace;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px}
.tk-mh b{font-size:30px;color:var(--ink)}.tk-meter.down .tk-mh b{color:var(--a)}
.tk-mt{height:26px;border:2px solid rgba(var(--ir),.85);border-radius:4px;overflow:hidden}.tk-mt i{display:block;height:100%;background:var(--ink)}.tk-meter.down .tk-mt i{background:var(--a)}
.tk-wrow{display:flex;gap:14px;padding:12px 26px 0;font-size:22px;opacity:0}.tk-wrow b{flex:none;min-width:70px}
.tk-note{margin:22px 26px 0;border:2px solid var(--a);border-left-width:8px;border-radius:6px;padding:14px 18px}
.tk-nt{font:600 16px 'IBM Plex Mono',monospace;color:var(--a);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.tk-ni{font-size:22px;padding:4px 0}.tk-ni:before{content:'●';color:var(--a);margin-right:12px;font-size:14px;vertical-align:middle}
.tk-bub{position:absolute;border:2.5px solid rgba(var(--ir),.85);border-radius:10px;background:var(--card);display:flex;align-items:center;justify-content:center;gap:10px}
.tk-bub:after{content:'';position:absolute;left:22px;bottom:-18px;border:9px solid transparent;border-top:12px solid rgba(var(--ir),.85);border-left:4px solid rgba(var(--ir),.85)}
.tk-bub i{width:13px;height:13px;border-radius:50%;background:var(--ink)}
.tk-dust{position:absolute;width:7px;height:7px;background:var(--ink);border-radius:1px}
.tk-brand{position:absolute;width:420px;height:220px;border-radius:10px;background:#141210;color:#F6F0E6;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)}
.tk-brand img{max-width:70%;max-height:90px;object-fit:contain}
.tk-brand b{font-family:'Fraunces',serif;font-size:76px;letter-spacing:-.02em}.tk-brand small{font:600 14px 'IBM Plex Mono',monospace;letter-spacing:.2em;text-transform:uppercase;opacity:.8}
.tk-btl{position:absolute;left:0;right:0;text-align:center;font-size:28px;font-weight:500}
.tk-chips{position:absolute;left:0;right:0;display:flex;gap:12px;justify-content:center}
.tk-chips span{border:2px solid rgba(var(--ir),.8);border-radius:6px;padding:6px 14px;font-size:20px;font-weight:600;background:var(--card)}
.tk-stat{position:absolute;left:0;right:0;text-align:center;font-weight:800;font-size:220px;letter-spacing:-.05em;line-height:1;font-variant-numeric:tabular-nums}
.tk-statl{position:absolute;left:60px;right:60px;text-align:center;font-size:34px;color:var(--mu);font-weight:500}
.tk-quote{position:absolute;left:80px;right:80px;font-family:'Fraunces',serif;font-weight:700;font-size:62px;line-height:1.15;letter-spacing:-.02em}
.tk-quote span{display:inline-block}.tk-quote .hl{background:linear-gradient(rgba(var(--ar),.35),rgba(var(--ar),.35)) no-repeat 0 85%/0% 38%}
.tk-li{position:absolute;display:flex;align-items:center;gap:22px;border:2px solid rgba(var(--ir),.8);border-radius:6px;background:var(--card);padding:0 24px;font-size:34px;font-weight:600}
.tk-lm{width:48px;height:48px;border-radius:50%;background:var(--a);color:#fff;display:grid;place-items:center;font-size:24px;flex:none}
.tk-col{position:absolute;border:2px solid rgba(var(--ir),.6);border-radius:8px;background:var(--card);padding:24px}
.tk-col.good{border-color:var(--a);box-shadow:0 20px 40px -18px rgba(var(--ar),.5)}
.tk-colh{font-weight:800;font-size:36px;margin-bottom:12px}.tk-col.good .tk-colh{color:var(--a)}
.tk-coli{display:flex;gap:12px;align-items:flex-start;font-size:26px;padding:12px 0;border-top:1.5px solid rgba(var(--ir),.12)}
.tk-coli i{font-style:normal;flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:16px;border:2px solid rgba(var(--ir),.4)}
.tk-col.good .tk-coli i{background:var(--a);border-color:var(--a);color:#fff}
.tk-coli.struck span{text-decoration:line-through;color:var(--mu)}
.tk-fline{position:absolute;height:4px;background:rgba(var(--ir),.15)}.tk-fline i{position:absolute;left:0;top:0;height:100%;background:var(--a)}
.tk-fline b{position:absolute;top:-8px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:var(--a);box-shadow:0 0 20px var(--a)}
.tk-fnode{position:absolute;width:120px;display:flex;flex-direction:column;align-items:center;gap:12px}
.tk-fnode span{width:120px;height:120px;border-radius:50%;border:2.5px solid rgba(var(--ir),.7);background:var(--card);display:grid;place-items:center;color:var(--ink)}
.tk-fnode.on span{background:var(--a);border-color:var(--a);color:#fff}
.tk-fnode em{font-style:normal;font-weight:600;font-size:22px;text-align:center;width:180px}
.tk-orb{position:absolute;width:220px;height:220px;border:2.5px solid rgba(var(--ir),.8);border-radius:10px;background:var(--card);display:grid;place-items:center}
.tk-dot{position:absolute;width:12px;height:12px;border-radius:2px;background:var(--a)}
.tk-strip{position:absolute;left:0;right:0;display:flex;align-items:center;gap:14px;padding:0 30px;height:56px;background:#141210;color:rgba(255,255,255,.7);font:600 17px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase}
.tk-strip i{width:9px;height:9px;border-radius:50%;background:var(--a)}
.tk-prog{position:absolute;left:0;height:6px;background:var(--a)}
.tk-cap{position:absolute;left:60px;right:60px;text-align:center;font-weight:800;font-size:46px;color:#fff;text-shadow:0 3px 18px rgba(0,0,0,.6);line-height:1.15}
.tk-cap span{opacity:.55}.tk-cap span.on{opacity:1;color:#fff}.tk-cap span.now{color:var(--a)}
.tk-vid{position:absolute;overflow:hidden;background:#111}
.tk-vid video{width:100%;height:100%;object-fit:cover;display:block}
`;
}

/** Mount a talk composition. In render mode the speaker box stays transparent (the cut video is composited underneath by ffmpeg). */
export function mount(root, comp, opts = {}) {
  const fmtId = opts.format || '9x16'; const fmt = FORMATS[fmtId] || FORMATS['9x16'];
  const W = fmt.w, H = fmt.h; const T = comp.talk || {}; const lay = TALK_LAYOUTS.includes(T.layout) ? T.layout : 'split';
  const S = resolveStyle(comp.style || { preset: 'editorial' }, comp.brand?.accent);
  const L = talkLayout(comp);
  const box = speakerBox(fmtId, lay);
  const assetUrl = (id) => { if (!id) return ''; const a = (comp.assets || {})[id]; const u = a ? a.url : id; return /^(https?:|data:|\/)/.test(u) ? u : (opts.assetBase || '') + u; };
  root.innerHTML = '';
  const st = document.createElement('style'); st.textContent = talkCss(S, opts.fontBase || './fonts/'); root.appendChild(st);
  const F = mk(root, 'div', 'tk', { width: W + 'px', height: H + 'px', background: opts.render ? 'transparent' : '#000' });
  // speaker video (preview only — in renders ffmpeg places the full-quality cut here)
  let video = null;
  const vbox = mk(F, 'div', 'tk-vid', { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px', background: opts.render ? 'transparent' : '#111' });
  const proxy = (T.proxies || {})[fmtId + ':' + lay];
  if (!opts.render && proxy) { video = mk(vbox, 'video', '', {}); video.src = assetUrl(proxy); video.playsInline = true; video.preload = 'auto'; video.muted = false; }
  if (!opts.render && !proxy) vbox.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;color:#777;font:600 22px 'IBM Plex Mono',monospace;letter-spacing:.1em">PREPARING THE CUT…</div>`;

  const panelH = lay === 'split' ? box.y : Math.round(H * 0.5);
  const panel = mk(F, 'div', 'tk-panel', lay === 'split' ? { height: panelH + 'px' } : { left: '48px', right: '48px', top: '90px', height: panelH - 60 + 'px', borderRadius: '18px', boxShadow: '0 30px 80px -20px rgba(0,0,0,.6)' });
  mk(panel, 'div', 'tk-paper');
  const headH = lay === 'split' ? Math.min(250, panelH * 0.24) : 0;
  const illH = (lay === 'split' ? panelH - headH : panelH - 60) - 70;
  const pw = lay === 'split' ? W : W - 96;
  // overlay layout: the headline sits on a scrim at the bottom of the frame
  if (lay === 'overlay') mk(F, 'div', 'ab', { left: 0, right: 0, bottom: 0, height: H * 0.34 + 'px', background: 'linear-gradient(transparent,rgba(0,0,0,.72))' });
  const headHost = lay === 'split' ? panel : F;
  const hsz = Math.round((fmtId === '9x16' ? 88 : fmtId === '4x5' ? 72 : 62));
  // label strip + progress line between panel and speaker
  const strip = lay === 'split' && T.label ? mk(F, 'div', 'tk-strip', { top: box.y + 'px' }, `<i></i>${esc(T.label)}`) : null;
  const prog = mk(F, 'div', 'tk-prog', { top: (lay === 'split' ? box.y - 6 : H - 6) + 'px' });
  const capHost = (T.showCaptions ?? lay === 'overlay') ? mk(F, 'div', 'tk-cap', { top: (lay === 'split' ? H - 170 : H * 0.62) + 'px' }) : null;

  const built = L.beats.map((b) => {
    const el = mk(panel, 'div', 'tk-beat'); el.style.opacity = 0;
    const ill = mk(el, 'div', 'tk-ill', { top: 50 + 'px', height: illH + 'px', width: pw + 'px' });
    let upd = () => {};
    const v = b.visual || {}; const fn = TOOLKIT[v.kind] || TOOLKIT.cards;
    try { upd = fn(ill, v, { w: pw, h: illH }, { assetUrl, S }); } catch (err) { ill.innerHTML = `<div style="padding:40px;color:#c00">${esc(err.message)}</div>`; }
    const hd = mk(headHost === panel ? el : F, 'div', 'tk-head', lay === 'split' ? { top: panelH - headH + 10 + 'px' } : { top: H * 0.74 + 'px', color: '#fff' });
    const words = String(b.headline || '').split(/\s+/).filter(Boolean); const acc = String(b.accent || words[words.length - 1] || '').toLowerCase();
    const h = mk(hd, 'div', 'tk-h', { fontSize: hsz * (words.join(' ').length > 18 ? 0.82 : 1) + 'px' });
    const nk = (x) => String(x).toLowerCase().replace(/[^a-z0-9']/g, ''); const A = nk(acc);
    let ai = words.findIndex((w) => nk(w) === A);
    if (ai < 0) ai = words.findIndex((w) => { const x = nk(w); return x && A && (x.startsWith(A.slice(0, Math.max(3, A.length - 2))) || A.startsWith(x.slice(0, Math.max(3, x.length - 2)))); });
    if (ai < 0) ai = words.length - 1;
    const ws = words.map((w, i) => mk(h, 'span', 'w' + (i === ai ? ' ac' : ''), {}, esc(w) + (i < words.length - 1 ? '&nbsp;' : '')));
    const sub = b.sub ? mk(hd, 'div', 'tk-sub', { fontSize: Math.round(hsz * 0.34) + 'px', color: lay === 'overlay' ? 'rgba(255,255,255,.8)' : undefined }, esc(b.sub)) : null;
    if (lay === 'overlay') hd.style.opacity = 0;
    return { b, el, upd, hd, ws, sub };
  });
  const caps = L.captions;

  function render(t) {
    const dur = L.duration;
    prog.style.width = cl(t / dur) * 100 + '%';
    built.forEach(({ b, el, upd, hd, ws, sub }, i) => {
      const d = b.end - b.start; const lt = t - b.start;
      const vis = t >= b.start - 0.001 && t < b.end + 0.3 && (i === built.length - 1 || t < built[i + 1].b.start + 0.3);
      if (!vis) { el.style.opacity = 0; if (hd.parentNode !== el) hd.style.opacity = 0; return; }
      const inn = eo(pr(lt, 0, 0.3)); const out = pr(lt, d, d + 0.3);
      el.style.opacity = cl(inn * (1 - out)); el.style.transform = `translateY(${(1 - inn) * 18 - out * 12}px)`;
      try { upd(cl(lt, 0, d), d); } catch {}
      ws.forEach((w, k) => { const a = 0.04 + k * 0.07; const q = eb(pr(lt, a, a + 0.38)); tf(w, { y: (1 - q) * 46 + out * -20, o: cl(q) * (1 - out) }); });
      if (sub) tf(sub, { y: (1 - eo(pr(lt, 0.25, 0.6))) * 12, o: eo(pr(lt, 0.25, 0.6)) * (1 - out) });
      if (hd.parentNode !== el) hd.style.opacity = 1;
    });
    if (capHost) {
      const c = caps.find((x) => t >= x.start && t <= x.end + 0.15);
      if (!c) capHost.innerHTML = ''; else {
        if (capHost.dataset.k !== String(c.start)) { capHost.dataset.k = String(c.start); capHost.innerHTML = c.words.map((w) => `<span>${esc(w.w)}</span>`).join(' '); }
        [...capHost.children].forEach((s, k) => { const w = c.words[k]; s.className = t >= w.t ? (t < (c.words[k + 1]?.t ?? c.end) ? 'on now' : 'on') : ''; });
      }
    }
    if (strip) strip.style.opacity = 1;
  }
  const fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
  const ready = fontsReady.then(() => new Promise((r) => { if (!video) return r(); if (video.readyState >= 2) return r(); video.addEventListener('loadeddata', () => r(), { once: true }); setTimeout(r, 4000); })).then(() => render(0));
  return { render, duration: L.duration, layout: { scenes: L.beats.map((b) => ({ id: b.id, start: b.start, end: b.end, type: b.visual?.kind || 'beat' })) }, ready, width: W, height: H, style: S, media: video };
}
