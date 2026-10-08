// TrueCut — browser runtime. Builds a composition into DOM and renders any time t
// deterministically (same frame for preview scrubbing and for the frame-by-frame renderer).
// Every visual token comes from the creative direction (styles.js), so each video looks different.
import { layout, FORMATS, localOffset, SCENE_TYPES } from './timeline.js';
import { resolveStyle, fontFaceCss, rgb } from './styles.js';

const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const pr = (t, a, b) => cl((t - a) / (b - a));
const eo = (x) => 1 - Math.pow(1 - x, 3);
const eo5 = (x) => 1 - Math.pow(1 - x, 5);
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eback = (x) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a, b, x) => a + (b - a) * x;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function rng(seed) { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function mk(parent, tag, cls, st, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (st) Object.assign(e.style, st); if (html != null) e.innerHTML = html; parent.appendChild(e); return e; }
function tf(e, { x = 0, y = 0, z = 0, s = 1, rx = 0, ry = 0, rz = 0, o, b } = {}) {
  e.style.transform = `translate3d(${x}px,${y}px,${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`;
  if (o != null) e.style.opacity = o;
  if (b != null) e.style.filter = b > 0.05 ? `blur(${b}px)` : 'none';
}
function words(parent, text) { parent.innerHTML = ''; const a = String(text || '').split(' ').filter((x) => x !== ''); return a.map((w, i) => mk(parent, 'span', 'w', null, esc(w) + (i < a.length - 1 ? ' ' : ''))); }
let EASE = eo;
function wordsIn(ws, t, t0, dur, o = {}) {
  const n = ws.length || 1;
  ws.forEach((w, i) => { const a = t0 + (dur * i) / n; const p = EASE(pr(t, a, a + (o.d || 0.22))); tf(w, { y: (1 - p) * (o.dy ?? 40), s: lerp(o.s0 ?? 1.12, 1, p), o: cl(p), b: (1 - cl(p)) * (o.bl ?? 10) }); });
}
function typed(e, text, t, t0, cps, caret) {
  const n = Math.floor(cl((t - t0) * cps, 0, text.length)); e.textContent = text.slice(0, n);
  if (caret) caret.style.opacity = t > t0 - 0.2 && (n < text.length || Math.floor(t * 2.2) % 2 === 0) ? 1 : 0;
  return n;
}
function odo(parent, n, fs, st) {
  const wrap = mk(parent, 'div', 'odo dsp', Object.assign({ fontSize: fs + 'px', textTransform: 'none' }, st || {}));
  const cols = [];
  for (let i = 0; i < n; i++) { const c = mk(wrap, 'div', 'odc'); cols.push(mk(c, 'div', 'ods', null, Array.from({ length: 30 }, (_, k) => `<div>${k % 10}</div>`).join(''))); }
  return {
    wrap,
    set(val, t, t0, t1, stag = 0.12) {
      const ds = String(Math.max(0, Math.round(val))).padStart(n, '0').split('').map(Number);
      cols.forEach((s, i) => {
        const a = t0 + i * stag, b = t1 + i * stag * 1.4;
        const p = eio(pr(t, a, b)); const pos = p * (20 + ds[i]);
        const v = Math.abs(eio(pr(t + 0.01, a, b)) - eio(pr(t - 0.01, a, b))) * 50;
        s.style.transform = `translateY(${-pos}em)`; s.style.filter = v > 0.4 ? `blur(${Math.min(v * 0.6, 4)}px)` : 'none';
      });
    },
  };
}
const fmtNum = (v) => Number(v).toLocaleString('en-US');
const pillTone = (tone) => (tone === 'good' ? 'pill good' : tone === 'accent' ? 'pill acc' : tone === 'warn' ? 'pill warn' : 'pill neu');

function css(S, fontBase) {
  const P = S.palette; const [ar, ag, ab] = rgb(P.accent); const [ir, ig, ib] = rgb(P.ink); const [sr, sg, sb] = rgb(P.bg);
  const D = S.display; const scale = D.scale || 1;
  const cardCss = {
    solid: 'background:var(--card);border:1px solid var(--ln);',
    outline: 'background:var(--bg);border:1.5px solid rgba(var(--ir),.55);',
    glass: 'background:rgba(var(--cr2),.55);border:1px solid rgba(var(--ir),.16);backdrop-filter:blur(18px);',
    heavy: 'background:var(--card);border:4px solid var(--cr);box-shadow:10px 10px 0 var(--cr);',
    soft: 'background:var(--card);border:0;box-shadow:0 30px 70px -24px rgba(var(--ar),.35),0 2px 8px rgba(0,0,0,.06);',
  }[S.card.style] || 'background:var(--card);border:1px solid var(--ln);';
  const [cr2r, cr2g, cr2b] = rgb(P.card);
  return `${fontFaceCss(fontBase)}
.nm{--a:${P.accent};--ar:${ar},${ag},${ab};--a2:${P.accent2};--cr:${P.ink};--ir:${ir},${ig},${ib};--mu:${P.muted};--dim:${P.muted};--bg:${P.bg};--bg2:${P.bg2};--sr:${sr},${sg},${sb};
 --card:${P.card};--cr2:${cr2r},${cr2g},${cr2b};--ln:${P.line};--ai:${S.accentInk};--rad:${S.card.radius}px;
 --fd:'${S.fonts.display}',Georgia,serif;--fb:'${S.fonts.body}',Inter,sans-serif;--fm:'${S.fonts.mono}',monospace;--dw:${D.weight};--dw2:${D.weight2};--dtt:${D.case === 'upper' ? 'uppercase' : 'none'};--dls:${D.tracking}em;--dsc:${scale};
 position:relative;overflow:hidden;background:var(--bg);color:var(--cr);font-family:var(--fb);-webkit-font-smoothing:antialiased}
.nm *{box-sizing:border-box;margin:0;padding:0}
.nm .ab{position:absolute}
.nm .sc{position:absolute;left:0;top:0;width:1080px;height:100%;display:none}
.nm .dsp{font-family:var(--fd);font-weight:var(--dw);letter-spacing:var(--dls);text-transform:var(--dtt);line-height:1.02}
.nm .dsp2{font-family:var(--fd);font-weight:var(--dw2);letter-spacing:calc(var(--dls) * .5);line-height:1.12}
.nm .mono{font-family:var(--fm);font-weight:500;letter-spacing:.08em;text-transform:uppercase}
.nm .persp{position:absolute;inset:0;perspective:1700px;perspective-origin:50% 45%}
.nm .plane{position:absolute;left:50%;top:50%;transform-style:preserve-3d;border-radius:18px;box-shadow:0 40px 120px rgba(0,0,0,.45);overflow:hidden}
.nm .plane img{width:100%;display:block}
.nm .odo{display:flex;line-height:1}
.nm .odc{height:1em;overflow:hidden;width:.62em;text-align:center}
.nm .ods div{height:1em}
.nm .card{${cardCss}border-radius:var(--rad)}
.nm .pill{display:inline-flex;align-items:center;gap:10px;height:46px;padding:0 18px;border-radius:999px;font-size:22px;font-weight:600;white-space:nowrap}
.nm .pill.good{color:#16A34A;background:rgba(74,222,128,.16)} .nm.dark .pill.good{color:#4ADE80}
.nm .pill.acc{color:var(--ai);background:var(--a)}
.nm .pill.warn{color:#B7791F;background:rgba(232,176,75,.18)} .nm.dark .pill.warn{color:#E8B04B}
.nm .pill.neu{color:var(--cr);background:rgba(var(--ir),.08)}
.nm .w{display:inline-block;white-space:pre}
.nm .lbl{font-family:var(--fm);font-weight:500;letter-spacing:.12em;text-transform:uppercase;font-size:19px;color:var(--mu)}
.nm .chip{display:inline-flex;align-items:center;gap:12px;height:56px;padding:0 22px;border-radius:999px;border:1px solid var(--ln);background:var(--card);font-size:23px;font-weight:600;white-space:nowrap}
.nm .cap{position:absolute;left:60px;right:60px;text-align:center;font-weight:650;font-size:36px;line-height:1.25;letter-spacing:-.01em;text-wrap:balance}
.nm .cap.box span.ln{background:var(--cr);color:var(--bg);padding:4px 14px;box-decoration-break:clone;-webkit-box-decoration-break:clone;line-height:1.55}
.nm .cap.mono{font-family:var(--fm);font-weight:500;font-size:32px;text-align:left}
.nm .clip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nm .acc{color:var(--a)}
.nm .it{font-style:italic}
`;
}

export function mount(root, comp, opts = {}) {
  const fmt = FORMATS[opts.format || '4x5'] || FORMATS['4x5'];
  const W = fmt.w, H = fmt.h;
  const brand = comp.brand || {};
  const S = resolveStyle(comp.style || {}, brand.accent);
  EASE = S.display.bouncy ? eback : eo;
  const assetUrl = (id) => { if (!id) return ''; const a = (comp.assets || {})[id]; const u = a ? a.url : id; return /^(https?:|data:|\/)/.test(u) ? u : (opts.assetBase || '') + u; };
  const L = layout(comp);
  const REV = L.revealIndex;
  const post = (t) => REV < 0 || t >= L.revealAt;
  const seed = [...String(comp.title || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) + (S.seed || 0);

  const SQUARE = H < 1300;
  const SH = SQUARE ? 1350 : H;
  const SS = SQUARE ? H / 1350 : 1;
  const TALL = SH > 1500;
  const ST = TALL ? 250 : 72;
  const CC = TALL ? 905 : 612;
  root.innerHTML = '';
  const style = document.createElement('style'); style.textContent = css(S, opts.fontBase || './fonts/'); root.appendChild(style);
  const F = mk(root, 'div', 'nm' + (S.dark ? ' dark' : ''), { width: W + 'px', height: H + 'px' });

  // ── background ──
  const bg = mk(F, 'div', 'ab', { inset: 0 });
  const bgr = buildBackground(bg, S, W, H, CC, seed);
  const camWrap = mk(F, 'div', 'ab', { left: (W - 1080 * SS) / 2 + 'px', top: 0, width: '1080px', height: SH + 'px', transformOrigin: '0 0', transform: `scale(${SS})` });
  const cam = mk(camWrap, 'div', 'ab', { inset: 0 });
  const trans = mk(F, 'div', 'ab', { inset: 0, pointerEvents: 'none', overflow: 'hidden' });
  const hud = mk(F, 'div', 'ab', { inset: 0, pointerEvents: 'none' });
  const capbox = mk(F, 'div', 'ab', { inset: 0 });
  const grainC = mk(F, 'canvas', 'ab', { inset: 0, width: W + 'px', height: H + 'px', opacity: S.grain, mixBlendMode: 'overlay', pointerEvents: 'none' });
  if (S.vignette) mk(F, 'div', 'ab', { inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,${S.dark ? 0.55 : 0.18}) 100%)` });
  const lbH = S.letterbox ? Math.round(H * (TALL ? 0.07 : 0.085)) : 0;
  if (lbH) { mk(F, 'div', 'ab', { left: 0, right: 0, top: 0, height: lbH + 'px', background: '#000' }); mk(F, 'div', 'ab', { left: 0, right: 0, bottom: 0, height: lbH + 'px', background: '#000' }); }
  const flash = mk(F, 'div', 'ab', { inset: 0, background: S.dark ? '#fff' : S.palette.ink, opacity: 0, pointerEvents: 'none' });

  grainC.width = W / 2; grainC.height = H / 2; const gx = grainC.getContext('2d'); const R0 = rng(7); const grains = [];
  if (S.grain > 0) for (let k = 0; k < 6; k++) { const id = gx.createImageData(grainC.width, grainC.height); for (let i = 0; i < id.data.length; i += 4) { const v = R0() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } grains.push(id); }

  // ── transitions overlay ──
  const T = buildTransition(trans, S, W, H);

  // ── HUD ──
  const hudMode = brand.hud === false ? 'none' : S.hud;
  const topSafe = (SQUARE ? 56 : ST) + (lbH && !TALL ? lbH - 20 : 0);
  const capY = SQUARE ? H - 110 : TALL ? 1390 : H - 102 - (lbH ? lbH - 40 : 0);
  const progY = SQUARE ? H - 50 : TALL ? 1478 : H - 50 - (lbH ? lbH - 30 : 0);
  const scrimTop = mk(hud, 'div', 'ab', { left: 0, right: 0, top: 0, height: topSafe + 90 + 'px', background: `linear-gradient(to bottom,rgba(var(--sr),.7),rgba(var(--sr),0))`, display: hudMode === 'none' ? 'none' : 'block' });
  mk(hud, 'div', 'ab', { left: 0, right: 0, bottom: 0, height: (TALL ? 620 : 230) + 'px', background: `linear-gradient(to top,rgba(var(--sr),.8),rgba(var(--sr),0))`, display: S.captions === 'none' ? 'none' : 'block' });
  const corners = hudMode === 'tech' ? [[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy]) => mk(hud, 'div', 'ab', { width: '34px', height: '34px', left: (cx ? W - 62 : 28) + 'px', top: (cy ? H - 62 : 28) + 'px',
    borderLeft: cx ? 'none' : '2px solid', borderRight: cx ? '2px solid' : 'none', borderTop: cy ? 'none' : '2px solid', borderBottom: cy ? '2px solid' : 'none' })) : [];
  const hudL = mk(hud, 'div', 'ab', { left: '64px', top: topSafe - 26 + 'px', display: hudMode === 'none' ? 'none' : 'flex', alignItems: 'center', gap: '14px', height: '52px' });
  const hudImg = brand.hudImage ? assetUrl(brand.hudImage) : '';
  const hudAv = mk(hudL, 'div', '', { width: '52px', height: '52px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--a)', opacity: 0, flex: 'none', background: '#000', display: hudImg ? 'block' : 'none' },
    `<img src="${esc(hudImg)}" style="width:100%;height:100%;object-fit:cover;object-position:50% 18%">`);
  const hudSq = mk(hudL, 'div', '', { width: '14px', height: '14px', border: '2px solid var(--cr)', flex: 'none', borderRadius: S.card.radius > 12 ? '50%' : '0' });
  const hudT = mk(hudL, 'div', '', { display: 'flex', flexDirection: 'column', gap: '3px' });
  const hudName = mk(hudT, 'div', 'mono', { fontSize: '19px', color: 'var(--cr)' });
  const hudAct = mk(hudT, 'div', 'mono', { fontSize: '15px', color: 'var(--mu)', letterSpacing: '.06em', display: hudMode === 'tech' ? 'block' : 'none' });
  const hudR = mk(hud, 'div', 'ab mono', { right: '64px', top: topSafe - 12 + 'px', fontSize: '17px', color: 'var(--mu)', textAlign: 'right', display: hudMode === 'tech' ? 'block' : 'none' });
  const prog = mk(hud, 'div', 'ab', { left: '64px', right: '64px', top: progY + 'px', height: '4px', display: hudMode === 'none' ? 'none' : 'flex', gap: '6px' });
  const segs = L.scenes.map(() => mk(mk(prog, 'div', '', { flex: '1', height: hudMode === 'minimal' ? '3px' : '4px', background: 'rgba(var(--ir),.14)', borderRadius: '2px', overflow: 'hidden' }), 'div', '', { height: '100%', width: '0%' }));

  // ── captions ──
  const capCls = 'cap' + (S.captions === 'box' ? ' box' : S.captions === 'mono' ? ' mono' : '');
  const caps = L.captions.map((c) => {
    const el = mk(capbox, 'div', capCls, { top: capY + 'px', opacity: 0 });
    const host = S.captions === 'box' ? mk(el, 'span', 'ln') : el;
    if (S.captions === 'mono') mk(host, 'span', '', { color: 'var(--a)' }, '&gt; ');
    return { ...c, el, ws: c.words.map((w) => [mk(host, 'span', 'w', null, esc(w.w) + ' '), w.t]) };
  });
  if (comp.captions === false || S.captions === 'none') capbox.style.display = 'none';

  // ── scenes ──
  const shared = { markers: [] };
  const ctx = { W, H: SH, CC, ST, TALL, SQUARE, S, brand, assetUrl, shared, cam, F, seed, hudPos: () => ({ x: 64 + 26, y: topSafe - 26 + 26 }) };
  const built = L.scenes.map((s, i) => {
    const e = mk(cam, 'div', 'sc');
    const fn = SCENES[s.type] || SCENES.headline;
    const info = { prev: L.scenes[i - 1], next: L.scenes[i + 1], index: i, scene: s, flyToHud: s.type === 'reveal' && hudImg && hudMode !== 'none' && s.props?.image === brand.hudImage };
    let r;
    try { r = fn(e, s.props || {}, ctx, info); } catch (err) { e.innerHTML = `<div class="ab lbl" style="left:60px;top:${CC}px;color:#f66">Scene ${i + 1} (${esc(s.type)}) failed: ${esc(err.message)}</div>`; r = () => {}; }
    return { s, e, r, off: localOffset(s, REV) };
  });

  function render(t) {
    const P = post(t);
    const beat = P && REV >= 0 ? Math.exp(-(((t - L.revealAt) % L.beat) + L.beat) % L.beat * 7) : 0;
    bgr(t, P, beat);
    let sh = 0; if (REV >= 0 && t >= L.revealAt) sh = (1 - pr(t, L.revealAt, L.revealAt + 0.45)) * 14;
    const R = rng(Math.floor(t * 30) + 1);
    let cur = 0;
    built.forEach((b, i) => {
      const last = i === built.length - 1;
      const vis = t >= b.s.start && (t < b.s.end || (last && t <= b.s.end + 1));
      b.e.style.display = vis ? 'block' : 'none';
      if (vis) { cur = i; b.e.style.clipPath = 'none'; b.e.style.transform = ''; b.e.style.filter = ''; b.r(t - b.s.start + b.off, b.s.dur + b.off); if (i > 0) T.enter(b.e, t - b.s.start, R); }
    });
    const gl = T.overlay(t, built.map((b) => b.s.start).slice(1), R);
    cam.style.transform = `translate(${(R() - 0.5) * sh + (gl.x || 0)}px,${(R() - 0.5) * sh}px) scale(${(1 + 0.012 * Math.sin(t * 0.7)) * (gl.s || 1)})`;
    cam.style.filter = gl.filter || '';
    let fl = gl.flash || 0;
    if (REV >= 0 && t >= L.revealAt && t < L.revealAt + 0.25) fl = Math.max(fl, (1 - pr(t, L.revealAt, L.revealAt + 0.25)) * 0.35);
    flash.style.opacity = fl;
    // HUD
    const flown = REV >= 0 ? t >= L.scenes[REV].end - 0.05 : t >= 0.3;
    hudSq.style.display = hudImg && flown ? 'none' : 'block'; hudAv.style.opacity = hudImg && flown ? 1 : 0;
    hudSq.style.borderColor = P ? 'var(--a)' : 'var(--cr)';
    if (REV < 0 || flown) {
      hudName.textContent = brand.hudName || brand.product || brand.name || '';
      const s = L.scenes[cur]; const st = s.status || ''; const n = Math.floor((t - s.start) * 45);
      hudAct.textContent = st.slice(0, n) + (st && n < st.length ? '▍' : ''); hudAct.style.color = P ? 'var(--a)' : 'var(--mu)';
      if (!st) { hudAct.textContent = brand.hudSub || ''; hudAct.style.color = 'var(--mu)'; }
    } else { hudName.textContent = brand.hudPre || brand.name || ''; hudAct.textContent = brand.hudSub || ''; hudAct.style.color = 'var(--mu)'; }
    const fr = Math.floor(t * 30) % 30, sec = Math.floor(t);
    hudR.innerHTML = `<span style="color:var(--cr)">00:${String(sec).padStart(2, '0')}:${String(fr).padStart(2, '0')}</span><br>${String(cur + 1).padStart(2, '0')} / ${String(L.scenes.length).padStart(2, '0')}`;
    L.scenes.forEach((s, i) => { segs[i].style.width = pr(t, s.start, s.end) * 100 + '%'; segs[i].style.background = P ? 'var(--a)' : 'var(--cr)'; });
    corners.forEach((c) => (c.style.borderColor = P ? 'rgba(var(--ar),.55)' : 'rgba(var(--ir),.3)'));
    scrimTop.style.opacity = 1;
    caps.forEach((c) => {
      const on = t >= c.start - 0.05 && t < c.end + 0.55;
      c.el.style.opacity = on ? eo(pr(t, c.start - 0.05, c.start + 0.15)) * (1 - pr(t, c.end + 0.35, c.end + 0.55)) : 0;
      if (on) c.ws.forEach(([sp, st]) => {
        const p = pr(t, st - 0.02, st + 0.1);
        if (S.captions === 'karaoke') { const now = t >= st && t < st + 0.38; sp.style.opacity = 0.35 + 0.65 * p; sp.style.color = now ? 'var(--a)' : ''; sp.style.transform = now ? 'scale(1.08)' : ''; }
        else if (S.captions === 'mono') sp.style.opacity = p > 0 ? 1 : 0;
        else sp.style.opacity = 0.32 + 0.68 * p;
      });
    });
    if (grains.length) gx.putImageData(grains[Math.floor(t * 24) % 6], 0, 0);
  }

  const imgs = [...root.querySelectorAll('img')];
  const ready = Promise.all([document.fonts.ready, ...imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : null))]);
  render(0);
  return { render, duration: L.duration, layout: L, ready, width: W, height: H, style: S };
}

// ═════════════════════════ BACKGROUNDS ═════════════════════════
function buildBackground(bg, S, W, H, CC, seed) {
  const P = S.palette; const kind = S.background;
  bg.style.background = P.bg;
  const spot = mk(bg, 'div', 'ab', { inset: 0 });
  const layer = mk(bg, 'div', 'ab', { inset: 0, overflow: 'hidden' });
  const R = rng(seed);
  const ink = (a) => `rgba(var(--ir),${a})`;
  let upd = () => {};
  if (kind === 'grid' || kind === 'horizon') {
    if (kind === 'horizon') {
      layer.style.background = `linear-gradient(to bottom,${P.bg} 0%,${P.bg2} 52%,${P.bg} 52.2%)`;
      const sun = mk(layer, 'div', 'ab', { left: W / 2 - 230 + 'px', top: H * 0.52 - 330 + 'px', width: '460px', height: '460px', borderRadius: '50%',
        background: `linear-gradient(to bottom,${P.accent2},${P.accent})`, WebkitMaskImage: 'repeating-linear-gradient(to bottom,#000 0 26px,transparent 26px 34px)', maskImage: 'repeating-linear-gradient(to bottom,#000 0 26px,transparent 26px 34px)', opacity: 0.85, boxShadow: `0 0 120px rgba(var(--ar),.5)` });
      upd = (t) => { sun.style.transform = `translateY(${Math.sin(t * 0.4) * 6}px)`; };
    }
    const gp = mk(layer, 'div', 'persp', { perspective: '900px', perspectiveOrigin: '50% 0%' });
    const c = kind === 'horizon' ? `rgba(var(--ar),.55)` : ink(0.08);
    const grid = mk(gp, 'div', 'ab', { left: '-1000px', width: W + 2000 + 'px', top: H * 0.52 + 'px', height: H * 1.6 + 'px', transformOrigin: '50% 0',
      backgroundImage: `linear-gradient(${c} 1px,transparent 1px),linear-gradient(90deg,${c} 1px,transparent 1px)`, backgroundSize: '90px 90px',
      WebkitMaskImage: 'linear-gradient(to bottom,transparent,black 20%,black 55%,transparent)', maskImage: 'linear-gradient(to bottom,transparent,black 20%,black 55%,transparent)' });
    const u0 = upd; upd = (t, P_, beat) => { u0(t); grid.style.transform = `rotateX(72deg) translateY(${(t * 60) % 90}px)`; grid.style.opacity = 0.55 + 0.45 * beat; };
  } else if (kind === 'paper') {
    layer.innerHTML = `<svg width="${W}" height="${H}" style="position:absolute;inset:0;opacity:.35;mix-blend-mode:multiply"><filter id="pp${seed}"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seed % 97}"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .4  0 0 0 0 .33  0 0 0 .55 0"/></filter><rect width="100%" height="100%" filter="url(#pp${seed})"/></svg>`;
    for (let k = 1; k < 4; k++) mk(layer, 'div', 'ab', { left: (W * k) / 4 + 'px', top: 0, bottom: 0, width: '1px', background: ink(0.07) });
    const sweep = mk(layer, 'div', 'ab', { inset: 0, background: `linear-gradient(115deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.35) 50%,rgba(255,255,255,0) 70%)` });
    upd = (t) => { sweep.style.transform = `translateX(${((t * 90) % (W * 2)) - W}px)`; };
  } else if (kind === 'modules') {
    for (let k = 1; k < 6; k++) mk(layer, 'div', 'ab', { left: (W * k) / 6 + 'px', top: 0, bottom: 0, width: '1px', background: ink(0.1) });
    for (let k = 1; k < 8; k++) mk(layer, 'div', 'ab', { top: (H * k) / 8 + 'px', left: 0, right: 0, height: '1px', background: ink(0.1) });
    const blk = mk(layer, 'div', 'ab', { width: W / 6 + 'px', height: H / 8 + 'px', background: 'var(--a)' });
    const blk2 = mk(layer, 'div', 'ab', { width: W / 3 + 'px', height: '10px', background: 'var(--cr)' });
    upd = (t) => { const k = Math.floor(t / 2); const r2 = rng(k + seed); blk.style.left = Math.floor(r2() * 6) * (W / 6) + 'px'; blk.style.top = (r2() < 0.5 ? 0 : 7) * (H / 8) + 'px'; blk2.style.left = Math.floor(r2() * 4) * (W / 6) + 'px'; blk2.style.top = Math.floor(1 + r2() * 6) * (H / 8) + 'px'; };
  } else if (kind === 'stripes') {
    layer.style.background = `repeating-linear-gradient(-45deg,${ink(0.06)} 0 28px,transparent 28px 56px)`; layer.style.inset = '-200px';
    upd = (t) => { layer.style.transform = `translateX(${(t * 40) % 79}px)`; };
  } else if (kind === 'blueprint') {
    layer.style.backgroundImage = `linear-gradient(${ink(0.14)} 1px,transparent 1px),linear-gradient(90deg,${ink(0.14)} 1px,transparent 1px),linear-gradient(${ink(0.06)} 1px,transparent 1px),linear-gradient(90deg,${ink(0.06)} 1px,transparent 1px)`;
    layer.style.backgroundSize = '150px 150px,150px 150px,30px 30px,30px 30px';
    const marks = Array.from({ length: 6 }, () => mk(layer, 'div', 'ab mono', { fontSize: '14px', color: ink(0.45) }, `+ ${Math.round(R() * 900)}.${Math.round(R() * 99)}`));
    marks.forEach((m) => { m.style.left = 40 + R() * (W - 200) + 'px'; m.style.top = 40 + R() * (H - 80) + 'px'; });
    upd = (t) => { layer.style.backgroundPosition = `${(t * 8) % 150}px ${(t * 5) % 150}px`; };
  } else if (kind === 'smoke' || kind === 'blobs') {
    const cols = kind === 'blobs' ? [`rgba(var(--ar),.28)`, P.accent2 + '55', P.bg2] : [`rgba(var(--ar),.10)`, `rgba(var(--ir),.05)`, P.bg2 + '88'];
    const bl = cols.map((c2, i) => mk(layer, 'div', 'ab', { width: '1000px', height: '1000px', borderRadius: '50%', background: `radial-gradient(circle,${c2} 0%,rgba(0,0,0,0) 65%)` }));
    upd = (t) => bl.forEach((b, i) => { b.style.left = W * (0.2 + 0.6 * ((i * 0.37 + 0.15) % 1)) - 500 + Math.sin(t * (0.2 + i * 0.07) + i * 2) * 140 + 'px'; b.style.top = H * (0.25 + 0.5 * ((i * 0.53 + 0.2) % 1)) - 500 + Math.cos(t * (0.17 + i * 0.05) + i) * 120 + 'px'; });
  } else if (kind === 'scanlines') {
    layer.style.background = `repeating-linear-gradient(to bottom,${ink(0.06)} 0 2px,transparent 2px 5px)`;
    const glow = mk(layer, 'div', 'ab', { inset: 0, background: `radial-gradient(ellipse at 50% 45%,rgba(var(--ar),.10),rgba(0,0,0,0) 65%)` });
    const bar = mk(layer, 'div', 'ab', { left: 0, right: 0, height: '120px', background: `linear-gradient(to bottom,rgba(var(--ar),0),rgba(var(--ar),.06),rgba(var(--ar),0))` });
    upd = (t) => { bar.style.top = ((t * 260) % (H + 240)) - 120 + 'px'; glow.style.opacity = 0.85 + 0.15 * Math.sin(t * 40); };
  } else if (kind === 'dots') {
    layer.style.backgroundImage = `radial-gradient(${ink(0.13)} 1.6px,transparent 1.8px)`; layer.style.backgroundSize = '34px 34px';
    upd = (t) => { layer.style.backgroundPosition = `${(t * 6) % 34}px ${(t * 10) % 34}px`; };
  }
  return (t, P_, beat) => {
    spot.style.background = P_ ? `radial-gradient(ellipse 80% 55% at 50% ${CC - 120}px,rgba(var(--ar),${(S.dark ? 0.1 : 0.07) + 0.05 * beat}),rgba(0,0,0,0) 70%)` : `radial-gradient(ellipse 70% 50% at 50% ${CC - 100}px,rgba(var(--ir),.04),rgba(0,0,0,0) 70%)`;
    upd(t, P_, beat);
  };
}

// ═════════════════════════ TRANSITIONS ═════════════════════════
function buildTransition(root, S, W, H) {
  const kind = S.transition;
  const panel = mk(root, 'div', 'ab', { top: 0, bottom: 0, width: W * 1.2 + 'px', left: 0, background: kind === 'wipe' ? 'var(--a)' : 'var(--bg)', display: 'none' });
  const panel2 = mk(root, 'div', 'ab', { top: 0, bottom: 0, width: W * 1.2 + 'px', left: 0, background: S.dark ? 'var(--cr)' : 'var(--cr)', display: 'none' });
  const slices = kind === 'glitch' ? Array.from({ length: 7 }, (_, i) => mk(root, 'div', 'ab', { left: 0, right: 0, height: '0px', background: i % 2 ? 'rgba(var(--ar),.35)' : `${S.palette.accent2}55`, mixBlendMode: S.dark ? 'screen' : 'multiply', display: 'none' })) : [];
  return {
    enter(e, lt, R) {
      if (kind === 'iris') { const p = eo(pr(lt, 0, 0.42)); if (p < 1) e.style.clipPath = `circle(${p * 125}% at 50% 48%)`; }
      else if (kind === 'slide') { const p = eo5(pr(lt, 0, 0.38)); if (p < 1) { e.style.transform = `translateX(${(1 - p) * 1080}px)`; e.style.filter = `blur(${(1 - p) * 8}px)`; } }
      else if (kind === 'cut') { const p = eo(pr(lt, 0, 0.25)); if (p < 1) e.style.transform = `scale(${1 + 0.08 * (1 - p)})`; }
      else if (kind === 'fade') { const p = eio(pr(lt, 0, 0.45)); if (p < 1) e.style.filter = `brightness(${0.2 + 0.8 * p})`; }
    },
    overlay(t, cuts, R) {
      const out = {}; let near = null; for (const c of cuts) if (Math.abs(t - c) < 0.3) near = c;
      panel.style.display = panel2.style.display = 'none'; slices.forEach((s) => (s.style.display = 'none'));
      if (near == null) { if (kind === 'zoom') return out; return out; }
      const d = t - near;
      if (kind === 'wipe') {
        const p = pr(d, -0.24, 0.24); const x = lerp(-W * 1.25, W * 1.1, eio(p));
        panel.style.display = 'block'; panel.style.transform = `translateX(${x}px) skewX(-12deg)`;
        panel2.style.display = 'block'; panel2.style.width = '40px'; panel2.style.transform = `translateX(${x + W * 1.2}px) skewX(-12deg)`;
      } else if (kind === 'glitch' && Math.abs(d) < 0.14) {
        out.x = (R() - 0.5) * 60; out.filter = `hue-rotate(${(R() - 0.5) * 90}deg) saturate(${1.5 + R()}) contrast(1.2)`;
        slices.forEach((s) => { s.style.display = 'block'; s.style.top = R() * H + 'px'; s.style.height = 8 + R() * 60 + 'px'; s.style.transform = `translateX(${(R() - 0.5) * 120}px)`; });
        out.flash = R() < 0.3 ? 0.12 : 0;
      } else if (kind === 'cut' && d >= 0 && d < 0.09) { out.flash = 0.85 * (1 - d / 0.09); }
      else if (kind === 'zoom' && d >= 0 && d < 0.12) { out.flash = (1 - d / 0.12) * 0.16; }
      else if (kind === 'fade') { /* handled on enter */ }
      else if (kind === 'iris' && d >= 0 && d < 0.1) { out.flash = (1 - d / 0.1) * 0.06; }
      return out;
    },
  };
}

// ═════════════════════════ SCENE LIBRARY ═════════════════════════
const exitT = (d) => [d - 0.27, d];
const fit = (len, base, min, per = 2.6, from = 18) => Math.round(cl(base - (len - from) * per, min, base));
// Display headline block: respects direction alignment and accent styling (italic accent for serif directions).
function headlineBlock(e, lines, c, top, fs) {
  const al = c.S.display.align; const sc = c.S.display.scale || 1;
  const hd = mk(e, 'div', 'ab dsp', { left: '70px', right: '70px', top: top + 'px', textAlign: al, fontSize: Math.round(fs * sc) + 'px' });
  const W = lines.map((l, i) => { const ws = words(mk(hd, 'div'), l); if (i === lines.length - 1 && ws.length) { const last = ws[ws.length - 1]; if (c.S.display.italicAccent) last.classList.add('it', 'acc'); } return ws; });
  return { hd, W };
}

export const SCENES = {
  stat(e, p, c) {
    const { CC, TALL } = c;
    const rows = (p.rows || []).slice(0, 3);
    const back = mk(e, 'div', 'ab', { left: '110px', right: '110px', top: CC - (TALL ? 620 : 505) + 'px' });
    const rowEls = rows.map((r) => mk(back, 'div', 'card', { display: 'flex', alignItems: 'center', gap: '16px', padding: '13px 22px', marginBottom: '10px' },
      `<span style="width:10px;height:10px;border-radius:50%;background:var(--cr);opacity:.6;flex:none"></span><div style="flex:1;min-width:0"><div class="clip" style="font-weight:650;font-size:21px">${esc(r.title)}</div><div class="clip" style="font-size:16px;color:var(--mu);margin-top:3px">${esc(r.meta || '')}</div></div>${r.status ? `<span class="mono" style="font-size:15px;color:var(--mu);border:1px solid var(--ln);padding:6px 10px;border-radius:6px">${esc(r.status)}</span>` : ''}`));
    const lab = mk(e, 'div', 'ab lbl', { left: 0, right: 0, textAlign: 'center', top: CC - 235 + 'px', fontSize: '22px' });
    const n = String(Math.round(p.value || 0)).length; const fs = n <= 3 ? 330 : n === 4 ? 270 : n === 5 ? 220 : 185;
    const ow = mk(e, 'div', 'ab', { left: 0, right: 0, top: CC - 190 + (330 - fs) / 2 + 'px', display: 'flex', justifyContent: 'center' });
    const od = odo(ow, n, fs);
    const sub = mk(e, 'div', 'ab dsp2', { left: '40px', right: '40px', textAlign: 'center', top: CC + 150 + 'px', fontSize: '54px' }, esc(p.label || ''));
    const st = mk(e, 'div', 'ab', { left: 0, right: 0, top: CC + 250 + 'px', display: 'flex', justifyContent: 'center', gap: '18px', flexWrap: 'wrap', padding: '0 40px' });
    const chips = (p.chips || []).slice(0, 3).map((ch) => { const el = mk(st, 'div', 'chip', null, `<b class="dsp" style="font-size:28px;text-transform:none">0</b><span style="color:var(--mu)">${esc(ch.label)}</span>`); return { el, b: el.querySelector('b'), v: Number(ch.value) || 0 }; });
    const src = mk(e, 'div', 'ab mono', { left: 0, right: 0, textAlign: 'center', top: CC + 340 + 'px', fontSize: '16px', color: 'var(--mu)' }, esc(p.source ? 'Source · ' + p.source : ''));
    return (lt, d) => {
      const out = eo(pr(lt, d - 0.2, d)); tf(e, { s: 1 + out * 0.35, o: 1 - out, b: out * 14 });
      typed(lab, p.kicker || '', lt, 0.05, 48);
      od.set(p.value || 0, lt, 0.15, 1.45, 0.14); tf(ow, { s: lerp(0.92, 1, eo(pr(lt, 0, 1.6))), o: eo(pr(lt, 0, 0.25)) });
      const sp = EASE(pr(lt, 1.1, 1.5)); tf(sub, { y: (1 - sp) * 30, o: cl(sp), b: (1 - cl(sp)) * 8 });
      chips.forEach((ch, i) => { const q = EASE(pr(lt, 1.45 + i * 0.25, 1.8 + i * 0.25)); tf(ch.el, { y: (1 - q) * 24, o: cl(q), s: lerp(0.9, 1, q) }); ch.b.textContent = fmtNum(Math.round(ch.v * eo(pr(lt, 1.45 + i * 0.25, 2.1 + i * 0.25)))); });
      tf(src, { o: eo(pr(lt, 1.9, 2.3)) * 0.9 });
      rowEls.forEach((r, i) => { const q = eo(pr(lt, 0.05 + i * 0.12, 0.6 + i * 0.12)); tf(r, { y: -lt * 18 + (1 - q) * 30, o: q * 0.35, b: 1 }); });
    };
  },

  headline(e, p, c, info) {
    const { CC, assetUrl } = c;
    const pe = mk(e, 'div', 'persp');
    const pl = p.image ? mk(pe, 'div', 'plane', { width: '1750px', top: CC + 'px' }, `<img src="${esc(assetUrl(p.image))}" style="filter:brightness(${c.S.dark ? 0.34 : 0.95}) saturate(.8)${c.S.dark ? '' : ' opacity(.35)'}">`) : null;
    mk(e, 'div', 'ab', { inset: 0, background: `radial-gradient(ellipse 75% 34% at 50% ${CC}px,rgba(var(--sr),.92),rgba(var(--sr),.25) 72%)` });
    const scan = mk(e, 'div', 'ab', { left: 0, right: 0, height: '2px', background: 'var(--cr)', boxShadow: '0 0 18px 4px rgba(var(--ir),.35)' });
    const band = mk(e, 'div', 'ab', { left: 0, right: 0, height: '160px', background: 'linear-gradient(to bottom,rgba(var(--ir),0),rgba(var(--ir),.06))' });
    const R = rng(42 + info.index); const mks = []; c.shared.markers = [];
    const showMarks = p.markers !== false && c.S.preset !== 'editorial' && c.S.preset !== 'cinematic';
    if (showMarks) for (let i = 0; i < 16; i++) {
      let x = 110 + R() * 860, y = CC - 430 + R() * 860; if (Math.abs(y - CC) < 120) y += y < CC ? -150 : 150; c.shared.markers.push([x, y]);
      const m = mk(e, 'div', 'ab', { left: x + 'px', top: y + 'px' });
      const dd = mk(m, 'div', '', { position: 'absolute', left: '-6px', top: '-6px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--cr)' });
      const r = mk(m, 'div', '', { position: 'absolute', left: '-30px', top: '-30px', width: '60px', height: '60px', borderRadius: '50%', border: '2px solid var(--cr)' });
      const l = mk(m, 'div', 'mono', { position: 'absolute', left: '16px', top: '-11px', fontSize: '15px', color: 'var(--cr)', whiteSpace: 'nowrap' }, esc(p.markerLabel || ''));
      mks.push({ m, dd, r, l, y });
    } else for (let i = 0; i < 16; i++) c.shared.markers.push([110 + R() * 860, CC - 430 + R() * 860]);
    const lines = (p.lines || []).slice(0, 3); const longest = Math.max(10, ...lines.map((l) => l.length));
    const fs = fit(longest, 98, 60);
    const { W } = headlineBlock(e, lines, c, CC - (lines.length * fs * 1.02) / 2, fs);
    if (!showMarks) { scan.style.display = 'none'; band.style.display = 'none'; }
    return (lt, d) => {
      const [x0, x1] = exitT(d); const out = eo(pr(lt, x0, x1));
      if (pl) { const inp = eo(pr(lt, 0, 0.45)); tf(pl, { x: -875, y: -300 - lt * 150, rx: 38, rz: -9, s: lerp(1.5, 1.08, inp) + out * 0.2, b: (1 - inp) * 12 + out * 10, o: 0.95 * (1 - out) }); }
      const sy = CC - 460 + eio(pr(lt, 0.2, 1.5)) * 920; const sy2 = lt < 1.5 ? sy : CC - 460 + eio(pr(lt, 1.5, 2.3)) * 920;
      scan.style.top = sy2 + 'px'; band.style.top = sy2 - 160 + 'px'; const so = pr(lt, 0.15, 0.3) * (1 - pr(lt, 2.3, 2.45)); scan.style.opacity = so; band.style.opacity = so;
      mks.forEach((k) => { const ht = 0.2 + 1.3 * cl((k.y - (CC - 460)) / 920); const q = pr(lt, ht, ht + 0.25); tf(k.dd, { s: eo5(q), o: q }); const rp = pr(lt, ht, ht + 0.6); tf(k.r, { s: lerp(0.2, 1.6, eo(rp)), o: (1 - rp) * 0.8 }); tf(k.l, { o: q * 0.75, x: (1 - eo(q)) * -8 }); tf(k.m, { o: 1 - out }); });
      const span = Math.min(d - 0.9, 1.5);
      W.forEach((ws, i) => wordsIn(ws, lt, 0.14 + (i * span) / Math.max(1, W.length), span / Math.max(1, W.length)));
      if (out > 0) W.flat().forEach((w) => (w.style.opacity = Math.min(+w.style.opacity, 1 - out)));
    };
  },

  bars(e, p, c, info) {
    const { CC, W } = c;
    const lab = mk(e, 'div', 'ab lbl', { left: 0, right: 0, textAlign: 'center', top: CC - 370 + 'px', fontSize: '22px' });
    const n = String(Math.round(p.value || 0)).length; const fs = n <= 3 ? 300 : n === 4 ? 250 : n === 5 ? 205 : 170;
    const ow = mk(e, 'div', 'ab', { left: 0, right: 0, top: CC - 325 + (300 - fs) / 2 + 'px', display: 'flex', justifyContent: 'center' }); const od = odo(ow, n, fs);
    const bars = (p.bars || []).slice(0, 4); const mx = Math.max(1, ...bars.map((b) => Number(b.value) || 0));
    const box = mk(e, 'div', 'ab', { left: '130px', right: '130px', top: CC + 5 + 'px' });
    const bh = mk(box, 'div', 'lbl', { fontSize: '17px', marginBottom: '16px' }, esc(p.barsLabel || ''));
    const B = bars.map((b, i) => { const r = mk(box, 'div', '', { marginBottom: '14px' }); const top = mk(r, 'div', '', { display: 'flex', justifyContent: 'space-between', fontSize: '22px', fontWeight: 600, marginBottom: '8px' }, `<span class="clip">${esc(b.label)}</span><span class="nv dsp" style="text-transform:none">0</span>`);
      const tr = mk(r, 'div', '', { height: '10px', borderRadius: '5px', background: 'rgba(var(--ir),.10)', overflow: 'hidden' }); const f = mk(tr, 'div', '', { height: '100%', width: '0%', background: i === 0 ? 'var(--a)' : 'var(--cr)', borderRadius: '5px' }); return { r, f, v: Number(b.value) || 0, nv: top.querySelector('.nv') }; });
    const tgTop = CC + 5 + 40 + bars.length * 64 + 40;
    const tg = mk(e, 'div', 'ab dsp', { left: '40px', right: '40px', textAlign: 'center', top: tgTop + 'px', fontSize: (p.tagline || '').length > 26 ? '60px' : '78px' }); const tw = words(tg, p.tagline || '');
    if (c.S.display.italicAccent && tw.length) tw[tw.length - 1].classList.add('it', 'acc');
    const core = mk(e, 'div', 'ab', { left: '540px', top: CC + 'px', width: '40px', height: '40px', marginLeft: '-20px', marginTop: '-20px', borderRadius: '50%', background: 'var(--a)', boxShadow: '0 0 60px 20px rgba(var(--ar),.7)', opacity: 0 });
    const R = rng(99 + info.index); const pts = [];
    for (let i = 0; i < 150; i++) { const src = c.shared.markers[i] || [R() * W, CC - 520 + R() * 1040]; const tx = 360 + R() * 360, ty = CC - 310 + R() * 280; const sz = 3 + R() * 5;
      pts.push({ p: mk(e, 'div', 'ab', { left: 0, top: 0, width: sz + 'px', height: sz + 'px', background: i % 4 ? 'var(--cr)' : 'var(--a)', borderRadius: i % 3 ? '1px' : '50%' }), sx: src[0], sy: src[1], tx, ty, cx: (src[0] + tx) / 2 + (R() - 0.5) * 500, cy: (src[1] + ty) / 2 + (R() - 0.5) * 400, d: R() * 0.45 }); }
    const implode = info.next && info.next.type === 'reveal';
    return (lt, d) => {
      typed(lab, p.kicker || '', lt, 0.15, 50);
      pts.forEach((q) => { const k = eio(pr(lt, q.d, q.d + 0.7)); const x = (1 - k) * (1 - k) * q.sx + 2 * (1 - k) * k * q.cx + k * k * q.tx, y = (1 - k) * (1 - k) * q.sy + 2 * (1 - k) * k * q.cy + k * k * q.ty; tf(q.p, { x, y, o: lerp(0.55, 1, pr(lt, 0, q.d + 0.1)) * (1 - pr(lt, q.d + 0.7, q.d + 1.0)), s: lerp(1, 0.6, k) }); });
      od.set(p.value || 0, lt, 0.45, 1.35, 0.12); tf(ow, { o: eo(pr(lt, 0.4, 0.8)), s: lerp(0.85, 1, eo(pr(lt, 0.4, 1.4))) });
      tf(bh, { o: eo(pr(lt, 1.0, 1.3)) });
      B.forEach((b, i) => { const a = 1.05 + i * 0.16; const q = eo(pr(lt, a, a + 0.7)); tf(b.r, { o: eo(pr(lt, a, a + 0.25)), y: (1 - eo(pr(lt, a, a + 0.3))) * 16 }); b.f.style.width = (q * b.v) / mx * 100 + '%'; b.nv.textContent = fmtNum(Math.round(b.v * q)); });
      wordsIn(tw, lt, Math.min(2.0, d * 0.5), 0.45, { dy: 50 });
      if (implode) {
        const im = eio(pr(lt, d - 0.65, d - 0.08));
        if (im > 0) [lab, ow, box, tg].forEach((x) => { x.style.transformOrigin = `540px ${CC - parseFloat(x.style.top || 0)}px`; tf(x, { s: 1 - im * 0.98, o: 1 - im, b: im * 6 }); });
        const cp = pr(lt, d - 0.45, d); tf(core, { s: lerp(0, 1.6, eo(cp)), o: cp > 0 ? 1 : 0 });
      } else { const out = eo(pr(lt, d - 0.27, d)); if (out > 0) tf(e, { s: 1 + out * 0.2, o: 1 - out, b: out * 10 }); }
    };
  },

  reveal(e, p, c, info) {
    const { CC, assetUrl, brand, S } = c; const AY = CC - 110, R = 220;
    const glow = mk(e, 'div', 'ab', { left: 540 - 420 + 'px', top: AY - 420 + 'px', width: '840px', height: '840px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(var(--ar),.42),rgba(var(--ar),0) 62%)' });
    const orbitTxt = (p.orbit && p.orbit.length ? p.orbit : []).map((s) => String(s).toUpperCase()).join('  ·  ');
    const pid = 'orb' + info.index + '_' + c.seed;
    const orb = mk(e, 'div', 'ab', { left: 540 - 330 + 'px', top: AY - 330 + 'px', width: '660px', height: '660px' },
      orbitTxt ? `<svg width="660" height="660" viewBox="0 0 660 660"><defs><path id="${pid}" d="M330,330 m-290,0 a290,290 0 1,1 580,0 a290,290 0 1,1 -580,0"/></defs><text font-family="${S.fonts.mono}" font-size="19" font-weight="500" letter-spacing="5" fill="${S.palette.ink}" fill-opacity=".7"><textPath href="#${pid}">${esc(orbitTxt)}  ·  </textPath></text></svg>` : '');
    const tick = mk(e, 'div', 'ab', { left: 540 - 258 + 'px', top: AY - 258 + 'px', width: '516px', height: '516px' }, `<svg width="516" height="516"><circle cx="258" cy="258" r="252" fill="none" stroke="${S.palette.accent}" stroke-width="3" stroke-dasharray="2 14" stroke-opacity=".9"/></svg>`);
    const square = p.shape === 'square' || S.card.radius <= 6 || p.logo;
    const rr = square ? (p.logo ? '48px' : Math.max(0, S.card.radius * 2) + 'px') : '50%';
    const ring = mk(e, 'div', 'ab', { left: 540 - R - 12 + 'px', top: AY - R - 12 + 'px', width: 2 * R + 24 + 'px', height: 2 * R + 24 + 'px', borderRadius: square ? `calc(${rr} + 10px)` : '50%', border: '6px solid var(--a)' });
    const img = p.image ? assetUrl(p.image) : '';
    const av = mk(e, 'div', 'ab', { left: 540 - R + 'px', top: AY - R + 'px', width: 2 * R + 'px', height: 2 * R + 'px', borderRadius: rr, overflow: 'hidden', background: img ? (p.logo ? '#fff' : '#000') : 'var(--a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: p.logo ? '5%' : '0' },
      img ? `<img src="${esc(img)}" style="width:100%;height:100%;object-fit:${p.logo ? 'contain' : p.fit || 'cover'};object-position:50% ${p.logo ? '50%' : '12%'}">` : `<span class="dsp" style="font-size:200px;color:var(--ai)">${esc((p.title || brand.name || '?').replace(/^meet\s+/i, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 1))}</span>`);
    const disc = mk(e, 'div', 'ab', { left: '540px', top: AY + 'px', width: '10px', height: '10px', marginLeft: '-5px', marginTop: '-5px', borderRadius: '50%', background: 'var(--a)' });
    const disc2 = mk(e, 'div', 'ab', { left: '540px', top: AY + 'px', width: '10px', height: '10px', marginLeft: '-5px', marginTop: '-5px', borderRadius: '50%', background: 'var(--bg)' });
    const title = p.title || ''; const tfs = Math.round((title.length > 14 ? 96 : 124) * (S.display.scale || 1));
    const t1 = mk(e, 'div', 'ab dsp', { left: '30px', right: '30px', textAlign: 'center', top: AY + R + 48 + 'px', fontSize: tfs + 'px' });
    const w1 = words(t1, title); if (p.highlight) w1.forEach((w) => { if (w.textContent.trim().replace(/[.,!?]/g, '').toLowerCase() === String(p.highlight).replace(/[.,!?]/g, '').toLowerCase()) { w.classList.add('acc'); if (S.display.italicAccent) w.classList.add('it'); } });
    const t2 = mk(e, 'div', 'ab dsp2', { left: '40px', right: '40px', textAlign: 'center', top: AY + R + 48 + tfs + 22 + 'px', fontSize: '50px', opacity: 0.9, textTransform: 'none' }); const w2 = words(t2, p.subtitle || '');
    const streak = mk(e, 'div', 'ab', { left: '-400px', top: AY - 2 + 'px', width: '400px', height: '3px', background: 'linear-gradient(90deg,transparent,var(--cr),transparent)' });
    return (lt, d) => {
      tf(disc, { s: eo(pr(lt, 0, 0.32)) * 300, o: 1 - pr(lt, 0.55, 0.6) }); tf(disc2, { s: eo(pr(lt, 0.16, 0.55)) * 300, o: 1 - pr(lt, 0.55, 0.6) });
      const rp = eo(pr(lt, 0.3, 0.75)); tf(ring, { s: lerp(2.6, 1, rp), o: rp });
      const ap = EASE(pr(lt, 0.38, 0.85)); tf(av, { s: lerp(0.6, 1, ap), o: cl(ap), b: (1 - cl(ap)) * 14 });
      const bt = Math.exp(-(lt % 0.5) * 6); tf(glow, { o: cl(ap) * (0.75 + 0.25 * bt), s: 1 + 0.04 * bt });
      tf(orb, { rz: lt * 14, o: eo(pr(lt, 0.7, 1.2)) }); tf(tick, { rz: -lt * 22, o: eo(pr(lt, 0.6, 1.0)) });
      wordsIn(w1, lt, 0.32, 0.3, { dy: 70, s0: 1.4, bl: 16, d: 0.2 }); wordsIn(w2, lt, 1.06, Math.min(0.9, d - 1.6), { dy: 30 });
      const sk = pr(lt, 0.9, 1.3); tf(streak, { x: sk * 1900, o: sk > 0 && sk < 1 ? 1 : 0 });
      const ex = eio(pr(lt, d - 0.38, d));
      if (ex > 0) {
        if (info.flyToHud) { const hp = c.hudPos(); const tx = hp.x - 540, ty = hp.y - AY; tf(av, { x: tx * ex, y: ty * ex, s: lerp(1, 52 / (2 * R), ex), o: 1 - pr(lt, d - 0.05, d) }); }
        else tf(av, { s: 1 - ex * 0.4, o: 1 - ex, b: ex * 8 });
        [ring, orb, tick, glow].forEach((x) => (x.style.opacity = (1 - ex) * parseFloat(x.style.opacity || 1)));
        [...w1, ...w2].forEach((w) => { w.style.opacity = 1 - ex; w.style.filter = `blur(${ex * 10}px)`; });
      }
    };
  },

  card(e, p, c) {
    const { CC, assetUrl, S } = c;
    const pe = mk(e, 'div', 'persp');
    const pl = p.image ? mk(pe, 'div', 'plane', { width: '1900px', top: CC + 'px' }, `<img src="${esc(assetUrl(p.image))}" style="filter:brightness(${S.dark ? 0.7 : 1})">`) : null;
    mk(e, 'div', 'ab', { inset: 0, background: 'linear-gradient(to bottom,rgba(var(--sr),.5),rgba(var(--sr),.25) 40%,rgba(var(--sr),.7))' });
    const pe2 = mk(e, 'div', 'persp');
    const cd = mk(pe2, 'div', 'card ab', { left: '60px', width: '960px', top: CC - 330 + 'px', padding: '38px 40px 34px', boxShadow: S.card.style === 'heavy' ? '' : '0 40px 120px rgba(0,0,0,.35)' });
    mk(cd, 'div', '', { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }, `<span class="lbl" style="font-size:18px">${esc(p.kicker || '')}</span><span style="flex:1"></span>${p.tag ? `<span class="pill warn">${esc(p.tag)}</span>` : ''}`);
    const title = p.title || ''; const tfs = title.length > 70 ? 40 : 46;
    const ti = mk(cd, 'div', 'dsp2', { fontSize: tfs + 'px', minHeight: tfs * 2.3 + 'px', paddingRight: p.gauge ? '150px' : '0' });
    const tt = mk(ti, 'span'); const car = mk(ti, 'span', '', { display: 'inline-block', width: '4px', height: tfs - 2 + 'px', background: 'var(--a)', marginLeft: '4px', verticalAlign: '-6px' });
    const prow = mk(cd, 'div', '', { display: 'flex', gap: '12px', margin: '20px 0 18px', flexWrap: 'wrap' });
    const pills = (p.pills || []).slice(0, 4).map((x) => mk(prow, 'span', pillTone(x.tone), null, esc(x.label)));
    const parts = [];
    if (p.body) parts.push(mk(cd, 'div', '', { fontSize: '25px', lineHeight: 1.42, opacity: 0.8, marginBottom: '18px' }, esc(p.body)));
    if (p.note) parts.push(mk(cd, 'div', '', { display: 'flex', gap: '14px', alignItems: 'flex-start', background: 'rgba(var(--ir),.05)', borderRadius: '14px', padding: '18px 20px', fontSize: '22px', lineHeight: 1.4, marginBottom: '20px' }, `<span style="color:var(--a);font-size:26px;line-height:1">✦</span><span style="opacity:.85">${esc(p.note)}</span>`));
    if (p.meta && p.meta.length) parts.push(mk(cd, 'div', '', { display: 'flex', gap: '38px', flexWrap: 'wrap' }, p.meta.slice(0, 3).map((m) => `<div><div class="lbl" style="font-size:15px">${esc(m.label)}</div><div style="font-size:22px;font-weight:600;margin-top:6px">${esc(m.value)}</div></div>`).join('')));
    let g = null, arc = null, gn = null, ticks = [];
    if (p.gauge) {
      const max = Number(p.gauge.max) || 10;
      g = mk(pe2, 'div', 'ab', { left: 1020 - 210 + 'px', top: CC - 330 - 60 + 'px', width: '230px', height: '230px' });
      const tk = Array.from({ length: 10 }, (_, i) => { const a = ((-90 + i * 36 + 18) * Math.PI) / 180; return `<line class="tk" x1="${115 + Math.cos(a) * 96}" y1="${115 + Math.sin(a) * 96}" x2="${115 + Math.cos(a) * 108}" y2="${115 + Math.sin(a) * 108}" stroke="${S.palette.ink}" stroke-width="4" stroke-linecap="round" stroke-opacity=".2"/>`; }).join('');
      g.innerHTML = `<svg width="230" height="230"><circle cx="115" cy="115" r="86" fill="${S.palette.card}" stroke="${S.palette.line}" stroke-width="2"/>${tk}<circle class="arc" cx="115" cy="115" r="78" fill="none" stroke="${S.palette.accent}" stroke-width="10" stroke-linecap="round" stroke-dasharray="0 999" transform="rotate(-90 115 115)"/></svg><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="dsp gn" style="font-size:84px;line-height:.9;text-transform:none">0</div><div class="mono" style="font-size:17px;color:var(--mu);margin-top:6px">/ ${esc(max)} ${esc(p.gauge.label || '')}</div></div>`;
      arc = g.querySelector('.arc'); gn = g.querySelector('.gn'); ticks = [...g.querySelectorAll('.tk')];
    }
    const cps = Math.max(55, title.length / 0.85);
    return (lt, d) => {
      if (pl) { const ip = eo(pr(lt, 0, 0.55)); tf(pl, { x: -950 + (1 - ip) * 900, y: -560 - lt * 30, ry: -24, rx: 10, s: 0.95 + lt * 0.02, o: (S.dark ? 0.42 : 0.3) * ip, b: (1 - ip) * 16 + 2.5 }); }
      const cp = EASE(pr(lt, 0.25, 0.75)); tf(cd, { z: (1 - cp) * -500, ry: (1 - cp) * -18, o: cl(cp) });
      typed(tt, title, lt, 0.5, cps, car);
      const tEnd = 0.5 + title.length / cps;
      pills.forEach((x, i) => { const q = EASE(pr(lt, tEnd + i * 0.12, tEnd + 0.25 + i * 0.12)); tf(x, { s: lerp(0.6, 1, q), o: cl(q) }); });
      parts.forEach((x, i) => { const q = eo(pr(lt, tEnd + 0.15 + i * 0.22, tEnd + 0.5 + i * 0.22)); tf(x, { y: (1 - q) * 20, o: q }); });
      if (g) { const gp = EASE(pr(lt, 0.6, 1.0)); tf(g, { s: lerp(0.4, 1, gp), o: cl(gp), rz: (1 - gp) * -40 }); const max = Number(p.gauge.max) || 10; const sv = eio(pr(lt, 0.85, 1.75)) * (Number(p.gauge.value) || 0);
        arc.setAttribute('stroke-dasharray', `${(sv / max) * 2 * Math.PI * 78} 999`); gn.textContent = Number.isInteger(+p.gauge.value) ? Math.round(sv) : sv.toFixed(1); ticks.forEach((k, i) => k.setAttribute('stroke-opacity', i < Math.round((sv / max) * 10) ? 1 : 0.2)); }
      const ex = eio(pr(lt, d - 0.3, d)); if (ex > 0) { tf(cd, { ry: ex * -80, x: ex * -200, o: 1 - ex }); if (g) tf(g, { s: 1 - ex, o: 1 - ex }); }
    };
  },

  wall(e, p, c) {
    const { CC, S } = c;
    const pe = mk(e, 'div', 'persp');
    const wall = mk(pe, 'div', 'plane', { width: '1500px', height: '2400px', boxShadow: 'none', overflow: 'visible', top: CC + 'px' });
    const items = (p.items || []).slice(0, 9);
    const lanes = [0, 1, 2].map((li) => { const l = mk(wall, 'div', 'ab', { left: li * 500 + 20 + 'px', top: 0, width: '460px' });
      items.filter((_, i) => i % 3 === li).forEach((it) => mk(l, 'div', 'card', { padding: '26px 26px 22px', marginBottom: '26px' },
        `${it.tag ? `<span class="pill warn" style="height:36px;font-size:17px">${esc(it.tag)}</span>` : ''}<div style="font-weight:650;font-size:29px;line-height:1.25;margin:16px 0 18px">${esc(it.title)}</div><div style="display:flex;justify-content:space-between;color:var(--mu);font-size:19px"><span>${esc(it.meta || '')}</span><span>${esc(it.status || '')}</span></div>`)); return l; });
    const lab = mk(e, 'div', 'ab lbl', { left: 0, right: 0, textAlign: 'center', top: CC - 300 + 'px', fontSize: '21px', color: 'var(--cr)' }, esc(p.kicker || ''));
    const f = p.featured || items[0] || { title: '' }; const ffs = Math.round(((f.title || '').length > 48 ? 56 : 72) * (S.display.scale || 1));
    const kc = mk(e, 'div', 'card ab', { left: '110px', width: '860px', top: CC - 220 + 'px', padding: '36px 38px', border: '2px solid var(--a)', boxShadow: '0 0 0 8px rgba(var(--ar),.12),0 50px 140px rgba(0,0,0,.4)' },
      `<div style="display:flex;align-items:center;gap:14px">${f.tag ? `<span class="pill warn">${esc(f.tag)}</span>` : ''}<span style="flex:1"></span><span class="mono" style="font-size:17px;color:var(--mu)">${esc(f.meta || '')}</span></div><div class="dsp" style="font-size:${ffs}px;margin-top:24px">${esc(f.title)}</div>`);
    const stamp = mk(e, 'div', 'ab', { left: 110 + 860 - 70 + 'px', top: CC - 220 - 50 + 'px', width: '120px', height: '120px', borderRadius: S.card.radius <= 4 ? '0' : '50%', background: 'var(--a)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 40px rgba(var(--ar),.6)' },
      `<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="${S.accentInk}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`);
    const burst = mk(e, 'div', 'ab', { left: 110 + 860 - 10 + 'px', top: CC - 220 + 10 + 'px', width: 0, height: 0 });
    const bs = Array.from({ length: 10 }, () => mk(burst, 'div', 'ab', { left: '-3px', top: '-14px', width: '6px', height: '28px', borderRadius: '3px', background: 'var(--a)', transformOrigin: '3px 14px' }));
    return (lt, d) => {
      const ip = eo(pr(lt, 0, 0.4)); tf(wall, { x: -750, y: -1200, rx: 24, ry: -26, rz: 6, s: lerp(1.3, 0.92, ip) + lt * 0.02, o: ip * (1 - 0.55 * eo(pr(lt, 0.4, 0.8))), b: (1 - ip) * 10 });
      lanes.forEach((l, i) => tf(l, { y: (i % 2 ? -1 : 1) * lt * 90 + (i === 1 ? -220 : 120) }));
      tf(lab, { o: eo(pr(lt, 0.3, 0.6)) });
      const kp = eo5(pr(lt, 0.3, 0.8)); tf(kc, { s: lerp(0.55, 1, kp), o: kp, y: (1 - kp) * 80, b: (1 - kp) * 12 });
      const sp = pr(lt, 0.95, 1.25); tf(stamp, { s: sp > 0 ? lerp(2.2, 1, eo5(sp)) : 0, o: sp > 0 ? 1 : 0, rz: lerp(-40, 0, eo(sp)) });
      const bp = pr(lt, 1.05, 1.5); bs.forEach((b, i) => { b.style.transform = `rotate(${i * 36}deg) translateY(${-80 - eo(bp) * 70}px) scaleY(${1 - bp})`; b.style.opacity = bp > 0 && bp < 1 ? 1 : 0; });
      const ex = eio(pr(lt, d - 0.27, d)); if (ex > 0) { tf(kc, { s: 1 + ex * 1.6, o: 1 - ex, b: ex * 16 }); tf(stamp, { s: 1 + ex, o: 1 - ex }); tf(lab, { o: 1 - ex }); wall.style.opacity = (1 - ex) * 0.45; }
    };
  },

  selector(e, p, c) {
    const { CC, S } = c;
    const hasList = p.list && p.list.length;
    const vp = mk(e, 'div', 'card ab', { left: '60px', width: '960px', top: CC - (hasList ? 410 : 220) + 'px', padding: '34px 38px 30px' });
    if (p.title) mk(vp, 'div', 'dsp2', { fontSize: '34px' }, esc(p.title));
    mk(vp, 'div', 'lbl', { fontSize: '17px', margin: '22px 0 14px' }, esc(p.groupLabel || ''));
    const row = mk(vp, 'div', '', { position: 'relative', display: 'flex', gap: '14px', flexWrap: 'nowrap' });
    const hl = mk(row, 'div', 'ab', { top: 0, height: '64px', borderRadius: '999px', border: '2px solid var(--a)', background: 'rgba(var(--ar),.13)' });
    const opts = (p.options || []).slice(0, 4); const sel = cl(Number(p.selected ?? opts.length - 1), 0, Math.max(0, opts.length - 1));
    const pills = opts.map((o) => mk(row, 'div', '', { position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', height: '64px', padding: '0 24px 0 12px', borderRadius: '999px', border: '1px solid var(--ln)', fontSize: opts.length > 3 ? '21px' : '25px', fontWeight: 600, whiteSpace: 'nowrap' },
      `<span class="ic" style="width:40px;height:40px;border-radius:50%;background:rgba(var(--ir),.1);display:flex;align-items:center;justify-content:center;font-size:19px">${esc(String(o).slice(0, 1).toUpperCase())}</span><span class="tx">${esc(o)}</span>`));
    const note = mk(vp, 'div', '', { fontSize: '22px', color: 'var(--mu)', marginTop: '16px' }, esc(p.note || ''));
    const checks = (p.checks || []).slice(0, 6); let cnt = null;
    if (checks.length) { const cl_ = mk(vp, 'div', 'lbl', { fontSize: '17px', margin: '26px 0 14px' }, `${esc(p.checksLabel || '')} <span class="cnt"></span>`); cnt = cl_.querySelector('.cnt'); }
    const chw = mk(vp, 'div', '', { display: 'flex', flexWrap: 'wrap', gap: '12px' });
    const ch = checks.map((x) => ({ on: !!x.on, e: mk(chw, 'div', '', { display: 'flex', alignItems: 'center', gap: '10px', height: '54px', padding: '0 20px 0 14px', borderRadius: '999px', border: '1px solid var(--ln)', fontSize: '22px', fontWeight: 600, color: x.on ? 'var(--cr)' : 'var(--mu)' },
      `<span class="bx" style="width:26px;height:26px;border-radius:6px;border:2px solid ${x.on ? 'var(--a)' : 'rgba(var(--ir),.3)'};display:flex;align-items:center;justify-content:center"></span>${esc(x.label)}`) }));
    let op = null, rows = [];
    if (hasList) {
      op = mk(e, 'div', 'card ab', { left: '60px', width: '960px', top: CC + 40 + 'px', padding: '30px 38px' });
      mk(op, 'div', '', { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }, `<span class="lbl" style="font-size:17px">${esc(p.listTitle || '')}</span><span style="flex:1"></span><span style="font-size:20px;color:var(--mu)">${esc(p.listMeta || '')}</span>`);
      rows = p.list.slice(0, 6).map((r, i) => mk(op, 'div', '', { display: 'flex', alignItems: 'baseline', gap: '18px', padding: '9px 0', fontSize: '25px' }, `<span class="mono" style="color:var(--a);font-size:21px">${String(i + 1).padStart(2, '0')}</span><span class="clip" style="font-weight:600;flex:1">${esc(r.title)}</span><span style="color:var(--mu);font-size:19px;white-space:nowrap">${esc(r.meta || '')}</span>`));
    }
    return (lt, d) => {
      const a = EASE(pr(lt, 0, 0.4)); tf(vp, { y: (1 - a) * -60, o: cl(a), b: (1 - cl(a)) * 10 });
      if (pills.length) {
        const rects = pills.map((x) => [x.offsetLeft, x.offsetWidth]);
        const tSel = 1.08; const per = sel ? (tSel - 0.55) / sel : 1;
        let k = 0; for (let i = 0; i < sel; i++) k += eio(pr(lt, 0.55 + i * per, 0.55 + i * per + per * 0.6));
        const i0 = Math.min(Math.floor(k), Math.max(0, pills.length - 1)), f = k - i0, i1 = Math.min(pills.length - 1, i0 + 1);
        hl.style.left = lerp(rects[i0][0], rects[i1][0], f) + 'px'; hl.style.width = lerp(rects[i0][1], rects[i1][1], f) + 'px'; tf(hl, { o: eo(pr(lt, 0.2, 0.4)) });
        pills.forEach((x, i) => { const on = i === sel && lt > tSel; x.querySelector('.tx').style.color = on ? 'var(--a)' : ''; const ic = x.querySelector('.ic'); ic.style.background = on ? 'var(--a)' : 'rgba(var(--ir),.1)'; ic.style.color = on ? 'var(--ai)' : ''; });
      }
      tf(note, { o: eo(pr(lt, 1.1, 1.4)) });
      let n = 0;
      ch.forEach((x, i) => { const t0 = 1.3 + i * 0.08; tf(x.e, { o: eo(pr(lt, t0 - 0.2, t0)), y: (1 - eo(pr(lt, t0 - 0.2, t0))) * 12 }); if (x.on) { const q = pr(lt, 1.45 + i * 0.18, 1.6 + i * 0.18); const bx = x.e.querySelector('.bx');
        bx.style.background = q > 0 ? 'var(--a)' : 'transparent'; bx.innerHTML = q > 0 ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${S.accentInk}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="transform:scale(${eo5(q)})"><path d="M20 6 9 17l-5-5"/></svg>` : ''; if (q > 0) n++; x.e.style.borderColor = q > 0 ? 'rgba(var(--ar),.6)' : ''; } });
      if (cnt) cnt.textContent = p.checksTotal ? `· ${n} of ${p.checksTotal} selected` : '';
      if (op) { const b = eo(pr(lt, 1.5, 1.9)); tf(op, { y: (1 - b) * 80, o: b, b: (1 - b) * 10 }); const span = Math.max(0.6, d - 2.4); rows.forEach((r, i) => { const q = eo(pr(lt, 1.75 + (i * span) / rows.length, 2.05 + (i * span) / rows.length)); tf(r, { x: (1 - q) * -40, o: q }); }); }
      const ex = eio(pr(lt, d - 0.27, d)); if (ex > 0) { tf(vp, { y: -ex * 120, o: 1 - ex, b: ex * 8 }); if (op) tf(op, { y: -ex * 60, s: 1 + ex * 0.1, o: 1 - ex, b: ex * 8 }); }
    };
  },

  document(e, p, c) {
    const { CC, assetUrl, S } = c;
    const pe = mk(e, 'div', 'persp');
    const pl = p.image ? mk(pe, 'div', 'plane', { width: '1900px', top: CC + 'px' }, `<img src="${esc(assetUrl(p.image))}" style="filter:brightness(${S.dark ? 0.7 : 1})">`) : null;
    mk(e, 'div', 'ab', { inset: 0, background: 'rgba(var(--sr),.55)' });
    const dc = mk(e, 'div', 'card ab', { left: '60px', width: '960px', top: CC - 420 + 'px', padding: '0 0 34px', overflow: 'hidden' });
    const tabs = (p.tabs || []).slice(0, 3);
    if (tabs.length) mk(dc, 'div', '', { display: 'flex', gap: '34px', padding: '0 40px', borderBottom: '1px solid var(--ln)', fontSize: '23px', fontWeight: 600 }, tabs.map((t, i) => (i === 0 ? `<span style="padding:24px 0 20px;color:var(--a);border-bottom:3px solid var(--a)">${esc(t)}</span>` : `<span style="padding:24px 0;color:var(--mu)">${esc(t)}</span>`)).join(''));
    const bd = mk(dc, 'div', '', { padding: '26px 40px 0' });
    const meta = mk(bd, 'div', '', { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '20px', color: 'var(--mu)' }, `<span>${esc(p.meta || '')}</span><span style="flex:1"></span><span class="pill" style="height:40px;font-size:18px">…</span>`);
    const badge = meta.querySelector('.pill');
    const ti = mk(bd, 'div', 'dsp', { fontSize: (p.title || '').length > 70 ? '42px' : '50px', lineHeight: 1.06, margin: '20px 0 26px', textTransform: 'none' }, esc(p.title || ''));
    const lines = (p.lines || []).slice(0, 3);
    const Ls = lines.map((_, i) => { const w = mk(bd, 'div', '', { fontSize: '34px', lineHeight: 1.38, fontWeight: 500, marginTop: i ? '16px' : 0, minHeight: '48px' }); return mk(w, 'span'); });
    const car = mk(bd, 'span', '', { display: 'inline-block', width: '4px', height: '40px', background: 'var(--a)', marginLeft: '3px', verticalAlign: '-7px' });
    let chipEl = null;
    if (p.chip) chipEl = mk(bd, 'div', '', { display: 'inline-flex', alignItems: 'center', gap: '12px', marginTop: '22px', height: '50px', padding: '0 20px 0 8px', borderRadius: '999px', background: 'rgba(var(--ar),.12)', border: '1px solid rgba(var(--ar),.5)', fontSize: '21px', fontWeight: 600, color: 'var(--a)' },
      `<span style="width:34px;height:34px;border-radius:50%;background:var(--a);color:var(--ai);display:flex;align-items:center;justify-content:center;font-size:17px">${esc((p.chip.initial || p.chip.label || '?').slice(0, 1))}</span>${esc(p.chip.label || '')}`);
    const rf = mk(e, 'div', 'ab', { left: '60px', right: '60px', top: CC + 330 + 'px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' });
    if (p.chipsLabel) mk(rf, 'span', 'lbl', { fontSize: '16px', marginRight: '6px' }, esc(p.chipsLabel));
    const rc = (p.chips || []).slice(0, 5).map((t) => mk(rf, 'span', 'chip', { height: '48px', fontSize: '20px' }, esc(t)));
    const total = lines.join('').length;
    const hls = (p.highlights || []).filter(Boolean);
    return (lt, d) => {
      if (pl) tf(pl, { x: -950, y: -640 - lt * 40, ry: 20, rx: 12, s: 0.95, o: S.dark ? 0.5 : 0.3, b: 3 });
      const a = EASE(pr(lt, 0, 0.4)); tf(dc, { y: (1 - a) * 70, o: cl(a), b: (1 - cl(a)) * 10, s: lerp(0.96, 1, a) }); tf(ti, { o: eo(pr(lt, 0.15, 0.45)) });
      const tEnd = Math.max(1.0, d - 0.85); const cps = Math.max(30, total / (tEnd - 0.4));
      let t0 = 0.4; let lastEl = null;
      lines.forEach((ln, i) => { typed(Ls[i], ln, lt, t0, cps); if (lt >= t0) lastEl = Ls[i]; t0 += ln.length / cps + 0.08;
        hls.forEach((h) => { if (Ls[i].textContent.includes(h)) Ls[i].innerHTML = esc(Ls[i].textContent).replace(esc(h), `<span style="color:var(--a);box-shadow:inset 0 -5px 0 rgba(var(--ar),.35)">${esc(h)}</span>`); }); });
      if (lastEl && lastEl.parentNode !== car.parentNode) lastEl.parentNode.appendChild(car);
      car.style.opacity = lt < tEnd || Math.floor(lt * 2.4) % 2 === 0 ? 1 : 0;
      if (chipEl) tf(chipEl, { o: eo(pr(lt, 0.6, 0.9)), x: (1 - eo(pr(lt, 0.6, 0.9))) * -20 });
      const done = lt > tEnd; badge.textContent = done ? p.badgeAfter || 'Done' : p.badgeBefore || 'Writing…'; badge.style.color = done ? '#16A34A' : 'var(--mu)'; badge.style.background = done ? 'rgba(74,222,128,.16)' : 'rgba(var(--ir),.06)';
      tf(rf, { o: eo(pr(lt, 1.6, 1.9)) }); rc.forEach((x, i) => { const q = EASE(pr(lt, 1.7 + i * 0.1, 1.95 + i * 0.1)); tf(x, { y: (1 - q) * 20, o: cl(q) }); });
      const ex = eio(pr(lt, d - 0.27, d)); if (ex > 0) { tf(dc, { s: 1 - ex * 0.15, o: 1 - ex, b: ex * 10 }); tf(rf, { o: 1 - ex }); }
    };
  },

  action(e, p, c) {
    const { CC, assetUrl, S } = c;
    const bw = mk(e, 'div', 'ab', { left: 0, right: 0, top: CC - 330 + 'px', display: 'flex', justifyContent: 'center' });
    const bt = mk(bw, 'div', 'dsp2', { height: '120px', padding: '0 56px', display: 'flex', alignItems: 'center', borderRadius: Math.min(16, S.card.radius) + 'px', background: 'var(--a)', color: 'var(--ai)', fontSize: '52px', boxShadow: '0 20px 60px rgba(var(--ar),.45)', whiteSpace: 'nowrap' },
      `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:14px"><path d="M20 6 9 17l-5-5"/></svg><span class="tx"></span>`);
    const tx = bt.querySelector('.tx');
    const rings = [0, 1].map(() => mk(e, 'div', 'ab', { left: '540px', top: CC - 270 + 'px', width: '300px', height: '300px', marginLeft: '-150px', marginTop: '-150px', borderRadius: '50%', border: '4px solid var(--a)', opacity: 0 }));
    const cur = mk(e, 'div', 'ab', { left: 0, top: 0, width: '56px', height: '56px' }, `<svg width="56" height="56" viewBox="0 0 24 24"><path d="M4 2.5 19.5 12l-6.6 1.6-3.4 6.4z" fill="${S.palette.ink}" stroke="${S.palette.bg}" stroke-width="1.4" stroke-linejoin="round"/></svg>`);
    const lab = mk(e, 'div', 'ab lbl', { left: 0, right: 0, textAlign: 'center', top: CC - 130 + 'px', fontSize: '20px', color: 'var(--cr)' }, esc(p.label || ''));
    const imgs = (p.images || []).slice(0, 3);
    const pe = mk(e, 'div', 'persp');
    const cards = imgs.map((im) => mk(pe, 'div', 'ab', { left: '540px', top: CC + 150 + 'px', width: '470px', marginLeft: '-235px', marginTop: '-202px', borderRadius: Math.min(18, S.card.radius) + 'px', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.45)', background: '#111' }, `<img src="${esc(assetUrl(im))}" style="width:100%;display:block">`));
    const pos = imgs.length === 1 ? [[0, 0, 40, 0]] : imgs.length === 2 ? [[-190, 14, -60, -5], [190, -14, -60, 5]] : [[-345, 18, -140, -7], [0, 0, 40, 0], [345, -18, -140, 7]];
    return (lt, d) => {
      const a = eo5(pr(lt, 0, 0.3)); tf(bw, { s: lerp(0.6, 1, a), o: a, b: (1 - a) * 10 });
      const br = bt.getBoundingClientRect(), fr = e.getBoundingClientRect(), sc = fr.width / 1080 || 1;
      const bx = (br.left - fr.left) / sc + (br.width / sc) * 0.62, by = (br.top - fr.top) / sc + (br.height / sc) * 0.55;
      const cp = eio(pr(lt, 0.15, 0.55)); tf(cur, { x: lerp(bx + 300, bx, cp), y: lerp(by + 260, by, cp), o: pr(lt, 0.1, 0.2) * (1 - pr(lt, 1.0, 1.2)), s: lt > 0.58 && lt < 0.68 ? 0.85 : 1 });
      const click = 0.62; const pr2 = pr(lt, click, click + 0.06) - pr(lt, click + 0.08, click + 0.18); bw.style.transform += ` scale(${1 - 0.06 * pr2})`;
      const ok = lt > click + 0.05; tx.textContent = ok ? p.done || 'Done' : p.button || 'Approve';
      bt.style.background = ok ? '#16A34A' : 'var(--a)'; bt.style.color = ok ? '#fff' : 'var(--ai)'; bt.style.boxShadow = ok ? '0 20px 60px rgba(22,163,74,.45)' : '0 20px 60px rgba(var(--ar),.45)';
      rings.forEach((r, i) => { const q = pr(lt, click + i * 0.12, click + 0.7 + i * 0.12); tf(r, { s: lerp(0.6, 3.2, eo(q)), o: q > 0 && q < 1 ? 1 - q : 0 }); r.style.borderColor = ok ? '#16A34A' : 'var(--a)'; });
      tf(lab, { o: eo(pr(lt, 0.95, 1.25)) });
      cards.forEach((cd, k) => { const [x, ry, z, rz] = pos[k]; const q = eo5(pr(lt, 0.9 + k * 0.12, 1.5 + k * 0.12)); tf(cd, { x: x * q, z: lerp(-1400, z, q), ry: ry * q, rz: rz * q, o: q, y: (1 - q) * -100 }); cd.style.zIndex = k === 1 ? 3 : 1; });
      const ex = eio(pr(lt, d - 0.27, d)); if (ex > 0) { cards.forEach((cd) => { cd.style.opacity = 1 - ex; cd.style.filter = `blur(${ex * 8}px)`; }); tf(bw, { o: 1 - ex }); tf(lab, { o: 1 - ex }); }
    };
  },

  quote(e, p, c) {
    const { CC, S } = c;
    const cd = mk(e, 'div', 'card ab', { left: '60px', width: '960px', top: CC - 300 + 'px', padding: '40px 46px 48px' });
    mk(cd, 'div', '', { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '21px', fontWeight: 600, paddingBottom: '24px', borderBottom: '1px solid var(--ln)', marginBottom: '26px', color: 'var(--mu)' },
      `<span style="width:12px;height:12px;border-radius:50%;background:var(--a)"></span><span>${esc(p.context || '')}</span>`);
    if (p.before) mk(cd, 'div', '', { fontSize: '24px', color: 'var(--mu)', opacity: 0.7, marginBottom: '26px', lineHeight: 1.35 }, `<span class="mono" style="margin-right:10px">${esc(p.before.time || '')}</span>${esc(p.before.speaker || '')}<br>${esc(p.before.text || '')}`);
    mk(cd, 'div', '', { fontSize: '21px', color: 'var(--mu)', fontWeight: 600, marginBottom: '14px' }, `<span class="mono" style="margin-right:10px">${esc(p.time || '')}</span>${esc(p.speaker || '')}`);
    const q = String(p.quote || ''); const fs = q.length > 140 ? 44 : q.length > 90 ? 52 : 60;
    const qe = mk(cd, 'div', 'dsp2', { fontSize: Math.round(fs * (S.fonts.display === 'Anton' ? 1.1 : 1)) + 'px', lineHeight: 1.2, textTransform: 'none' });
    const ws = q.split(' ').map((w, i, a) => { const s = mk(qe, 'span', '', { position: 'relative', display: 'inline-block' }); const h = mk(s, 'span', '', { position: 'absolute', left: '-.1em', right: i === a.length - 1 ? '-.1em' : '-.32em', top: '.1em', bottom: '.02em', background: 'rgba(var(--ar),.2)', borderBottom: '5px solid var(--a)', transformOrigin: '0 50%', transform: 'scaleX(0)' }); mk(s, 'span', '', { position: 'relative' }, esc(w)); qe.appendChild(document.createTextNode(i < a.length - 1 ? ' ' : '')); return { s, h }; });
    return (lt, d) => {
      const a = eo(pr(lt, 0, 0.45)); tf(cd, { y: lerp(30, 0, a), o: a });
      const tEnd = Math.min(d - 1.4, 2.6); const n = ws.length; const sw0 = Math.min(d - 1.2, tEnd + 0.2);
      ws.forEach((w, i) => { const tin = 0.35 + ((tEnd - 0.35) * i) / n; const op = eo(pr(lt, tin, tin + 0.14)); tf(w.s, { y: lerp(14, 0, op), o: op });
        const swt = sw0 + (0.6 * i) / n; w.h.style.transform = `scaleX(${eo(pr(lt, swt, swt + 0.16))})`; });
      const ex = eio(pr(lt, d - 0.27, d)); if (ex > 0) tf(cd, { s: 1 - 0.05 * ex, o: 1 - ex, b: ex * 8 });
    };
  },

  screen(e, p, c) {
    const { CC, assetUrl, S } = c;
    const fw = 960, a = p.aspect || 0.62; const fh = Math.round(fw * a);
    const lab = mk(e, 'div', 'ab lbl', { left: 0, right: 0, textAlign: 'center', top: CC - fh / 2 - 120 + 'px', fontSize: '21px', color: 'var(--cr)' }, esc(p.kicker || ''));
    const tt = mk(e, 'div', 'ab dsp', { left: '40px', right: '40px', textAlign: 'center', top: CC - fh / 2 - 84 + 'px', fontSize: Math.round(50 * (S.display.scale || 1)) + 'px', lineHeight: 1.05 }, esc(p.title || ''));
    const pe = mk(e, 'div', 'persp');
    const fr = mk(pe, 'div', 'ab', { left: (1080 - fw) / 2 + 'px', top: CC - fh / 2 + 'px', width: fw + 'px', height: fh + 'px', borderRadius: Math.min(18, S.card.radius + 4) + 'px', overflow: 'hidden', border: S.card.style === 'heavy' ? '4px solid var(--cr)' : '1px solid var(--ln)', boxShadow: S.card.style === 'heavy' ? '12px 12px 0 var(--cr)' : '0 40px 120px rgba(0,0,0,.45)', background: '#000' });
    const im = mk(fr, 'img', '', { position: 'absolute', left: 0, top: 0, width: fw + 'px', transformOrigin: '0 0' }); im.src = assetUrl(p.image);
    const f = p.focus || null;
    const spot = mk(fr, 'div', 'ab', { borderRadius: '10px', boxShadow: '0 0 0 9999px rgba(0,0,0,.55)', border: '3px solid var(--a)', opacity: 0 });
    const call = mk(e, 'div', 'ab', { left: '90px', right: '90px', top: CC + fh / 2 + 34 + 'px', display: 'flex', justifyContent: 'center' }, `<span class="chip" style="border-color:rgba(var(--ar),.6)"><span style="width:10px;height:10px;border-radius:50%;background:var(--a)"></span>${esc(p.callout || '')}</span>`);
    return (lt, d) => {
      const ip = EASE(pr(lt, 0, 0.6)); tf(fr, { ry: (1 - ip) * -28, rx: (1 - ip) * 12, z: (1 - ip) * -400, o: cl(ip) });
      tf(lab, { o: eo(pr(lt, 0.2, 0.5)) }); tf(tt, { o: eo(pr(lt, 0.3, 0.6)), y: (1 - eo(pr(lt, 0.3, 0.6))) * 20 });
      const ih = fw * (im.naturalHeight / (im.naturalWidth || 1) || a);
      if (f) {
        const z = eio(pr(lt, 0.9, 1.6)); const zoom = Math.min(3, 0.9 / Math.max(f.w, (f.h * ih) / fw)); const s = lerp(1, Math.max(1, zoom), z);
        const cx = (f.x + f.w / 2) * fw, cy = (f.y + f.h / 2) * ih; const tx = lerp(0, fw / 2 - cx * s, z), ty = lerp(Math.min(0, (fh - ih) / 2), fh / 2 - cy * s, z);
        im.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
        Object.assign(spot.style, { left: tx + f.x * fw * s - 8 + 'px', top: ty + f.y * ih * s - 8 + 'px', width: f.w * fw * s + 16 + 'px', height: f.h * ih * s + 16 + 'px' });
        spot.style.opacity = eo(pr(lt, 1.35, 1.6));
      } else { const pan = lerp(0, Math.min(0, fh - ih), eio(pr(lt, 0.6, d - 0.4))); im.style.transform = `translate(0,${pan}px)`; }
      tf(call, { o: eo(pr(lt, 1.4, 1.7)), y: (1 - eo(pr(lt, 1.4, 1.7))) * 16 });
      const ex = eio(pr(lt, d - 0.27, d)); if (ex > 0) { tf(fr, { s: 1 + ex * 0.15, o: 1 - ex, b: ex * 10 }); tf(call, { o: 1 - ex }); tf(tt, { o: 1 - ex }); tf(lab, { o: 1 - ex }); }
    };
  },

  // ── new scene types ──
  kinetic(e, p, c) {
    const { CC, S, H } = c;
    const phrases = ((p.words && p.words.length && p.words) || (p.phrases && p.phrases.length && p.phrases) || (p.lines && p.lines.length && p.lines) || String(p.text || '').split(/(?<=[.!?])\s+/)).slice(0, 7).map((x) => String(x).trim()).filter(Boolean);
    const panel = mk(e, 'div', 'ab', { left: '-40px', right: '-40px', top: '-40px', bottom: '-40px', background: 'var(--a)', opacity: 0 });
    const els = phrases.map((ph) => {
      const words_ = ph.split(' '); const longest = Math.max(...words_.map((w) => w.length));
      const lines = []; for (const w of words_) { const l = lines[lines.length - 1]; if (l && (l + ' ' + w).length <= Math.max(8, longest)) lines[lines.length - 1] = l + ' ' + w; else lines.push(w); }
      const maxLen = Math.max(...lines.map((l) => l.length));
      const kind = S.fonts.display; const cw = kind === 'Anton' ? 0.42 : kind === 'VT323' ? 0.5 : kind === 'Archivo Black' ? 0.68 : kind === 'Unbounded' ? 0.72 : 0.58;
      const fs = Math.round(cl(940 / (maxLen * cw), 90, Math.min(360, (H * 0.5) / lines.length)));
      const el = mk(e, 'div', 'ab dsp', { left: '50px', right: '50px', textAlign: S.display.align === 'left' ? 'left' : 'center', fontSize: fs + 'px', lineHeight: 0.92, top: CC - (lines.length * fs * 0.92) / 2 + 'px', opacity: 0 }, lines.map(esc).join('<br>'));
      return el;
    });
    return (lt, d) => {
      const n = els.length || 1; const span = (d - 0.25) / n;
      els.forEach((el, k) => {
        const a = 0.05 + k * span, b = a + span;
        const on = lt >= a && (lt < b || k === n - 1);
        const p_ = pr(lt, a, a + 0.14);
        el.style.opacity = on ? 1 : 0;
        const flip = k % 2 === 1;
        el.style.color = flip ? 'var(--ai)' : k === n - 1 ? 'var(--a)' : 'var(--cr)';
        if (on) { el.style.transform = `scale(${lerp(1.45, 1, eo5(p_))}) rotate(${(1 - eo5(p_)) * (k % 2 ? -4 : 4)}deg)`; el.style.filter = p_ < 1 ? `blur(${(1 - p_) * 14}px)` : 'none'; }
        if (on) panel.style.opacity = flip ? 1 : 0;
      });
      const ex = eio(pr(lt, d - 0.2, d)); if (ex > 0) tf(e, { s: 1 + ex * 0.3, o: 1 - ex });
    };
  },

  split(e, p, c) {
    const { CC, TALL, assetUrl, S } = c;
    const ih = TALL ? 640 : 520; const top = CC - (TALL ? 560 : 470);
    const fr = mk(e, 'div', 'ab', { left: '60px', right: '60px', top: top + 'px', height: ih + 'px', overflow: 'hidden', borderRadius: Math.min(20, S.card.radius) + 'px', background: '#000', border: S.card.style === 'heavy' ? '4px solid var(--cr)' : '0' });
    const im = mk(fr, 'img', '', { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 0%' }); im.src = assetUrl(p.image);
    const tag = mk(e, 'div', 'ab', { left: '60px', top: top + ih - 2 + 'px', height: '10px', width: '0px', background: 'var(--a)' });
    const al = S.display.align;
    const kick = mk(e, 'div', 'ab lbl', { left: '70px', right: '70px', top: top + ih + 46 + 'px', fontSize: '20px', textAlign: al }, esc(p.kicker || ''));
    const title = String(p.title || ''); const fs = fit(title.length, 74, 50, 1.2, 20);
    const tt = mk(e, 'div', 'ab dsp', { left: '70px', right: '70px', top: top + ih + 88 + 'px', fontSize: Math.round(fs * (S.display.scale || 1)) + 'px', textAlign: al }); const tw = words(tt, title);
    if (S.display.italicAccent && tw.length) tw[tw.length - 1].classList.add('it', 'acc');
    const body = mk(e, 'div', 'ab', { left: '70px', right: '70px', top: top + ih + 100 + fs * (title.length > 26 ? 2.1 : 1.1) + 'px', fontSize: '28px', lineHeight: 1.4, color: 'var(--mu)', textAlign: al }, esc(p.body || ''));
    return (lt, d) => {
      const r = eo5(pr(lt, 0, 0.55)); fr.style.clipPath = `inset(0 ${(1 - r) * 100}% 0 0)`;
      im.style.transform = `scale(${1.12 - lt * 0.025}) translateY(${-lt * 6}px)`;
      tag.style.width = eo(pr(lt, 0.3, 0.8)) * 260 + 'px';
      tf(kick, { o: eo(pr(lt, 0.35, 0.6)) }); wordsIn(tw, lt, 0.45, 0.5, { dy: 40 });
      const b = eo(pr(lt, 0.9, 1.3)); tf(body, { o: b, y: (1 - b) * 16 });
      const ex = eio(pr(lt, d - 0.27, d)); if (ex > 0) tf(e, { o: 1 - ex, y: -ex * 40 });
    };
  },

  list(e, p, c) {
    const { CC, S } = c;
    const items = (p.items || []).slice(0, 5); const al = S.display.align === 'left' ? 'left' : 'left';
    const tfs = fit(String(p.title || '').length, 72, 48, 1.2, 18);
    const blockH = 110 + items.length * 120;
    const top = CC - blockH / 2 - 40;
    const kick = mk(e, 'div', 'ab lbl', { left: '80px', right: '80px', top: top + 'px', fontSize: '20px' }, esc(p.kicker || ''));
    const tt = mk(e, 'div', 'ab dsp', { left: '80px', right: '80px', top: top + 40 + 'px', fontSize: tfs + 'px', textAlign: al }); const tw = words(tt, p.title || '');
    const marker = p.marker || 'number';
    const rows = items.map((it, i) => mk(e, 'div', 'ab', { left: '80px', right: '80px', top: top + 70 + tfs * (String(p.title || '').length > 22 ? 2.1 : 1.1) + 20 + i * 120 + 'px', display: 'flex', alignItems: 'center', gap: '26px', borderTop: '1px solid var(--ln)', paddingTop: '22px' },
      `<span class="mk" style="flex:none;width:64px;height:64px;border-radius:${S.card.radius > 10 ? '50%' : '6px'};background:var(--a);color:var(--ai);display:flex;align-items:center;justify-content:center;font-family:var(--fm);font-size:26px;font-weight:600">${marker === 'check' ? '✓' : marker === 'dot' ? '●' : String(i + 1).padStart(2, '0')}</span><div style="min-width:0"><div class="dsp2" style="font-size:38px">${esc(it.title || it)}</div>${it.meta ? `<div style="font-size:22px;color:var(--mu);margin-top:4px">${esc(it.meta)}</div>` : ''}</div>`));
    return (lt, d) => {
      tf(kick, { o: eo(pr(lt, 0, 0.3)) }); wordsIn(tw, lt, 0.1, 0.4, { dy: 36 });
      const span = Math.max(0.8, d - 1.5);
      rows.forEach((r, i) => { const a = 0.7 + (i * span) / Math.max(1, rows.length); const q = EASE(pr(lt, a, a + 0.35)); tf(r, { x: (1 - q) * -80, o: cl(q) }); const mkr = r.querySelector('.mk'); mkr.style.transform = `scale(${lerp(0.3, 1, eo5(pr(lt, a, a + 0.3)))}) rotate(${(1 - eo(pr(lt, a, a + 0.3))) * -90}deg)`; });
      const ex = eio(pr(lt, d - 0.27, d)); if (ex > 0) tf(e, { o: 1 - ex, s: 1 - ex * 0.05 });
    };
  },

  compare(e, p, c) {
    const { CC, S } = c;
    const side = (v, lbl, def) => (Array.isArray(v) ? { label: lbl || def, items: v } : v && typeof v === 'object' ? { label: v.label || lbl || def, items: v.items || [] } : null);
    const L_ = side(p.left, p.beforeLabel, 'Before') || side(p.before, p.beforeLabel, 'Before') || { label: 'Before', items: [] }, R_ = side(p.right, p.afterLabel, 'After') || side(p.after, p.afterLabel, 'After') || { label: 'After', items: [] };
    const top = CC - 300;
    const kick = mk(e, 'div', 'ab lbl', { left: 0, right: 0, textAlign: 'center', top: top - 70 + 'px', fontSize: '20px' }, esc(p.kicker || ''));
    const col = (x, side, data, good) => {
      const cd = mk(e, 'div', 'card ab', { left: x + 'px', width: '460px', top: top + 'px', padding: '30px 30px 34px', minHeight: '560px', border: good ? '2px solid var(--a)' : '' });
      mk(cd, 'div', 'dsp', { fontSize: '44px', marginBottom: '22px', color: good ? 'var(--a)' : 'var(--mu)' }, esc(data.label || ''));
      const its = (data.items || []).slice(0, 4).map((it) => mk(cd, 'div', '', { display: 'flex', gap: '14px', alignItems: 'flex-start', fontSize: '26px', lineHeight: 1.3, padding: '14px 0', borderTop: '1px solid var(--ln)', position: 'relative' },
        `<span style="flex:none;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;${good ? 'background:var(--a);color:var(--ai)' : 'border:2px solid rgba(var(--ir),.3);color:var(--mu)'}">${good ? '✓' : '×'}</span><span class="tx" style="position:relative">${esc(it)}<span class="st" style="position:absolute;left:0;top:52%;height:3px;width:0;background:var(--mu)"></span></span>`));
      return { cd, its };
    };
    const A = col(60, 'l', L_, false), B = col(560, 'r', R_, true);
    return (lt, d) => {
      tf(kick, { o: eo(pr(lt, 0, 0.3)) });
      const a = EASE(pr(lt, 0.05, 0.45)); tf(A.cd, { x: (1 - a) * -120, o: cl(a) });
      A.its.forEach((it, i) => { tf(it, { o: eo(pr(lt, 0.2 + i * 0.1, 0.45 + i * 0.1)) }); it.querySelector('.st').style.width = eo(pr(lt, 1.0 + i * 0.12, 1.3 + i * 0.12)) * 100 + '%'; });
      A.cd.style.opacity = cl(a) * (1 - 0.45 * pr(lt, 1.2, 1.7));
      const b = EASE(pr(lt, 1.3, 1.7)); tf(B.cd, { x: (1 - b) * 120, o: cl(b), s: lerp(0.94, 1, b) });
      B.its.forEach((it, i) => { const q = EASE(pr(lt, 1.6 + i * 0.14, 1.9 + i * 0.14)); tf(it, { o: cl(q), x: (1 - q) * 30 }); });
      const ex = eio(pr(lt, d - 0.27, d)); if (ex > 0) tf(e, { o: 1 - ex });
    };
  },

  end(e, p, c) {
    const { CC, assetUrl, S } = c;
    mk(e, 'div', 'ab', { left: '-200px', right: '-200px', top: CC - 700 + 'px', height: '1100px', background: 'radial-gradient(ellipse at 50% 40%,rgba(var(--ar),.32),rgba(var(--ar),0) 60%)' });
    const img = p.image ? assetUrl(p.image) : '';
    const sq = p.shape === 'square' || p.logo || S.card.radius <= 6;
    const av = mk(e, 'div', 'ab', { left: '405px', top: CC - 470 + 'px', width: '270px', height: '270px', borderRadius: sq ? (p.logo ? '48px' : S.card.radius * 2 + 'px') : '50%', overflow: 'hidden', border: '5px solid var(--a)', background: img ? (p.logo ? '#fff' : '#000') : 'var(--a)', display: img || p.wordmark ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', padding: p.logo ? '5%' : '0' },
      img ? `<img src="${esc(img)}" style="width:100%;height:100%;object-fit:${p.logo ? 'contain' : p.fit || 'cover'};object-position:50% ${p.logo ? '50%' : '12%'}">` : `<span class="dsp" style="font-size:150px;color:var(--ai)">${esc((p.wordmark || '?').slice(0, 1))}</span>`);
    const wmText = p.wordmark || ''; const wfs = Math.round((wmText.length > 14 ? 100 : 138) * (S.display.scale || 1));
    const wm = mk(e, 'div', 'ab dsp', { left: '20px', right: '20px', textAlign: 'center', top: CC - 160 + 'px', fontSize: wfs + 'px' }); const ww = words(wm, wmText);
    const tl = mk(e, 'div', 'ab dsp2', { left: '60px', right: '60px', textAlign: 'center', top: CC + 10 + 'px', fontSize: (p.tagline || '').length > 36 ? '42px' : '52px', opacity: 0.92, textTransform: 'none' }); const tw = words(tl, p.tagline || '');
    if (S.display.italicAccent && tw.length) tw.forEach((w) => w.classList.add('it'));
    const cta = mk(e, 'div', 'ab', { left: 0, right: 0, top: CC + 130 + 'px', display: 'flex', justifyContent: 'center' }, p.cta ? `<span class="dsp2" style="display:inline-flex;align-items:center;height:84px;padding:0 46px;border-radius:${Math.min(14, S.card.radius)}px;background:var(--a);color:var(--ai);font-size:34px;box-shadow:${S.card.style === 'heavy' ? '8px 8px 0 var(--cr)' : '0 20px 60px rgba(var(--ar),.45)'}">${esc(p.cta)}</span>` : '');
    const url = mk(e, 'div', 'ab', { left: 0, right: 0, textAlign: 'center', top: CC + 236 + 'px', fontSize: '24px', fontWeight: 600, color: 'var(--cr)' }, esc(p.url || ''));
    const by = mk(e, 'div', 'ab mono', { left: 0, right: 0, textAlign: 'center', top: CC + (p.url ? 286 : 250) + 'px', fontSize: '19px', color: 'var(--mu)' }, esc(p.byline || ''));
    return (lt) => {
      const a = EASE(pr(lt, 0, 0.5)); tf(av, { s: lerp(0.3, 1, a), o: cl(a), y: (1 - a) * -80 });
      wordsIn(ww, lt, 0.12, 0.18, { dy: 60, s0: 1.3, bl: 14 }); wordsIn(tw, lt, 1.05, 0.6, { dy: 30 });
      const k = EASE(pr(lt, 1.5, 1.85)); tf(cta, { s: lerp(0.7, 1, k), o: cl(k) }); tf(url, { o: eo(pr(lt, 1.7, 2.0)) }); tf(by, { o: eo(pr(lt, 1.8, 2.2)) });
    };
  },
};

export { SCENE_TYPES };
