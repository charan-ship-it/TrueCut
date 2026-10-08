'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject, type Ctx, type Tab } from './useProject';
import Composer from './Composer';
import Monitor from './Monitor';
import { Card } from './cards';
import { I, TrueCutMark } from './icons';
import { SourcesPanel, FactsPanel, BriefPanel, StoryboardPanel, VoicePanel, RenderPanel } from './panels';
import { useShared } from './Shell';
import { api } from './api';
import { DIRECTIONS, resolveStyle, rgb, contrast } from '@truecut/engine/styles.js';
import type { Attachment } from '@truecut/shared/detect';

const TABS: { id: Tab; label: string }[] = [
  { id: 'sources', label: 'Sources' }, { id: 'facts', label: 'Facts & visuals' }, { id: 'brief', label: 'Brief' },
  { id: 'story', label: 'Storyboard' }, { id: 'voice', label: 'Voice & music' }, { id: 'render', label: 'Render' },
];

export default function Studio({ id }: { id: string }) {
  const P = useProject(id);
  const { refresh } = useShared();
  const [drawer, setDrawer] = useState<Tab | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const seekRef = useRef<(t: number) => void>(() => {});
  const thread = useRef<HTMLDivElement>(null);
  const n = P.data?.project.chat.length || 0;
  const lastSig = P.data ? JSON.stringify(P.data.project.chat[n - 1]?.cards || '').length + n : 0;
  const stick = useRef(true);
  useEffect(() => { const el = thread.current; if (!el) return; if (stick.current) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: n <= 2 ? 'auto' : 'smooth' })); }, [lastSig, n]);
  useEffect(() => { if (P.toast) { const t = setTimeout(() => P.setToast(''), 6000); return () => clearTimeout(t); } }, [P.toast]); // eslint-disable-line
  const busyPrev = useRef(false);
  useEffect(() => { const b = !!P.data?.project.agentBusy; if (busyPrev.current !== b) { busyPrev.current = b; refresh(); } }, [P.data?.project.agentBusy]); // eslint-disable-line

  const p = P.data?.project;
  const S = useMemo(() => (p ? resolveStyle(preview ? { ...p.style, preset: preview } : p.style || {}, p.intake.accent) : null), [p?.style, p?.intake.accent, preview]); // eslint-disable-line
  if (P.err) return <div className="page"><div className="issue error">{P.err}</div><a className="btn" href="/" style={{ marginTop: 12 }}>← Studio</a></div>;
  if (!P.data || !P.lay || !p || !S) return <div className="studio"><div className="chatcol"><div className="chathd" /><div className="thread"><div className="inner"><div className="muted small row"><span className="spin" />Opening…</div></div></div></div><div className="monitor" /></div>;

  const uiAccent = [S.palette.accent, S.palette.accent2, '#F47920'].find((c: string) => contrast(c, '#0C0B0A') >= 3 && contrast(c, '#F4F1EB') >= 1.6) || '#F47920';
  const [r, g, b] = rgb(uiAccent);
  const tint: any = { '--a': uiAccent, '--ar': `${r},${g},${b}`, '--ai': contrast('#FFFFFF', uiAccent) >= 2.6 ? '#FFFFFF' : '#111111' };
  const ctx: Ctx = { p, issues: P.data.issues, jobs: P.data.jobs, save: P.save, act: P.act, reload: P.reload, busy: (k) => P.data!.jobs.some((j) => j.kind === k && (j.status === 'running' || j.status === 'queued')), seek: (t) => seekRef.current(t), lay: P.lay, go: setDrawer as any };
  const busy = p.agentBusy;
  const send = (action: any, files?: File[]) => P.send(action, files);
  // projects made before chat existed get a catch-up message so the cards are still there
  const chat = p.chat.length || !p.scenes.length ? p.chat : [{ id: 'catchup', role: 'nick' as const, text: `Here's where **${p.name}** stands: ${p.scenes.length} scenes, ready to tweak or render.`, cards: [{ kind: 'storyboard' }, { kind: 'directions' }], replies: ['Render it', 'Try another look'], attachments: [], at: p.updatedAt }];
  const lastNick = [...chat].reverse().find((m) => m.role === 'nick');
  const onSend = (text: string, atts: Attachment[], files: File[]) => send({ type: 'message', text, attachments: atts }, files);

  return (
    <div className="studio" style={tint}>
      <div className="chatcol">
        <div className="chathd">
          <input className="title" value={p.name} onChange={(e) => P.save({ name: e.target.value })} onBlur={() => refresh()} />
          <span className="tag" style={{ ['--pa' as any]: S.palette.accent, background: 'var(--panel2)', color: 'var(--mu)' }}><i />{DIRECTIONS[S.preset]?.label}</span>
          <span className="grow" />
          {busy && <span className="row xs muted" style={{ gap: 6, whiteSpace: 'nowrap' }}><span className="dot busy" />Nick is working</span>}
          <button className="btn sm" onClick={() => setDrawer('story')} title="Every setting, by hand"><I.sliders size={14} />Edit bay</button>
          <button className="btn ghost icon sm" title="Delete video" onClick={async () => { if (!confirm(`Delete “${p.name}” and all its files?`)) return; await api(`/api/projects/${id}`, { method: 'DELETE' }); location.href = '/'; }}><I.trash size={15} /></button>
        </div>
        <div className="thread" ref={thread} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
          <div className="inner">
            {chat.length === 0 && <Welcome />}
            {chat.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.role === 'nick' && <span className="av"><TrueCutMark size={28} /></span>}
                <div className="body">
                  {m.attachments?.length > 0 && <div className="att">{m.attachments.map((a, i) => <span key={i} className="spill"><span className="ico">{a.kind === 'url' ? <I.link size={11} /> : a.kind === 'path' ? <I.folder size={11} /> : <I.file size={11} />}</span><span className="ell">{a.label}</span></span>)}</div>}
                  {m.text && (m.role === 'user' ? <div className="bubble">{m.text}</div> : <div className="say" dangerouslySetInnerHTML={{ __html: md(m.text) }} />)}
                  {m.cards.map((c: any, i: number) => <Card key={i} c={c} ctx={ctx} send={send} busy={busy} msgId={m.id} latest={m.id === lastNick?.id} setPreview={setPreview} chat={chat as any} />)}
                  {m.role === 'nick' && m.replies?.length > 0 && m.id === lastNick?.id && !busy && <div className="replies">{m.replies.map((r) => <button key={r} className="chip" onClick={() => send({ type: 'reply', text: r })}>{r}</button>)}</div>}
                </div>
              </div>
            ))}
            {busy && !p.chat[p.chat.length - 1]?.cards.some((c: any) => c.kind === 'progress' && !c.done) && <div className="msg nick"><span className="av"><TrueCutMark size={28} /></span><div className="body"><div className="say shimmer">Thinking…</div></div></div>}
          </div>
        </div>
        <div className="chatfoot"><Composer onSend={onSend} busy={busy} compact placeholder={p.scenes.length ? 'Ask for a change: “punchier hook”, “cut a 15s version”, “/direction neon”…' : 'Add another link, a path or a file, or just answer Nick…'} /></div>
      </div>
      <Monitor p={p} comp={P.comp} lay={P.lay} style={preview ? { ...p.style, preset: preview } : undefined} bindSeek={(f) => (seekRef.current = f)} issues={P.data.issues} onRender={() => send({ type: 'render' })} busy={busy} />
      {drawer && <>
        <div className="scrim" onClick={() => setDrawer(null)} />
        <div className="drawer" style={tint}>
          <div className="row between" style={{ padding: '14px 18px 4px' }}><div><div className="mono">Edit bay</div><h2 className="serif" style={{ fontSize: 26, fontWeight: 400 }}>Every setting, by hand</h2></div><button className="btn ghost icon" onClick={() => setDrawer(null)}><I.x /></button></div>
          <div className="tabs">{TABS.map((t, i) => <div key={t.id} className={`tab ${drawer === t.id ? 'on' : ''}`} onClick={() => setDrawer(t.id)}><span className="n">{i + 1}</span>{t.label}</div>)}</div>
          <div className="scroll" style={{ flex: 1, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {drawer === 'sources' && <SourcesPanel {...ctx} />}
            {drawer === 'facts' && <FactsPanel {...ctx} />}
            {drawer === 'brief' && <BriefPanel {...ctx} />}
            {drawer === 'story' && <StoryboardPanel {...ctx} />}
            {drawer === 'voice' && <VoicePanel {...ctx} />}
            {drawer === 'render' && <RenderPanel {...ctx} />}
          </div>
        </div>
      </>}
      {P.toast && <div className="toast card"><div className="row between"><span className="small">{P.toast}</span><button className="btn ghost sm" onClick={() => P.setToast('')}>×</button></div></div>}
    </div>
  );
}

function Welcome() {
  return <div className="msg nick"><span className="av"><TrueCutMark size={28} /></span><div className="body"><div className="say">Hi, I&apos;m Nick. Give me your website, a repo or folder path, docs or notes, and I&apos;ll read them, show you what I found, and pitch three ways to tell the story.</div></div></div>;
}
export const md = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<span class="tc">$1</span>');
