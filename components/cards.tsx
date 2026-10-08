'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Ctx } from './useProject';
import { I } from './icons';
import { fileUrl } from './api';
import { SCENE_TYPES } from '@/public/engine/timeline.js';
import { DIRECTIONS } from '@/public/engine/styles.js';
import type { ChatMsg } from '@/lib/types';

type P = { c: any; ctx: Ctx; send: (a: any) => void; busy: boolean; msgId: string; latest: boolean; setPreview: (s: string | null) => void; chat: ChatMsg[] };
export function Card(props: P) {
  switch (props.c.kind) {
    case 'progress': return <Progress {...props} />;
    case 'sources': return <Sources {...props} />;
    case 'facts': return <Facts {...props} />;
    case 'questions': return <Questions {...props} />;
    case 'angles': return <Angles {...props} />;
    case 'directions': return <Directions {...props} />;
    case 'storyboard': return <Story {...props} />;
    case 'render': return <Render {...props} />;
    case 'transcript': return <Transcript {...props} />;
    case 'talkbrief': return <TalkBrief {...props} />;
    case 'edit': return <Edit {...props} />;
    case 'cast': return <CastCard {...props} />;
    case 'error': return <div className="issue error">{props.c.message}</div>;
    default: return null;
  }
}
const isLatestOfKind = (chat: ChatMsg[], msgId: string, kind: string) => { const ms = chat.filter((m) => m.cards.some((c: any) => c.kind === kind)); return ms[ms.length - 1]?.id === msgId; };

