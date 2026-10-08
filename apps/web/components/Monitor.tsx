'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { I } from './icons';
import { fileUrl } from './api';
import { SCENE_TYPES } from '@truecut/engine/timeline.js';
import { layoutOf } from '@truecut/shared/compose';
import { DIRECTIONS } from '@truecut/engine/styles.js';
import type { Project } from '@truecut/shared/types';

const DIMS: Record<string, [number, number]> = { '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] };
const tc = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${(x % 60).toFixed(2).padStart(5, '0')}`;

export default function Monitor({ p, comp, lay: lay0, style, bindSeek, issues, onRender, busy }: { p: Project; comp: any; lay: any; style?: any; bindSeek: (f: (t: number) => void) => void; issues: any[]; onRender: () => void; busy: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [fmt, setFmt] = useState<string>(p.kind === 'talk' && p.intake.formats.includes('9x16') ? '9x16' : p.intake.formats[0] || '4x5');
  const [t, setT] = useState(1.6);
  const [playing, setPlaying] = useState(false);
  const c = useMemo(() => (style ? { ...comp, style } : comp), [comp, style]);
  const lay = useMemo(() => (style ? layoutOf(c) : lay0), [c, style, lay0]);
  const audio = p.kind !== 'talk' && p.audioFile && p.audioHash && !style ? fileUrl(p.id, p.audioFile) : '';
  const post = (m: any) => ref.current?.contentWindow?.postMessage(m, '*');
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const m = e.data || {};
      if (m.type === 'nm:want') post({ type: 'nm:comp', comp: c });
      if (m.type === 'nm:ready') { post({ type: 'nm:seek', t }); post({ type: 'nm:audio', url: audio }); }
      if (m.type === 'nm:time') setT(m.t);
      if (m.type === 'nm:ended') setPlaying(false);
    };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }); // eslint-disable-line
  useEffect(() => { if (!p.scenes.length && !p.talk?.beats?.length) return; const h = setTimeout(() => post({ type: 'nm:comp', comp: c }), style ? 60 : 250); return () => clearTimeout(h); }, [c]); // eslint-disable-line
  useEffect(() => { post({ type: 'nm:audio', url: audio }); }, [audio]); // eslint-disable-line
  useEffect(() => { bindSeek((x: number) => { setT(x); post({ type: 'nm:seek', t: x }); }); }); // eslint-disable-line
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable) return; if (e.code === 'Space' && (p.scenes.length || p.talk?.beats?.length)) { e.preventDefault(); toggle(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line
  const toggle = () => { if (playing) { post({ type: 'nm:pause' }); setPlaying(false); } else { post({ type: 'nm:play' }); setPlaying(true); } };
  const seek = (x: number) => { setT(x); post({ type: 'nm:seek', t: x }); };
  const [w, h] = DIMS[fmt];
  const dur = lay?.duration || 0;
  const sceneNow = lay?.scenes.find((s: any) => t >= s.start && t < s.end);
  const errs = issues.filter((i) => i.level === 'error').length;
  const last = p.renders[0];

  return (
    <aside className="monitor">
      <div className="monhd">
        <span className="mono" style={{ color: 'var(--ink)' }}>Monitor</span>
        {style && <span className="pill acc">Previewing {DIRECTIONS[style.preset]?.label}</span>}
        <span className="grow" />
        <div className="seg">{Object.keys(DIMS).map((f) => <button key={f} className={fmt === f ? 'on' : ''} onClick={() => { setFmt(f); setPlaying(false); }}>{f.replace('x', ':')}</button>)}</div>
      </div>
      <div className="monbody">
        {p.scenes.length || p.talk?.beats?.length ? (
          <div className="screen" style={{ aspectRatio: `${w}/${h}`, width: `min(100%, calc((100vh - 250px) * ${w / h}))` }}>
            <iframe key={fmt} ref={ref} src={`/engine/player.html?format=${fmt}&assetBase=/api/files/${p.id}/`} title="Monitor" />
            <button className="bigplay" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><span>{playing ? <I.pause size={22} /> : <I.play size={22} style={{ marginLeft: 3 }} />}</span></button>
          </div>
        ) : (
          <div className="screen emptyscreen" style={{ aspectRatio: '4/5', width: 'min(100%, calc((100vh - 250px) * .8))' }}>
            <div className="scanline" />
            <div style={{ textAlign: 'center', padding: 30, position: 'relative' }}>
              <div className="serif" style={{ fontSize: 30, lineHeight: 1.1, marginBottom: 8 }}>{busy ? <>Nick is <i>reading</i></> : <>The monitor lights up<br /><i>when the cut is ready</i></>}</div>
              <div className="small muted">{p.sources.length ? `${p.sources.length} source${p.sources.length > 1 ? 's' : ''} · ${p.facts.length} facts · ${p.visuals.length} visuals` : 'Drop a link in the chat to begin.'}</div>
            </div>
          </div>
        )}
      </div>
      {(p.scenes.length > 0 || p.talk?.beats?.length > 0) && lay && <>
        <div className="transport">
          <button className="btn icon sm" onClick={toggle} title="Play / pause (Space)">{playing ? <I.pause size={14} /> : <I.play size={14} />}</button>
          <span className="tc" style={{ color: 'var(--ink)' }}>{tc(t)}</span><span className="tc dim">/ {tc(dur)}</span>
          <span className="grow ell xs muted" style={{ textAlign: 'center' }}>{sceneNow ? `${sceneNow.index + 1} · ${SCENE_TYPES[sceneNow.type]?.label || sceneNow.type}` : ''}</span>
          <span className="xs dim">{p.kind === 'talk' ? 'speaker audio + bed' : audio ? 'with sound' : 'silent preview'}</span>
        </div>
        <div className="timeline">
          <div className="tl" onClick={(e) => { const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * dur); }}>
            {lay.scenes.map((s: any, i: number) => {
              const bad = issues.some((x) => x.sceneId === s.id && x.level === 'error');
              return <div key={s.id} className={`blk ${sceneNow?.id === s.id ? 'cur' : ''}`} style={{ left: `${(s.start / dur) * 100}%`, width: `${(s.dur / dur) * 100}%`, background: sceneNow?.id === s.id ? 'rgba(var(--ar),.16)' : i % 2 ? 'var(--panel2)' : 'var(--panel)', boxShadow: bad ? 'inset 0 -3px 0 var(--bad)' : undefined }} title={`${i + 1}. ${s.vo?.text || s.type}`}><span className="ell">{String(i + 1).padStart(2, '0')} {s.type}</span></div>;
            })}
            {Array.from({ length: Math.floor(dur / (lay.beat * 4)) }, (_, k) => <span key={k} className="beat" style={{ left: `${((k + 1) * lay.beat * 4 / dur) * 100}%` }} />)}
            {lay.revealAt != null && <span className="drop" style={{ left: `${(lay.revealAt / dur) * 100}%` }} title="The drop" />}
            <span className="ph" style={{ left: `${(t / dur) * 100}%` }} />
          </div>
        </div>
        <div className="row" style={{ padding: '0 16px 16px', gap: 8 }}>
          <span className="xs muted grow">{p.kind === 'talk' ? `${p.talk.beats.length} beats` : `${p.scenes.length} scenes`} · {errs ? <span style={{ color: 'var(--bad)' }}>{errs} unverified</span> : 'every number traced'}</span>
          {last && <a className="btn sm" href={fileUrl(p.id, last.file)} download><I.download size={14} />Last render</a>}
          <button className="btn primary sm" disabled={busy} onClick={onRender}><I.film size={14} />Render</button>
        </div>
      </>}
    </aside>
  );
}
