'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toComposition } from '@truecut/shared/compose';
import { fileUrl } from './api';
import type { Project } from '@truecut/shared/types';

const DIMS: Record<string, [number, number]> = { '4x5': [1080, 1350], '9x16': [1080, 1920], '1x1': [1080, 1080] };

export default function Preview({ p, lay, bindSeek }: { p: Project; lay: any; bindSeek: (f: (t: number) => void) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [fmt, setFmt] = useState<string>(p.intake.formats[0] || '4x5');
  const [ready, setReady] = useState(false);
  const [t, setT] = useState(1.6);
  const [playing, setPlaying] = useState(false);
  const comp = useMemo(() => toComposition(p), [p]);
  const audio = p.audioFile && p.audioHash ? fileUrl(p.id, p.audioFile) : '';
  const post = (m: any) => ref.current?.contentWindow?.postMessage(m, '*');

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const m = e.data || {};
      if (m.type === 'nm:want') { post({ type: 'nm:comp', comp }); }
      if (m.type === 'nm:ready') { setReady(true); post({ type: 'nm:seek', t }); }
      if (m.type === 'nm:time') setT(m.t);
      if (m.type === 'nm:ended') setPlaying(false);
    };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }); // eslint-disable-line
  useEffect(() => { if (!p.scenes.length) return; const h = setTimeout(() => post({ type: 'nm:comp', comp }), 250); return () => clearTimeout(h); }, [comp]); // eslint-disable-line
  useEffect(() => { post({ type: 'nm:audio', url: audio }); }, [audio, ready]); // eslint-disable-line
  useEffect(() => { bindSeek((x: number) => { setT(x); post({ type: 'nm:seek', t: x }); }); }); // eslint-disable-line

  if (!p.scenes.length) return <div className="preview" style={{ aspectRatio: '4/5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="muted small" style={{ padding: 30, textAlign: 'center' }}>The live preview appears here once there is a storyboard.</div></div>;
  const [w, h] = DIMS[fmt];
  const fmtT = (x: number) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`;
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="preview" style={{ aspectRatio: `${w}/${h}`, maxHeight: '64vh', margin: '0 auto', width: fmt === '9x16' ? 'auto' : '100%', height: fmt === '9x16' ? '64vh' : undefined }}>
        <iframe key={fmt} ref={ref} onLoad={() => { setReady(false); post({ type: 'nm:comp', comp }); }} src={`/engine/player.html?format=${fmt}&assetBase=/api/files/${p.id}/`} style={{ height: '100%' }} title="preview" />
      </div>
      <div className="row">
        <button className="btn sm" onClick={() => { if (playing) { post({ type: 'nm:pause' }); setPlaying(false); } else { post({ type: 'nm:play' }); setPlaying(true); } }}>{playing ? 'Pause' : 'Play'}</button>
        <div className="grow" style={{ position: 'relative' }}>
          <input className="scrub" type="range" min={0} max={lay.duration} step={1 / 30} value={t} onChange={(e) => { const x = +e.target.value; setT(x); post({ type: 'nm:seek', t: x }); }} style={{ padding: 0, border: 0, background: 'transparent' }} />
        </div>
        <span className="mono" style={{ width: 92, textAlign: 'right' }}>{fmtT(t)} / {fmtT(lay.duration)}</span>
      </div>
      <div className="row between">
        <div className="seg">{Object.keys(DIMS).map((f) => <button key={f} className={fmt === f ? 'on' : ''} onClick={() => { setFmt(f); setPlaying(false); }}>{f.replace('x', ':')}</button>)}</div>
        <span className="small dim">{audio ? 'with soundtrack' : 'silent preview — build audio in Voice & music'}</span>
      </div>
      <div className="row wrap" style={{ gap: 4 }}>{lay.scenes.map((s: any, i: number) => <button key={s.id} className="btn sm ghost" style={{ padding: '0 6px', color: t >= s.start && t < s.end ? 'var(--a)' : undefined }} onClick={() => { setT(s.start + 0.6); post({ type: 'nm:seek', t: s.start + 0.6 }); }}>{i + 1}</button>)}</div>
    </div>
  );
}
