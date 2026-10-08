'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Composer, { type Options } from './Composer';
import { useShared } from './Shell';
import VideoGrid from './VideoGrid';
import { api, uploadFiles } from './api';
import type { Attachment } from '@truecut/shared/detect';

const STARTERS = [
  { l: 'aixccelerate.com', t: 'https://aixccelerate.com' },
  { l: 'A repo on this machine', t: '../agent-nick' },
  { l: 'Edit a founder talk', t: '', file: true },
  { l: 'Paste a call transcript', t: '', focus: true },
];

export default function Home() {
  const r = useRouter();
  const { projects, refresh, me } = useShared();
  const [opts, setOpts] = useState<Options>({ kind: 'ad', length: 0, formats: ['4x5', '9x16'], preset: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function send(text: string, atts: Attachment[], files: File[]) {
    setBusy(true); setErr('');
    const action = { type: 'message', text, attachments: atts, options: { ...opts, length: opts.length || undefined, preset: opts.preset || undefined } };
    try {
      let res: any;
      if (files.length) { res = await api('/api/projects', { json: { name: 'Untitled video' } }); const up = await uploadFiles(res.id, files); await api(`/api/projects/${res.id}/chat`, { json: { action: { ...action, attachments: [...atts, ...up] } } }); }
      else res = await api('/api/projects', { json: { action }, headers: { 'x-nm-chat': '1' } });
      refresh(); r.push(`/p/${res.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="home">
      <section className="stage">
        <BackReel projects={projects} />
        <div className="eyebrow"><span className="rec" />Nick is ready to direct</div>
        <h1 className="headline serif">Drop a link.<br /><i>Get a film.</i></h1>
        <p className="lede">Nick reads your product, checks every fact against the source, pitches you three ways to tell it, then writes, scores and renders a motion-graphics ad. All in one conversation.</p>
        <Composer onSend={send} busy={busy} options={opts} setOptions={setOpts} autoFocus placeholder="Paste your website, a repo path, or describe the video you want…" />
        {err && <div className="issue error" style={{ marginTop: 12 }}>{err}</div>}
        <div className="starters">
          {STARTERS.map((s) => <button key={s.l} className="chip" onClick={() => { if ((s as any).file) { setOpts({ ...opts, kind: 'talk' }); document.getElementById('nm-attach')?.click(); return; } if (s.focus) { document.getElementById('nm-composer')?.focus(); return; } send(s.t, [], []); }}>{s.l}</button>)}
        </div>
      </section>
      <section className="section">
        <div className="sectionhd"><h2 className="serif" style={{ fontSize: 30 }}>{me?.auth ? 'Team reel' : 'Your reel'}</h2><span className="tc">{projects?.length ? `${projects.length} video${projects.length > 1 ? 's' : ''}` : ''}</span></div>
        <VideoGrid projects={projects} limit={12} />
      </section>
    </div>
  );
}

/** Live engine previews behind the prompt: real projects, each re-dressed in a different direction, looping. */
function BackReel({ projects }: { projects: any[] | null }) {
  const [comps, setComps] = useState<{ id: string; comp: any }[]>([]);
  useEffect(() => {
    if (!projects) return;
    const withScenes = projects.filter((p) => p.scenes > 0).slice(0, 3);
    const looks = ['neon', 'editorial', 'brutal'];
    Promise.all(withScenes.map((p, i) => api(`/api/projects/${p.id}/composition`).then((c) => ({ id: p.id, comp: { ...c, style: { preset: looks[i % 3] } } })).catch(() => null)))
      .then((x) => setComps(x.filter(Boolean) as any));
  }, [projects?.length]); // eslint-disable-line
  const slots = comps.length ? comps.map((c, i) => ({ ...c, i })) : [];
  if (!slots.length) return <div className="backreel">{[0, 1, 2].map((i) => <div key={i} className="ph" style={{ width: 230, height: 288, background: `linear-gradient(160deg,var(--panel3),var(--bg2))`, opacity: i === 1 ? 1 : 0.6 }} />)}</div>;
  // three tiles; the middle one larger
  const order = slots.length === 1 ? [slots[0], slots[0], slots[0]] : slots.length === 2 ? [slots[0], slots[1], slots[0]] : slots;
  return <div className="backreel">{order.map((s, k) => <Reel key={k} comp={k === 1 ? s.comp : { ...s.comp, style: { preset: ['magazine', 'neon', 'pop'][k] } }} pid={s.id} w={k === 1 ? 300 : 230} offset={k * 3.1} />)}</div>;
}

function Reel({ comp, pid, w, offset }: { comp: any; pid: string; w: number; offset: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const post = (m: any) => ref.current?.contentWindow?.postMessage(m, '*');
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const t = e.data?.type;
      if (t === 'nm:want') post({ type: 'nm:comp', comp: { ...comp, captions: false } });
      if (t === 'nm:ready') { post({ type: 'nm:seek', t: 1.2 + offset }); post({ type: 'nm:play' }); }
      if (t === 'nm:ended') { post({ type: 'nm:seek', t: 0 }); post({ type: 'nm:play' }); }
    };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, [comp, offset]);
  return <iframe ref={ref} tabIndex={-1} aria-hidden src={`/engine/player.html?format=4x5&assetBase=/api/files/${pid}/`} style={{ width: w, height: w * 1.25 }} />;
}
