'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { fileUrl, timeAgo, api } from './api';
import { I } from './icons';
import { stageLabel, useShared } from './Shell';
import { DIRECTIONS } from '@truecut/engine/styles.js';

export default function VideoGrid({ projects, limit, filter = 'all', q = '' }: { projects: any[] | null; limit?: number; filter?: string; q?: string }) {
  const { refresh } = useShared();
  if (projects === null) return <div className="vgrid">{[0, 1, 2, 3].map((i) => <div key={i} className="vcard"><div className="frame" style={{ background: 'linear-gradient(90deg,var(--panel),var(--panel2),var(--panel))', backgroundSize: '200% 100%', animation: 'shimmer 1.6s infinite' }} /></div>)}</div>;
  let list = projects.filter((p) => (filter === 'rendered' ? p.renders > 0 : filter === 'progress' ? !p.renders : filter === 'fav' ? p.favorite : true)).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  if (limit) list = list.slice(0, limit);
  if (!list.length) return <div className="empty" style={{ padding: 40 }}><div className="serif" style={{ fontSize: 26, color: 'var(--ink)', marginBottom: 6 }}>{projects.length ? 'Nothing here yet' : <>Your first film is <i>one link</i> away</>}</div><div className="small">{projects.length ? 'Try another filter.' : 'Paste a website above, or run npm run seed:demo for the Agent Nick example.'}</div></div>;
  return <div className="vgrid">{list.map((p, i) => <Card key={p.id} p={p} i={i} onFav={async () => { await api(`/api/projects/${p.id}`, { method: 'PATCH', json: { favorite: !p.favorite } }); refresh(); }} />)}</div>;
}

function Card({ p, i, onFav }: { p: any; i: number; onFav: () => void }) {
  const v = useRef<HTMLVideoElement>(null);
  const [hover, setHover] = useState(false);
  const d = DIRECTIONS[p.style] || DIRECTIONS.signal;
  return (
    <Link href={`/p/${p.id}`} className="vcard" style={{ animationDelay: `${i * 40}ms` }} onMouseEnter={() => { setHover(true); v.current?.play().catch(() => {}); }} onMouseLeave={() => { setHover(false); if (v.current) { v.current.pause(); v.current.currentTime = 1.5; } }}>
      <div className="frame" style={{ backgroundImage: !p.video && p.thumb ? `url(${fileUrl(p.id, p.thumb)})` : undefined, background: !p.video && !p.thumb ? `linear-gradient(160deg,${d.palette.bg2},${d.palette.bg})` : undefined }}>
        {p.video && <video ref={v} src={fileUrl(p.id, p.video) + '#t=1.5'} muted loop playsInline preload="metadata" />}
        {!p.video && !p.thumb && <div className="serif" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 40, color: d.palette.ink, opacity: 0.85, padding: 20, textAlign: 'center' }}>{p.name.split(' ')[0]}</div>}
        <button className="btn icon sm ghost fav" onClick={(e) => { e.preventDefault(); onFav(); }} style={{ color: p.favorite ? '#FFC94D' : 'rgba(255,255,255,.7)', opacity: p.favorite || hover ? 1 : 0, background: 'rgba(0,0,0,.4)' }} title="Favourite"><I.star size={14} /></button>
        <div className="ov">
          <span className="tag" style={{ ['--pa' as any]: d.palette.accent }}><i />{d.label}</span>
          {p.busy ? <span className="tag"><span className="dot busy" />Working</span> : <span className="tag">{p.length}s</span>}
        </div>
      </div>
      <div><div className="t ell">{p.name}</div><div className="s">{p.renders ? 'Rendered' : stageLabel(p.stage)} · {timeAgo(p.updatedAt)}</div></div>
    </Link>
  );
}
