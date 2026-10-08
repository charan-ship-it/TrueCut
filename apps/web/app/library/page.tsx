'use client';
import { useState } from 'react';
import VideoGrid from '../../components/VideoGrid';
import { useShared } from '../../components/Shell';
export default function Library() {
  const { projects } = useShared();
  const [f, setF] = useState('all'); const [q, setQ] = useState('');
  return (
    <div className="home"><div className="section" style={{ paddingTop: 40 }}>
      <div className="sectionhd"><h1 className="serif" style={{ fontSize: 44, fontWeight: 400 }}>Library</h1></div>
      <div className="row between wrap" style={{ marginBottom: 18 }}>
        <div className="seg">{[['all', 'All'], ['rendered', 'Rendered'], ['progress', 'In progress'], ['fav', 'Favourites']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
      </div>
      <VideoGrid projects={projects} filter={f} q={q} />
    </div></div>
  );
}