// ─── progress ───
function Progress({ c }: P) {
  const [open, setOpen] = useState(false);
  const steps = c.steps || [];
  if (c.done && !open) return <button className="chip" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}><span style={{ color: 'var(--good)' }}><I.check size={13} /></span>{c.title}<span className="dim">· {steps.length} step{steps.length === 1 ? '' : 's'}</span></button>;
  return (
    <div className="ccard" style={{ maxWidth: 560 }}>
      <div className="steps2">
        <div className="row" style={{ padding: '2px 2px 6px' }}>{!c.done && <span className="spin" />}<span className={c.done ? '' : 'shimmer'} style={{ fontWeight: 500 }}>{c.title}</span><span className="grow" />{c.done && <button className="btn ghost sm" onClick={() => setOpen(false)}>Hide</button>}</div>
        {steps.map((s: any, i: number) => (
          <div key={i} className="step2">
            <span className="ic">{s.state === 'run' ? <span className="spin" style={{ width: 12, height: 12 }} /> : s.state === 'err' ? <span className="er">!</span> : <span className="ok"><I.check size={10} /></span>}</span>
            <div style={{ minWidth: 0 }}><div className="lb" style={{ color: s.state === 'run' ? 'var(--ink)' : 'var(--mu)' }}>{s.label}</div>{s.detail && <div className="dt" style={s.state === 'err' ? { color: 'var(--bad)', whiteSpace: 'normal' } : {}}>{s.detail}</div>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── sources ───
function Sources({ c, ctx }: P) {
  const p = ctx.p;
  const srcs = p.sources.filter((s) => !c.ids?.length || c.ids.includes(s.id));
  const vis = p.visuals.filter((v) => !c.ids?.length || c.ids.includes(v.sourceId || '')).slice(0, 12);
  if (!srcs.length) return null;
  return (
    <div className="ccard">
      <div className="hd"><span className="mono">What I read</span><span className="grow" /><span className="tc xs">{srcs.length} source{srcs.length > 1 ? 's' : ''} · {vis.length} visual{vis.length === 1 ? '' : 's'}</span></div>
      <div className="bd col" style={{ gap: 0 }}>
        {srcs.map((s) => (
          <div key={s.id} className="srcrow">
            <span className="favi">{s.kind === 'url' ? (s.label.replace(/^https?:\/\/(www\.)?/, '')[0] || '?').toUpperCase() : s.kind === 'path' ? <I.folder size={14} /> : <I.file size={14} />}</span>
            <div className="grow" style={{ minWidth: 0 }}><div className="ell" style={{ fontWeight: 500, fontSize: 13.5 }}>{s.meta?.siteName || s.meta?.title || s.label}</div><div className="xs dim ell">{s.ref.length > 80 ? s.label : s.ref}</div></div>
            <span className="xs muted" style={{ textAlign: 'right' }}>{s.status === 'error' ? <span className="pill bad">Failed</span> : <>{s.pages?.length ? `${s.pages.length} pages · ` : ''}{Math.round(s.chars / 100) / 10}k chars</>}</span>
          </div>
        ))}
        {vis.length > 0 && <div className="thumbs" style={{ marginTop: 12 }}>{vis.map((v) => <img key={v.id} src={fileUrl(p.id, v.file)} alt={v.description || ''} title={v.description || v.origin} style={v.kind === 'logo' ? { objectFit: 'contain', background: '#fff', aspectRatio: '1', padding: 8 } : undefined} />)}</div>}
      </div>
    </div>
  );
}

// ─── fact ledger ───
function Facts({ ctx }: P) {
  const p = ctx.p;
  const [all, setAll] = useState(false);
  const ver = p.facts.filter((f) => f.status === 'verified').length;
  const held = p.facts.filter((f) => !f.approved).length;
  const order = [...p.facts].sort((a, b) => (b.kind === 'metric' ? 1 : 0) - (a.kind === 'metric' ? 1 : 0) || (a.status === 'verified' ? -1 : 1));
  const shown = all ? order : order.slice(0, 6);
  const toggle = (id: string) => ctx.save({ facts: p.facts.map((f) => (f.id === id ? { ...f, approved: !f.approved } : f)) });
  return (
    <div className="ccard">
      <div className="hd"><span className="mono">Fact ledger</span><span className="grow" /><span className="xs dim">Only ticked facts can appear in the video</span></div>
      <div className="bd col" style={{ gap: 12 }}>
        <div className="statrow">
          <div className="stat"><b>{p.facts.length}</b><span>facts found</span></div>
          <div className="stat"><b style={{ color: 'var(--good)' }}>{ver}</b><span>matched word-for-word</span></div>
          <div className="stat"><b style={{ color: held ? 'var(--warn)' : undefined }}>{held}</b><span>held back for you</span></div>
        </div>
        <div className="ledger">
          {shown.map((f) => (
            <div key={f.id} className={`fact ${f.approved ? '' : 'off'}`}>
              <button className={`tick ${f.approved ? 'on' : ''}`} onClick={() => toggle(f.id)} title={f.approved ? 'Allowed in the video' : 'Kept off screen'}>{f.approved && <I.check size={11} />}</button>
              <div style={{ minWidth: 0 }}><div className="small">{f.statement}</div>{f.quote && <div className="q ell" title={f.quote}>“{f.quote}”</div>}</div>
              <span className={`pill ${f.status === 'verified' ? 'good' : f.status === 'rejected' ? 'bad' : 'warn'}`}>{f.status === 'verified' ? 'verified' : f.where?.startsWith('screenshot') ? 'from screenshot' : 'check'}</span>
            </div>
          ))}
        </div>
        {p.facts.length > 6 && <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${p.facts.length}`}</button>}
      </div>
    </div>
  );
}

// ─── questions ───
function Questions({ ctx, send, busy, chat, msgId }: P) {
  const p = ctx.p;
  const active = isLatestOfKind(chat, msgId, 'questions') && !p.angles.length && p.stage === 'questions';
  const [a, setA] = useState<Record<string, string>>({});
  useEffect(() => { const init: Record<string, string> = {}; for (const q of p.questions) init[q.id] = q.answer || q.suggested || ''; init['intake.productName'] = p.intake.productName; init['intake.audience'] = p.intake.audience; init['intake.cta'] = p.intake.cta; init['intake.ctaUrl'] = p.intake.ctaUrl; init['intake.length'] = String(p.intake.length); setA(init); }, [p.questions.length]); // eslint-disable-line
  if (!active) {
    const answered = p.questions.filter((q) => q.answer);
    return <div className="ccard"><div className="hd"><span style={{ color: 'var(--good)' }}><I.check size={14} /></span><h3>Brief locked</h3><span className="grow" /><span className="xs dim">{p.intake.productName} · {p.intake.audience?.slice(0, 40)} · {p.intake.length}s</span></div>{answered.length > 0 && <div className="bd col" style={{ gap: 6 }}>{answered.slice(0, 4).map((q) => <div key={q.id} className="small"><span className="dim">{q.question}</span> <span>{q.answer}</span></div>)}</div>}</div>;
  }
  const set = (k: string, v: string) => setA((x) => ({ ...x, [k]: v }));
  return (
    <div className="ccard">
      <div className="hd"><span className="mono">Brief</span><span className="grow" /><span className="xs dim">Pre-filled from your sources</span></div>
      <div className="bd col" style={{ gap: 0 }}>
        <div className="grid2" style={{ paddingBottom: 12 }}>
          <label className="f">Product name<input value={a['intake.productName'] || ''} onChange={(e) => set('intake.productName', e.target.value)} /></label>
          <label className="f">Call to action<input value={a['intake.cta'] || ''} onChange={(e) => set('intake.cta', e.target.value)} /></label>
          <label className="f" style={{ gridColumn: '1/-1' }}>Who it&apos;s for<input value={a['intake.audience'] || ''} onChange={(e) => set('intake.audience', e.target.value)} placeholder="e.g. Heads of marketing at 50–500 person B2B SaaS" /></label>
          <label className="f">Link on the end card<input value={a['intake.ctaUrl'] || ''} onChange={(e) => set('intake.ctaUrl', e.target.value)} placeholder="yourproduct.com" /></label>
          <label className="f">Length<div className="seg" style={{ alignSelf: 'flex-start' }}>{['15', '30', '45', '60'].map((l) => <button key={l} className={a['intake.length'] === l ? 'on' : ''} onClick={() => set('intake.length', l)}>{l}s</button>)}</div></label>
        </div>
        {p.questions.map((q) => (
          <div key={q.id} className="qa">
            <div className="qq">{q.question}</div>
            {q.why && <div className="why">{q.why}</div>}
            <textarea rows={1} style={{ minHeight: 38, height: 'auto' }} ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; } }} value={a[q.id] ?? ''} onChange={(e) => { set(q.id, e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 2 + 'px'; }} placeholder="Skip if you're not sure" />
          </div>
        ))}
        <div className="row" style={{ paddingTop: 12 }}><span className="xs dim grow">Anything you leave blank, I&apos;ll handle conservatively.</span><button className="btn primary" disabled={busy} onClick={() => send({ type: 'answers', answers: a })}>Find the story<I.arrowR size={15} /></button></div>
      </div>
    </div>
  );
}

// ─── direction swatch (a tiny poster drawn in the direction's own tokens) ───
export function Swatch({ preset, word, big = 30, style }: { preset: string; word?: string; big?: number; style?: any }) {
  // eslint-disable-next-line no-param-reassign
  const d = DIRECTIONS[preset] || DIRECTIONS.signal; const pl = d.palette;
  const bgs: Record<string, string> = {
    grid: `linear-gradient(${pl.line} 1px,transparent 1px) 0 0/18px 18px,linear-gradient(90deg,${pl.line} 1px,transparent 1px) 0 0/18px 18px,${pl.bg}`,
    paper: `radial-gradient(ellipse at 30% 20%,${pl.bg},${pl.bg2})`,
    horizon: `linear-gradient(${pl.bg} 0 55%,${pl.bg2} 55%),${pl.bg}`,
    modules: `linear-gradient(90deg,${pl.line} 1px,transparent 1px) 0 0/33.3% 100%,${pl.bg}`,
    stripes: `repeating-linear-gradient(135deg,${pl.bg} 0 12px,${pl.bg2} 12px 24px)`,
    blueprint: `linear-gradient(${pl.line} 1px,transparent 1px) 0 0/10px 10px,linear-gradient(90deg,${pl.line} 1px,transparent 1px) 0 0/10px 10px,${pl.bg}`,
    smoke: `radial-gradient(ellipse at 70% 30%,${pl.bg2},${pl.bg} 70%)`,
    scanlines: `repeating-linear-gradient(${pl.bg} 0 2px,${pl.bg2} 2px 4px)`,
    blobs: `radial-gradient(circle at 20% 30%,${pl.bg2} 0 30%,transparent 31%),radial-gradient(circle at 80% 70%,${pl.accent}33 0 26%,transparent 27%),${pl.bg}`,
    dots: `radial-gradient(${pl.line} 1.2px,transparent 1.4px) 0 0/10px 10px,${pl.bg}`,
    solid: pl.bg,
  };
  const txt = word || d.label;
  const wide = (d.display.case === 'upper' ? 1.25 : 1) * (({ Unbounded: 1.35, 'Archivo Black': 1.2, Syne: 1.15, Anton: 0.7, VT323: 0.8 } as any)[d.fonts.display] || 1);
  const longest = Math.max(...String(txt).split(' ').map((w) => w.length));
  big = Math.min(big, Math.floor(200 / Math.max(4, longest * wide) * 1.05));
  return (
    <div className="sw" style={{ background: bgs[d.background] || pl.bg, color: pl.ink, ...style }}>
      {d.background === 'horizon' && <span style={{ position: 'absolute', left: '50%', top: '18%', width: 54, height: 54, marginLeft: -27, borderRadius: '50%', background: `linear-gradient(${pl.accent2},${pl.accent})`, WebkitMaskImage: 'repeating-linear-gradient(#000 0 6px,transparent 6px 8px)' }} />}
      {d.letterbox && <><span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '9%', background: '#000' }} /><span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '9%', background: '#000' }} /></>}
      <span style={{ position: 'relative', zIndex: 1, fontFamily: `'${d.fonts.display}'`, fontWeight: d.display.weight, textTransform: d.display.case === 'upper' ? 'uppercase' : 'none', letterSpacing: `${d.display.tracking}em`, fontSize: big * (d.display.scale || 1), lineHeight: 0.95, fontStyle: d.display.italicAccent ? 'italic' : 'normal', textAlign: d.display.align === 'center' ? 'center' : 'left', width: '100%' }}>{txt}</span>
      <span style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 4, marginTop: 7, justifyContent: d.display.align === 'center' ? 'center' : 'flex-start' }}><i style={{ width: 22, height: 4, background: pl.accent, borderRadius: d.card.radius > 10 ? 4 : 0 }} /><i style={{ width: 10, height: 4, background: pl.accent2, opacity: 0.8 }} /></span>
    </div>
  );
}

// ─── angles ───
function Angles({ ctx, send, busy, chat, msgId }: P) {
  const p = ctx.p;
  const active = isLatestOfKind(chat, msgId, 'angles');
  return (
    <div className="angles">
      {p.angles.map((a) => {
        const d = DIRECTIONS[a.preset] || DIRECTIONS.signal; const on = p.angleId === a.id;
        return (
          <button key={a.id} className={`angle ${on ? 'on' : p.angleId && active ? 'dim' : ''}`} disabled={busy || !active} onClick={() => send({ type: 'angle', id: a.id })}>
            <Swatch preset={a.preset} word={a.title} big={26} />
            <div className="in">
              <div className="hook">“{a.hook}”</div>
              <div className="xs muted">{a.why}</div>
              <div className="beats">{a.structure.split(/→|->/).map((b, i, arr) => <span key={i} style={{ display: 'contents' }}><span>{b.trim()}</span>{i < arr.length - 1 && <em>→</em>}</span>)}</div>
              <div className="row" style={{ marginTop: 'auto', paddingTop: 6 }}><span className="xs dim">{d.label} · {d.music.genre} {d.music.bpm} bpm</span><span className="grow" />{on ? <span className="pill acc">Chosen</span> : <span className="xs" style={{ color: 'var(--a)', fontWeight: 600 }}>Use this →</span>}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── directions ───
function Directions({ ctx, send, busy, setPreview, chat, msgId }: P) {
  const cur = ctx.p.style?.preset || 'signal';
  const active = isLatestOfKind(chat, msgId, 'directions');
  if (!active) return null;
  return (
    <div className="ccard">
      <div className="hd"><span className="mono">The look</span><span className="grow" /><span className="xs dim">Hover to preview on the monitor · click to switch</span></div>
      <div className="bd" style={{ paddingBottom: 6 }}>
        <div className="dirs" onMouseLeave={() => setPreview(null)}>
          {Object.entries(DIRECTIONS).map(([k, d]: any) => (
            <button key={k} className={`dir ${cur === k ? 'on' : ''}`} disabled={busy} onMouseEnter={() => setPreview(k === cur ? null : k)} onClick={() => { setPreview(null); if (k !== cur) send({ type: 'direction', preset: k }); }} title={d.vibe}>
              <Swatch preset={k} word={ctx.p.intake.productName?.split(' ')[0] || d.label} big={24} />
              <div className="nm"><span>{d.label}</span><span className="tc xs">{d.music.genre}</span></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── storyboard filmstrip ───
function Story({ ctx, chat, msgId }: P) {
  const p = ctx.p;
  const latest = isLatestOfKind(chat, msgId, 'storyboard');
  const lay = ctx.lay;
  const issues = ctx.issues;
  if (!latest) return <div className="xs dim">(earlier cut, see the latest storyboard below)</div>;
  const edit = (id: string, text: string) => ctx.save({ scenes: p.scenes.map((s) => (s.id === id ? { ...s, vo: text ? { text } : undefined, caption: undefined } : s)) });
  return (
    <div className="ccard">
      <div className="hd"><span className="mono">Storyboard</span><span className="grow" /><span className="xs dim">Click a frame to jump · click the line to edit</span></div>
      <div className="bd" style={{ paddingBottom: 8 }}>
        <div className="strip">
          {lay.scenes.map((s: any, i: number) => {
            const sc = p.scenes[i]; const bad = issues.filter((x) => x.sceneId === s.id && x.level === 'error');
            return (
              <div key={s.id} className="frame2" onClick={() => ctx.seek(s.start + Math.min(1.2, s.dur * 0.5))}>
                <div className="top2" style={{ paddingTop: 10 }}><span className="n">{String(i + 1).padStart(2, '0')}</span><span className="tc xs">{s.dur.toFixed(1)}s</span></div>
                <div className="xs muted" style={{ padding: '2px 9px 0' }}>{SCENE_TYPES[s.type]?.label || s.type}</div>
                <div className="vo" contentEditable suppressContentEditableWarning onClick={(e) => e.stopPropagation()} onBlur={(e) => { const t = e.currentTarget.textContent?.trim() || ''; if (t !== (sc?.vo?.text || '')) edit(s.id, t); }}>{sc?.vo?.text || ''}</div>
                {bad.length > 0 && <span className="flag pill bad" title={bad.map((b) => b.message).join(' ')}>unverified</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── render ───
function Render({ c, ctx }: P) {
  const p = ctx.p;
  const rs = useMemo(() => { const x = p.renders.filter((r) => c.ids?.includes(r.id)); return x.length ? x : p.renders.slice(0, 2); }, [p.renders, c.ids]);
  if (!rs.length) return null;
  return (
    <div className="ccard">
      <div className="hd"><span style={{ color: 'var(--good)' }}><I.check size={14} /></span><h3>Rendered</h3><span className="grow" /><span className="xs dim">{rs.map((r) => r.format.replace('x', ':')).join(' + ')}</span></div>
      <div className="bd" style={{ display: 'grid', gridTemplateColumns: `repeat(${rs.length},minmax(0,1fr))`, gap: 12, alignItems: 'end' }}>
        {rs.map((r) => (
          <div key={r.id} className="col" style={{ gap: 8 }}>
            <video src={fileUrl(p.id, r.file) + '#t=1.8'} preload="metadata" controls playsInline style={{ maxHeight: 420, objectFit: 'contain' }} />
            <div className="row"><span className="tc xs grow">{r.format.replace('x', ':')} · {r.duration.toFixed(1)}s · {(r.bytes / 1e6).toFixed(1)} MB</span>
              <a className="btn sm" href={fileUrl(p.id, r.file)} download><I.download size={13} />MP4</a>{r.srt && <a className="btn sm ghost" href={fileUrl(p.id, r.srt)} download>SRT</a>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── founder talk: transcript ───
function Transcript({ ctx }: P) {
  const p = ctx.p; const m = p.talk.media[p.talk.media.length - 1];
  const [words, setWords] = useState<{ w: string; s: number; e: number; sp?: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (m?.wordsFile) fetch(fileUrl(p.id, m.wordsFile)).then((r) => r.json()).then(setWords).catch(() => setWords([])); }, [m?.wordsFile]); // eslint-disable-line
  if (!m) return null;
  // which source seconds are kept in the current cut
  const kept = (t: number) => p.talk.segments.some((sg) => t >= sg.start - 0.01 && t <= sg.end + 0.01);
  const cut = p.talk.segments.length > 0;
  const paras: { s: number; sp?: string; ws: typeof words }[] = [];
  (words || []).forEach((w, i, a) => { const prev = a[i - 1]; if (!prev || w.s - prev.e > 1.2 || w.sp !== prev.sp || (/[.!?]$/.test(prev.w) && paras[paras.length - 1].ws!.length > 40)) paras.push({ s: w.s, sp: w.sp, ws: [] }); paras[paras.length - 1].ws!.push(w); });
  const fmt = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
  return (
    <div className="ccard">
      <div className="hd"><span className="mono">Transcript</span><span className="grow" /><span className="tc xs">{fmt(m.duration)} · {m.words} words{m.speakers.length > 1 ? ` · ${m.speakers.length} speakers` : ''}{cut ? ` · ${Math.round((p.talk.duration / m.duration) * 100)}% kept` : ''}</span></div>
      <div className="bd" style={{ display: 'grid', gridTemplateColumns: m.poster ? '120px 1fr' : '1fr', gap: 14 }}>
        {m.poster && <img src={fileUrl(p.id, m.poster)} alt="" style={{ width: 120, aspectRatio: m.w && m.h ? `${m.w}/${m.h}` : '9/16', objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />}
        <div className="scroll" style={{ maxHeight: open ? 420 : 170, overflow: 'auto', fontSize: 13.5, lineHeight: 1.7, position: 'relative' }}>
          {words === null ? <span className="dim">Loading…</span> : paras.map((pg, i) => (
            <p key={i} style={{ margin: '0 0 10px' }}><span className="tc xs" style={{ marginRight: 8 }}>{fmt(pg.s)}</span>
              {pg.ws!.map((w, k) => <span key={k} style={cut ? (kept(w.s) ? { color: 'var(--ink)', background: 'rgba(var(--ar),.10)' } : { color: 'var(--dim)', textDecoration: 'line-through', textDecorationColor: 'rgba(255,255,255,.2)' }) : undefined}>{w.w} </span>)}</p>))}
        </div>
      </div>
      <div className="row" style={{ padding: '0 14px 12px' }}><button className="btn ghost sm" onClick={() => setOpen(!open)}>{open ? 'Collapse' : 'Read it all'}</button>{cut && <span className="xs dim">Highlighted = in the cut · struck = cut out</span>}</div>
    </div>
  );
}

// ─── founder talk: brief ───
function TalkBrief({ ctx, send, busy, chat, msgId }: P) {
  const p = ctx.p; const active = isLatestOfKind(chat, msgId, 'talkbrief') && !p.talk.beats.length;
  const m = p.talk.media[0];
  const [b, setB] = useState<any>(() => ({ name: p.talk.speaker.name, role: p.talk.speaker.role, length: Math.min(60, Math.round(Math.min(p.intake.length || 45, m?.duration || 45))), layout: p.talk.layout, music: p.talk.music, label: p.talk.label, captions: p.talk.showCaptions ?? false, note: p.talk.instruction, formats: p.intake.formats }));
  if (!active) return <div className="ccard"><div className="hd"><span style={{ color: 'var(--good)' }}><I.check size={14} /></span><h3>Cut brief</h3><span className="grow" /><span className="xs dim">{[p.talk.speaker.name, `${p.intake.length}s`, p.talk.layout, `${p.talk.music === 'auto' ? (p.talk.musicWhy?.split(':')[0] || 'auto') : p.talk.music} bed`, 'founder voice'].filter(Boolean).join(' · ')}</span></div></div>;
  const set = (k: string, v: any) => setB((x: any) => ({ ...x, [k]: v }));
  const Seg = ({ k, opts }: { k: string; opts: [any, string][] }) => <div className="seg" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>{opts.map(([v, l]) => <button key={String(v)} className={b[k] === v ? 'on' : ''} onClick={() => set(k, v)}>{l}</button>)}</div>;
  return (
    <div className="ccard">
      <div className="hd"><span className="mono">Cut brief</span><span className="grow" /><span className="xs dim">Everything here is optional</span></div>
      <div className="bd col" style={{ gap: 14 }}>
        <div className="grid2">
          <label className="f">Who&apos;s speaking<input value={b.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Alex Rivera" /></label>
          <label className="f">Their role<input value={b.role} onChange={(e) => set('role', e.target.value)} placeholder="e.g. Founder, AI Xccelerate" /></label>
        </div>
        <label className="f">Length<Seg k="length" opts={[[15, '15s'], [30, '30s'], [45, '45s'], [60, '60s'], [90, '90s']]} /></label>
        <label className="f">Layout<div className="row wrap" style={{ gap: 10 }}>
          {[['split', 'Split', 'Illustrations on top, speaker below'], ['overlay', 'Overlay', 'Speaker full frame, graphics float over']].map(([v, l, d]) => (
            <button key={v} onClick={() => set('layout', v)} className="btn" style={{ height: 'auto', padding: 10, flexDirection: 'column', alignItems: 'flex-start', gap: 6, borderColor: b.layout === v ? 'var(--a)' : undefined, background: b.layout === v ? 'var(--at)' : undefined }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 26, height: 40, borderRadius: 4, border: '1.5px solid var(--line3)', position: 'relative', overflow: 'hidden', background: v === 'overlay' ? '#3a3631' : 'var(--panel3)' }}><i style={{ position: 'absolute', left: v === 'overlay' ? 3 : 0, right: v === 'overlay' ? 3 : 0, top: v === 'overlay' ? 4 : 0, height: v === 'overlay' ? 14 : 24, background: '#EFE7D9', borderRadius: v === 'overlay' ? 2 : 0 }} /></span><b>{l}</b></span>
              <span className="xs muted" style={{ whiteSpace: 'normal', textAlign: 'left', fontWeight: 400 }}>{d}</span></button>))}
        </div></label>
        <div className="grid2">
          <label className="f">Music bed<Seg k="music" opts={[['auto', 'Auto'], ['lofi', 'Lo-fi'], ['piano', 'Piano'], ['ambient', 'Ambient'], ['cinematic', 'Cinematic'], ['none', 'None']]} /></label>
          <label className="f">Word captions<Seg k="captions" opts={[[false, 'Off'], [true, 'On']]} /></label>
        </div>
        <label className="f">Header strip (optional)<input value={b.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. TRIBAL KNOWLEDGE · SCRIBE (Nick writes one if blank)" /></label>
        <label className="f">Anything to keep or cut?<textarea rows={2} value={b.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. open on the tribal knowledge line, end on Meet Scribe, skip the bit about pricing" /></label>
        <div className="row small" style={{ gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--line)' }}><I.lock size={15} /><span><b>Voice: the founder&apos;s own recording.</b> <span className="muted">TrueCut never replaces or re-voices a founder. The music bed only sits quietly underneath.</span></span></div>
        <div className="row"><span className="xs dim grow">Nick only uses the speaker&apos;s real words. Numbers on screen are ones they actually said.</span><button className="btn primary" disabled={busy} onClick={() => send({ type: 'talkbrief', brief: b })}>Cut it<I.arrowR size={15} /></button></div>
      </div>
    </div>
  );
}

// ─── founder talk: the edit (beats) ───
const KIND_LABEL: Record<string, string> = { cards: 'Cards', grid: 'Icon grid', bars: 'Dashboard', meter: 'Meter', window: 'App window', bubbles: 'Chat bubbles', brand: 'Brand reveal', stat: 'Big number', quote: 'Quote', list: 'List', compare: 'Before / after', flow: 'Flow', orbit: 'Orbit', image: 'Screenshot' };
function Edit({ ctx, chat, msgId }: P) {
  const p = ctx.p; const latest = isLatestOfKind(chat, msgId, 'edit'); const lay = ctx.lay;
  if (!latest) return <div className="xs dim">(earlier cut, see the latest edit below)</div>;
  const edit = (i: number, patch: any) => ctx.save({ talk: { ...p.talk, beats: p.talk.beats.map((b, k) => (k === i ? { ...b, ...patch } : b)) } as any });
  return (
    <div className="ccard">
      <div className="hd"><span className="mono">The edit</span><span className="grow" /><span className="xs dim">{p.talk.beats.length} beats · click to jump · edit the headline inline</span></div>
      <div className="bd" style={{ paddingBottom: 8 }}>
        <div className="strip">
          {lay.scenes.map((s: any, i: number) => { const b = p.talk.beats[i]; if (!b) return null; return (
            <div key={s.id} className="frame2" style={{ width: 160 }} onClick={() => ctx.seek(s.start + Math.min(1.2, s.dur * 0.6))}>
              <div className="top2" style={{ paddingTop: 10 }}><span className="n">{String(i + 1).padStart(2, '0')}</span><span className="tc xs">{s.dur.toFixed(1)}s</span></div>
              <div className="xs muted" style={{ padding: '2px 9px 0' }}>{KIND_LABEL[b.visual?.kind] || b.visual?.kind}</div>
              <div className="vo serif" style={{ fontSize: 17, lineHeight: 1.2, minHeight: 48 }} contentEditable suppressContentEditableWarning onClick={(e) => e.stopPropagation()} onBlur={(e) => { const t = e.currentTarget.textContent?.trim() || ''; if (t && t !== b.headline) edit(i, { headline: t, accent: t.split(' ').includes(b.accent || '') ? b.accent : t.split(' ').pop() }); }}>{b.headline}</div>
              {b.sub && <div className="xs dim" style={{ padding: '0 9px 10px' }}>{b.sub}</div>}
            </div>); })}
        </div>
      </div>
    </div>
  );
}

// ─── voice cast ───
const ENERGY: Record<string, string> = { calm: 'Calm', balanced: 'Balanced', energetic: 'Energetic' };
const TONES = ['#F47920', '#5B8DEF', '#3FB68B', '#C46BE0'];
function CastCard({ ctx, chat, msgId, send, busy }: P) {
  const p = ctx.p; const c = p.cast;
  const latest = isLatestOfKind(chat, msgId, 'cast');
  const [voices, setVoices] = useState<any[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useMemo(() => (typeof Audio !== 'undefined' ? new Audio() : null), []);
  useEffect(() => { if (latest) fetch('/api/voices').then((r) => r.json()).then((j) => setVoices(j.voices || [])).catch(() => {}); }, [latest]);
  useEffect(() => () => { audio?.pause(); }, [audio]);
  if (!c.members.length) return null;
  if (!latest) return <div className="xs dim">(earlier cast: {c.members.map((m) => m.name).join(' + ')})</div>;
  const play = (url?: string, key?: string) => { if (!audio || !url) return; if (playing === key) { audio.pause(); setPlaying(null); return; } audio.src = url; audio.play().catch(() => {}); setPlaying(key || url); audio.onended = () => setPlaying(null); };
  const saveCast = (patch: any) => ctx.save({ cast: { ...c, ...patch, auto: false } as any });
  const setMember = (k: number, m: any) => saveCast({ members: c.members.map((x, i) => (i === k ? { ...x, ...m } : x)) });
  const lines = p.scenes.map((s, i) => ({ s, i })).filter((x) => x.s.vo?.text);
  const roleOf = (sid: string) => c.assign[sid] || c.members[0].role;
  const cycle = (sid: string) => { const rs = c.members.map((m) => m.role); const cur = rs.indexOf(roleOf(sid)); saveCast({ assign: { ...c.assign, [sid]: rs[(cur + 1) % rs.length] } }); };
  const tone = (role: string) => TONES[Math.max(0, c.members.findIndex((m) => m.role === role)) % TONES.length];
  const voiced = lines.some((x) => x.s.vo?.file);
  return (
    <div className="ccard">
      <div className="hd"><span className="mono">Cast &amp; score</span><span className="grow" /><span className="xs dim">{c.members.length === 1 ? 'One voice' : `${c.members.length} voices`} · {c.music?.genre || 'direction'} score</span></div>
      <div className="bd col" style={{ gap: 12 }}>
        {c.why && <div className="small muted">{c.why}</div>}
        {c.members.map((m, k) => (
          <div key={k} className="row" style={{ gap: 12, alignItems: 'flex-start', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg2)' }}>
            <button className="btn icon" onClick={() => play(m.preview, m.voiceId)} title="Hear this voice" style={{ width: 44, height: 44, borderRadius: '50%', background: TONES[k % TONES.length], borderColor: 'transparent', color: '#fff', flex: 'none' }}>{playing === m.voiceId ? <I.pause size={16} /> : <I.play size={16} style={{ marginLeft: 2 }} />}</button>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><b style={{ fontSize: 15 }}>{m.name}</b><span className="pill neu">{m.role}</span><span className="xs dim">{[m.labels?.accent, m.labels?.age?.replace('_', ' '), m.labels?.gender].filter(Boolean).join(' · ')}</span></div>
              <div className="xs muted" style={{ marginTop: 3 }}>{m.why}</div>
              <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                <div className="seg">{Object.entries(ENERGY).map(([e, l]) => <button key={e} className={m.energy === e ? 'on' : ''} onClick={() => setMember(k, { energy: e })}>{l}</button>)}</div>
                {voices.length > 0 && <select value={m.voiceId} onChange={(e) => { const v = voices.find((x) => x.id === e.target.value); if (v) setMember(k, { voiceId: v.id, name: v.name.split(' - ')[0], labels: v.labels || {}, preview: v.preview, why: 'Picked by you' }); }} style={{ width: 'auto', maxWidth: 260, height: 30, padding: '0 8px' }}>
                  {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.labels?.accent ? ` · ${v.labels.accent}` : ''}</option>)}</select>}
              </div>
            </div>
          </div>
        ))}
        {c.members.length > 1 && <div className="col" style={{ gap: 4 }}>
          <div className="xs dim">Who reads what · click a line's voice to switch it</div>
          {lines.map(({ s, i }) => <div key={s.id} className="row small" style={{ gap: 10 }}><span className="tc xs" style={{ width: 22 }}>{String(i + 1).padStart(2, '0')}</span><button className="pill" onClick={() => cycle(s.id)} style={{ border: 0, cursor: 'pointer', background: tone(roleOf(s.id)) + '22', color: tone(roleOf(s.id)), minWidth: 90, justifyContent: 'center' }}>{c.members.find((m) => m.role === roleOf(s.id))?.name}</button><span className="ell grow muted">{s.vo?.text}</span></div>)}
        </div>}
        {c.music && <div className="row small" style={{ gap: 10, paddingTop: 2 }}><span className="pill acc">Score: {c.music.genre}{c.music.bpm ? ` · ${c.music.bpm} bpm` : ''}</span><span className="xs muted grow">{c.music.why}</span></div>}
        <div className="row"><span className="xs dim grow">{voiced ? 'Changes re-record only the affected lines.' : 'Voices are recorded when you render.'}</span><button className="btn sm" disabled={busy} onClick={() => send({ type: 'reply', text: 'Try a different voice' })}>Recast</button><button className="btn sm primary" disabled={busy} onClick={() => send({ type: 'render' })}>Render with this cast</button></div>
      </div>
    </div>
  );
}
