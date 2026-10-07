'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, fileUrl, timeAgo } from './api';
import { I, NickMark } from './icons';
import { DIRECTIONS } from '@/public/engine/styles.js';

type Row = { id: string; name: string; stage: string; updatedAt: string; scenes: number; renders: number; thumb: string | null; video: string | null; style: string; favorite: boolean; busy: boolean; length: number; last: string };
const Shared = createContext<{ projects: Row[] | null; refresh: () => void; health: any }>({ projects: null, refresh: () => {}, health: null });
export const useShared = () => useContext(Shared);

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const r = useRouter();
  const [projects, setProjects] = useState<Row[] | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const refresh = () => api('/api/projects').then(setProjects).catch(() => setProjects([]));
  useEffect(() => { refresh(); api('/api/health').then(setHealth).catch(() => {}); try { const t = localStorage.getItem('nm-theme') as any; if (t) setTheme(t); setCollapsed(localStorage.getItem('nm-side') === '1'); } catch {} }, []);
  useEffect(() => { const busy = projects?.some((p) => p.busy); const t = setInterval(refresh, busy ? 2500 : 10000); return () => clearInterval(t); }, [projects]);
  useEffect(() => { refresh(); }, [path]);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('nm-theme', theme); } catch {} }, [theme]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCollapsed(false); setTimeout(() => document.getElementById('nm-search')?.focus(), 30); }
      if (!typing && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); r.push('/'); setTimeout(() => document.getElementById('nm-composer')?.focus(), 80); }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('nm-side', c ? '0' : '1'); } catch {} return !c; });
  const list = useMemo(() => (projects || []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())), [projects, q]);
  const cur = path.startsWith('/p/') ? path.split('/')[2] : '';
  const chk = (id: string) => health?.checks?.find((c: any) => c.id === id);

  return (
    <Shared.Provider value={{ projects, refresh, health }}>
      <div className={`app ${collapsed ? 'collapsed' : ''}`}>
        <aside className="side">
          <div className="row between" style={{ paddingRight: 2 }}>
            <Link href="/" className="brand"><NickMark /><span className="hide-c"><b>Truecut</b><small>by AIX</small></span></Link>
            <button className="btn ghost icon sm hide-c" title="Collapse sidebar (⌘\)" onClick={toggle}><I.side /></button>
          </div>
          {collapsed && <button className="navbtn" title="Expand sidebar" onClick={toggle} style={{ justifyContent: 'center' }}><I.side /></button>}
          <Link href="/" className="navbtn newbtn" onClick={() => setTimeout(() => document.getElementById('nm-composer')?.focus(), 80)} title="New video (N)" style={collapsed ? { justifyContent: 'center', padding: 0 } : {}}><I.plus /><span className="hide-c">New video</span><span className="kbd hide-c">N</span></Link>
          <div className="hide-c" style={{ position: 'relative', margin: '2px 0 4px' }}>
            <span style={{ position: 'absolute', left: 10, top: 9, color: 'var(--dim)' }}><I.search size={15} /></span>
            <input id="nm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search videos" style={{ paddingLeft: 32, height: 34, background: 'transparent' }} />
            <span className="kbd" style={{ position: 'absolute', right: 8, top: 9 }}>⌘K</span>
          </div>
          <Link href="/" className={`navbtn ${path === '/' ? 'on' : ''}`} title="Studio"><I.home /><span className="hide-c">Studio</span></Link>
          <Link href="/library" className={`navbtn ${path === '/library' ? 'on' : ''}`} title="Library"><I.film /><span className="hide-c">Library</span></Link>
          <Link href="/directions" className={`navbtn ${path === '/directions' ? 'on' : ''}`} title="Directions"><I.palette /><span className="hide-c">Directions</span></Link>
          <div className="sidehd hide-c"><span className="mono">Your reel</span><span className="tc xs">{projects?.length ?? ''}</span></div>
          <div className="reel hide-c">
            {projects === null ? [0, 1, 2].map((i) => <div key={i} className="reelitem"><span className="poster" /><span className="grow"><span className="t" style={{ display: 'block', width: '70%', height: 10, background: 'var(--panel3)', borderRadius: 4 }} /></span></div>)
              : list.length === 0 ? <div className="dim xs" style={{ padding: '6px 9px' }}>{q ? 'No matches.' : 'Your videos will appear here.'}</div>
              : list.map((p) => (
                <Link key={p.id} href={`/p/${p.id}`} className={`reelitem ${cur === p.id ? 'on' : ''}`}>
                  <span className="poster" style={{ backgroundImage: p.thumb ? `url(${fileUrl(p.id, p.thumb)})` : undefined, ['--pa' as any]: DIRECTIONS[p.style]?.palette.accent }} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="t ell" style={{ display: 'block' }}>{p.name}</span>
                    <span className="s row" style={{ gap: 6 }}>{p.busy ? <><span className="dot busy" />Nick is working…</> : <>{p.renders ? `${p.renders} render${p.renders > 1 ? 's' : ''}` : stageLabel(p.stage)} · {timeAgo(p.updatedAt)}</>}</span>
                  </span>
                </Link>))}
          </div>
          {collapsed && <div className="grow" />}
          <div className="sidefoot">
            <div className="row hide-c" style={{ padding: '4px 9px 6px', gap: 12 }} title={health?.checks?.map((c: any) => `${c.label}: ${c.ok ? 'ready' : c.hint}`).join('\n')}>
              {[['anthropic', 'AI'], ['eleven', 'Voice'], ['chromium', 'Render']].map(([id, l]) => <span key={id} className="row xs muted" style={{ gap: 5 }}><span className={`dot ${chk(id)?.ok ? 'on' : chk(id) ? 'warn' : ''}`} />{l}</span>)}
            </div>
            <button className="navbtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme">{theme === 'dark' ? <I.sun /> : <I.moon />}<span className="hide-c">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
      <div className="grain" />
    </Shared.Provider>
  );
}
export const stageLabel = (s: string) => ({ sources: 'Reading', facts: 'Facts ready', questions: 'Waiting on you', storyboard: 'Storyboard', voice: 'Voicing', render: 'Ready to render', done: 'Rendered' } as any)[s] || s;
