'use client';
import { useEffect, useRef, useState } from 'react';
import type { Ctx } from './useProject';
import { api, fileUrl } from './api';
import { SCENE_TYPES } from '@/public/engine/timeline.js';
import type { Fact, Scene, Visual } from '@/lib/types';

const uid = (p: string) => p + Math.random().toString(36).slice(2, 8);
const Next = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={disabled} onClick={onClick}>{label}</button></div>;

// ═════════════ 1. Sources ═════════════
export function SourcesPanel(c: Ctx) {
  const { p } = c;
  const [kind, setKind] = useState<'url' | 'path' | 'text'>('url');
  const [val, setVal] = useState('');
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const add = async () => { if (!val.trim()) return; await c.act('sources', { kind, value: val }); setVal(''); };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; const fd = new FormData(); [...files].forEach((f) => fd.append('files', f));
    await fetch(`/api/projects/${p.id}/sources`, { method: 'POST', body: fd }); await c.reload();
  };
  const ingesting = c.busy('ingest') || c.busy('upload');
  return (<>
    <div className="card col">
      <div className="row between"><h2>Sources</h2><span className="muted small">Everything the video is allowed to say comes from here.</span></div>
      <div className="row wrap">
        <div className="seg">{(['url', 'path', 'text'] as const).map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{{ url: 'URL', path: 'Folder / repo', text: 'Paste' }[k]}</button>)}</div>
        {kind !== 'text' && <input className="grow" style={{ width: 'auto' }} placeholder={kind === 'url' ? 'https://… (we read up to 4 pages and capture screenshots)' : '/absolute/path or ../relative/path'} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />}
        {kind !== 'text' && <button className="btn" onClick={add}>Add</button>}
      </div>
      {kind === 'text' && <><textarea rows={5} placeholder="Transcripts, customer quotes, launch notes, a positioning doc…" value={val} onChange={(e) => setVal(e.target.value)} /><Next label="Add text" onClick={add} /></>}
      <div className={`drop ${over ? 'over' : ''}`} onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        Drop screenshots, logos, a character image, .md/.txt/.csv/.vtt files — or click to choose
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {p.sources.length === 0 ? <div className="empty">No sources yet.</div> : (
        <table className="t"><thead><tr><th>Source</th><th>Read</th><th /></tr></thead><tbody>
          {p.sources.map((s) => <tr key={s.id}>
            <td><div className="row"><span className="pill neu">{s.kind}</span><b className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</b></div><div className="small dim" style={{ marginTop: 3, wordBreak: 'break-all' }}>{s.ref.length > 140 ? s.ref.slice(0, 140) + '…' : s.ref}</div>{s.pages && <div className="small muted" style={{ marginTop: 3 }}>{s.pages.length} page(s): {s.pages.map((x) => x.title).join(' · ').slice(0, 160)}</div>}{s.error && <div className="issue error" style={{ marginTop: 6 }}>{s.error}</div>}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{s.status === 'ready' ? <span className="pill good">{(s.chars / 1000).toFixed(1)}k chars</span> : s.status === 'error' ? <span className="pill bad">error</span> : <span className="pill acc">reading…</span>}</td>
            <td><button className="btn ghost sm" onClick={async () => { await fetch(`/api/projects/${p.id}/sources?sid=${s.id}`, { method: 'DELETE' }); c.reload(); }}>Remove</button></td></tr>)}
        </tbody></table>)}
    </div>
    <Visuals {...c} />
    <Next label={p.facts.length ? 'Re-analyse sources →' : 'Analyse sources →'} disabled={ingesting || !p.sources.some((s) => s.status === 'ready') || c.busy('analyze')} onClick={async () => { await c.act('analyze'); c.go('facts'); }} />
  </>);
}

function Visuals(c: Ctx) {
  const { p } = c;
  const set = (id: string, patch: Partial<Visual>) => c.save({ visuals: p.visuals.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  if (!p.visuals.length) return null;
  return (
    <div className="card col">
      <div className="row between"><h2>Visuals</h2><span className="muted small">{p.visuals.filter((v) => v.use).length} of {p.visuals.length} in use · click to toggle</span></div>
      <div className="grid3">{p.visuals.map((v) => (
        <div key={v.id} className="col" style={{ gap: 6 }}>
          <div className={`vis ${v.use ? 'on' : ''}`} onClick={() => set(v.id, { use: !v.use })} title={v.origin}>
            <img src={fileUrl(p.id, v.file)} alt="" style={{ objectFit: v.kind === 'logo' ? 'contain' : 'cover' }} />
            <span className={`pill tag ${v.kind === 'screenshot' ? 'neu' : 'acc'}`}>{v.kind}</span><span className="id">{v.id}</span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <select value={v.kind} onChange={(e) => set(v.id, { kind: e.target.value as any })} style={{ padding: '4px 6px', fontSize: 12 }}>{['screenshot', 'image', 'logo', 'avatar'].map((k) => <option key={k}>{k}</option>)}</select>
            <button className={`btn sm ${p.intake.avatarVisual === v.id ? 'primary' : ''}`} title="Use as the hero/character image (reveal, end card, HUD)" onClick={() => c.save({ intake: { ...p.intake, avatarVisual: p.intake.avatarVisual === v.id ? '' : v.id } })}>Hero</button>
          </div>
          {v.description && <div className="small muted">{v.description}</div>}
        </div>))}</div>
    </div>
  );
}

// ═════════════ 2. Facts ═════════════
export function FactsPanel(c: Ctx) {
  const { p } = c;
  const [filter, setFilter] = useState<'all' | 'needs-check' | 'off'>('all');
  const setF = (id: string, patch: Partial<Fact>) => c.save({ facts: p.facts.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const shown = p.facts.filter((f) => filter === 'all' || (filter === 'off' ? !f.approved : f.status === 'needs-check'));
  const pr: any = p.product || {};
  if (!p.facts.length) return <div className="card col"><h2>Facts</h2><div className="empty">{c.busy('analyze') ? 'Reading your sources and checking every fact…' : 'Analyse your sources to extract facts, describe visuals and prepare questions.'}</div><Next label="Analyse sources →" disabled={c.busy('analyze')} onClick={() => c.act('analyze')} /></div>;
  return (<>
    {pr.name && <div className="card col">
      <div className="row between"><h2>{pr.name}</h2>{pr.category && <span className="pill neu">{pr.category}</span>}</div>
      {pr.oneLiner && <div style={{ fontSize: 15 }}>{pr.oneLiner}</div>}
      <div className="grid2 small">
        {pr.audience && <div><div className="mono">Audience</div>{pr.audience}</div>}
        {pr.problem && <div><div className="mono">Problem</div>{pr.problem}</div>}
        {pr.differentiator && <div><div className="mono">Differentiator</div>{pr.differentiator}</div>}
        {pr.howItWorks?.length > 0 && <div><div className="mono">How it works</div><ol style={{ margin: '4px 0 0 18px', padding: 0 }}>{pr.howItWorks.map((x: string, i: number) => <li key={i}>{x}</li>)}</ol></div>}
      </div>
      {pr.risks?.length > 0 && <div className="issue warn"><b>Don&apos;t claim:</b> {pr.risks.join(' · ')}</div>}
    </div>}
    <div className="card col">
      <div className="row between wrap">
        <h2>Facts <span className="muted small">({p.facts.filter((f) => f.status === 'verified').length} verified word-for-word · {p.facts.filter((f) => f.approved).length} approved)</span></h2>
        <div className="seg">{(['all', 'needs-check', 'off'] as const).map((k) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{{ all: 'All', 'needs-check': 'Needs check', off: 'Not approved' }[k]}</button>)}</div>
      </div>
      <div className="small muted">Only approved facts can appear in the video. “Verified” means the quote was found word-for-word in a source. Numbers read off screenshots stay “needs check” until you confirm them.</div>
      <table className="t"><thead><tr><th style={{ width: 28 }}>Use</th><th>Fact</th><th style={{ width: 110 }}>Status</th><th style={{ width: 30 }} /></tr></thead><tbody>
        {shown.map((f) => <tr key={f.id} style={{ opacity: f.approved ? 1 : 0.55 }}>
          <td><input type="checkbox" checked={f.approved} onChange={(e) => setF(f.id, { approved: e.target.checked })} style={{ width: 16 }} /></td>
          <td><input value={f.statement} onChange={(e) => setF(f.id, { statement: e.target.value })} style={{ background: 'transparent', border: '1px solid transparent', padding: '2px 4px', fontWeight: 600 }} />
            <div className="small muted" style={{ padding: '2px 4px' }}>“{f.quote}” <span className="dim">— {f.where || f.sourceId}</span> <span className="mono" style={{ fontSize: 10 }}>{f.id}</span></div></td>
          <td>{f.status === 'verified' ? <span className="pill good">verified</span> : <button className="pill warn" style={{ border: 0, cursor: 'pointer' }} title="Click to confirm you checked it" onClick={() => setF(f.id, { status: 'verified' })}>needs check ✓?</button>}</td>
          <td><button className="btn ghost sm" onClick={() => c.save({ facts: p.facts.filter((x) => x.id !== f.id) })}>×</button></td></tr>)}
      </tbody></table>
      <AddFact onAdd={(f) => c.save({ facts: [...p.facts, f] })} />
    </div>
    <Visuals {...c} />
    <Next label="Next: brief →" onClick={() => c.go('brief')} />
  </>);
}
function AddFact({ onAdd }: { onAdd: (f: Fact) => void }) {
  const [s, setS] = useState(''); const [q, setQ] = useState('');
  return <div className="row wrap"><input className="grow" style={{ width: 'auto' }} placeholder="Add a fact you can stand behind (e.g. 1,200 teams use it)" value={s} onChange={(e) => setS(e.target.value)} /><input style={{ width: 260 }} placeholder="Where it comes from" value={q} onChange={(e) => setQ(e.target.value)} />
    <button className="btn" disabled={!s.trim()} onClick={() => { onAdd({ id: uid('u'), statement: s, value: null, kind: 'claim', quote: s, where: q || 'added by user', status: 'verified', approved: true }); setS(''); setQ(''); }}>Add fact</button></div>;
}

// ═════════════ 3. Brief ═════════════
export function BriefPanel(c: Ctx) {
  const { p } = c; const i = p.intake;
  const [voices, setVoices] = useState<{ voices: any[]; enabled: boolean; default: string } | null>(null);
  useEffect(() => { api('/api/voices').then(setVoices).catch(() => setVoices({ voices: [], enabled: false, default: '' })); }, []);
  const set = (patch: Partial<typeof i>) => c.save({ intake: { ...i, ...patch } });
  const F = (k: keyof typeof i, label: string, ph = '', area = false) => <label className="f">{label}{area ? <textarea rows={2} value={String(i[k] ?? '')} placeholder={ph} onChange={(e) => set({ [k]: e.target.value } as any)} /> : <input value={String(i[k] ?? '')} placeholder={ph} onChange={(e) => set({ [k]: e.target.value } as any)} />}</label>;
  const imgs = p.visuals;
  return (<>
    <div className="card col">
      <h2>Brand &amp; goal</h2>
      <div className="grid2">{F('brandName', 'Company / brand', 'AIX')}{F('productName', 'Product name (said in the video)', 'Agent Nick')}</div>
      {F('oneLiner', 'One-liner', 'Your AI content marketer')}
      <div className="grid2">{F('audience', 'Who is it for?', 'B2B marketers ghostwriting for founders')}{F('tone', 'Tone', 'Confident, specific, a little bold')}</div>
      <div className="grid3">{F('cta', 'Call to action (button)', 'Book a demo')}{F('ctaUrl', 'URL shown on end card', 'aixccelerate.com')}{F('byline', 'Byline', 'by AIX')}</div>
      <div className="grid2">{F('mustSay', 'Must say / include', '', true)}{F('mustAvoid', 'Must not say / show', 'Unreleased features, client names…', true)}</div>
    </div>
    <div className="card col">
      <h2>Format &amp; look</h2>
      <div className="row wrap" style={{ gap: 18 }}>
        <label className="f">Length<div className="seg">{[15, 30, 45].map((n) => <button key={n} className={i.length === n ? 'on' : ''} onClick={() => set({ length: n })}>{n}s</button>)}</div></label>
        <label className="f">Formats<div className="row">{(['4x5', '9x16', '1x1'] as const).map((f) => <label key={f} className="row small" style={{ gap: 4 }}><input type="checkbox" style={{ width: 14 }} checked={i.formats.includes(f)} onChange={(e) => set({ formats: e.target.checked ? [...i.formats, f] : i.formats.filter((x) => x !== f) })} />{f.replace('x', ':')}</label>)}</div></label>
        <label className="f">Accent colour<div className="row"><input type="color" className="swatch" value={/^#[0-9a-f]{6}$/i.test(i.accent) ? i.accent : '#F47920'} onChange={(e) => set({ accent: e.target.value })} /><input style={{ width: 100 }} value={i.accent} onChange={(e) => set({ accent: e.target.value })} /></div></label>
        <label className="f grow">Data label (top-left of the video){<input value={i.dataLabel} placeholder="Real data · Oct 2026" onChange={(e) => set({ dataLabel: e.target.value })} />}</label>
      </div>
      <div className="grid2">
        <label className="f">Hero / character image<select value={i.avatarVisual} onChange={(e) => set({ avatarVisual: e.target.value })}><option value="">None (letter mark)</option>{imgs.map((v) => <option key={v.id} value={v.id}>{v.id} · {v.kind} · {v.origin.slice(0, 40)}</option>)}</select></label>
        <label className="f">Voice{voices && !voices.enabled ? <div className="small dim" style={{ padding: '8px 0' }}>Add ELEVENLABS_API_KEY to enable voice-over.</div> : <select value={p.cast?.members?.[0]?.voiceId || i.voiceId || voices?.default || ''} onChange={(e) => { const v = (voices?.voices || []).find((x: any) => x.id === e.target.value); set({ voiceId: e.target.value }); if (p.cast?.members?.length && v) c.save({ cast: { ...p.cast, auto: false, members: p.cast.members.map((m: any, k: number) => (k === 0 ? { ...m, voiceId: v.id, name: v.name.split(' - ')[0], labels: v.labels || {}, preview: v.preview, why: 'Picked by you' } : m)) } as any }); }}>{(voices?.voices || []).map((v) => <option key={v.id} value={v.id}>{v.name}{v.labels?.accent ? ` · ${v.labels.accent}` : ''}{v.labels?.gender ? ` · ${v.labels.gender}` : ''}</option>)}</select>}</label>
      </div>
    </div>
    <div className="card col">
      <div className="row between"><h2>Questions only you can answer</h2><span className="small muted">Leave blank to use the suggestion</span></div>
      {p.questions.length === 0 ? <div className="muted small">Analyse your sources to get tailored questions.</div> : p.questions.map((q) => (
        <label key={q.id} className="f"><span style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 600 }}>{q.question}</span>{q.why && <span className="small dim">{q.why}</span>}
          <textarea rows={2} placeholder={q.suggested ? `Suggested: ${q.suggested}` : ''} value={q.answer} onChange={(e) => c.save({ questions: p.questions.map((x) => (x.id === q.id ? { ...x, answer: e.target.value } : x)) })} /></label>))}
    </div>
    <Next label={p.scenes.length ? 'Regenerate storyboard →' : 'Write the storyboard →'} disabled={c.busy('storyboard') || !p.facts.some((f) => f.approved)} onClick={async () => { if (p.scenes.length && !confirm('Replace the current storyboard?')) return; await c.act('storyboard'); c.go('story'); }} />
  </>);
}

// ═════════════ 4. Storyboard ═════════════
export function StoryboardPanel(c: Ctx) {
  const { p, lay } = c;
  const [sel, setSel] = useState<string | null>(null);
  const [addType, setAddType] = useState('screen');
  const setScenes = (scenes: Scene[]) => c.save({ scenes });
  const move = (k: number, d: number) => { const s = [...p.scenes]; const [x] = s.splice(k, 1); s.splice(k + d, 0, x); setScenes(s); };
  const errors = c.issues.filter((i) => i.level === 'error');
  if (!p.scenes.length) return <div className="card col"><h2>Storyboard</h2><div className="empty">{c.busy('storyboard') ? 'Writing the brief and storyboard…' : 'Fill in the brief, then generate the storyboard.'}</div><Next label="Write the storyboard →" disabled={c.busy('storyboard')} onClick={() => c.act('storyboard')} /></div>;
  return (<>
    {p.brief && (p.brief.concept || p.brief.hook) && <div className="card col">
      <div className="row between"><h2>{p.brief.title || 'Creative brief'}</h2><button className="btn sm" disabled={c.busy('storyboard')} onClick={() => confirm('Replace the whole storyboard?') && c.act('storyboard')}>Regenerate all</button></div>
      <div className="grid2 small">{(['concept', 'insight', 'proposition', 'hook'] as const).map((k) => p.brief![k] ? <div key={k}><div className="mono">{k}</div>{p.brief![k]}</div> : null)}</div>
    </div>}
    {lay.duration > p.intake.length * 1.2 && <div className="issue warn">Runs {lay.duration.toFixed(0)}s against a {p.intake.length}s target — shorten voice lines or remove a scene.</div>}
    <div className="card col" style={{ gap: 8 }}>
      <div className="row between"><h2>Fact check</h2>{errors.length ? <span className="pill bad">{errors.length} blocking</span> : <span className="pill good">every number traced</span>}</div>
      {c.issues.length === 0 ? <div className="small muted">All numbers on screen and in the voice-over come from approved facts.</div> : c.issues.map((i, k) => <div key={k} className={`issue ${i.level}`} style={{ cursor: i.sceneId ? 'pointer' : undefined }} onClick={() => i.sceneId && setSel(i.sceneId)}>{i.message}</div>)}
    </div>
    <div className="col" style={{ gap: 8 }}>
      {p.scenes.map((s, k) => {
        const L = lay.scenes[k]; const iss = c.issues.filter((i) => i.sceneId === s.id);
        return (
          <div key={s.id} className={`scene ${sel === s.id ? 'sel' : ''}`}>
            <div className="hd" onClick={() => { setSel(sel === s.id ? null : s.id); if (L) c.seek(L.start + 0.6); }}>
              <span className="num">{k + 1}</span><span className="pill acc">{SCENE_TYPES[s.type]?.label || s.type}</span>
              <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.vo?.text || <span className="dim">no voice line</span>}</span>
              {iss.some((i) => i.level === 'error') ? <span className="pill bad">fact</span> : iss.length ? <span className="pill warn">check</span> : null}
              {s.vo?.file && <span className="pill good" title="voiced">♪</span>}
              <span className="mono" style={{ width: 44, textAlign: 'right' }}>{L ? L.dur.toFixed(1) + 's' : ''}</span>
            </div>
            {sel === s.id && <SceneEditor c={c} s={s} k={k} onChange={(ns) => setScenes(p.scenes.map((x) => (x.id === s.id ? ns : x)))} onMove={(d) => move(k, d)} onDelete={() => setScenes(p.scenes.filter((x) => x.id !== s.id))} onDup={() => { const s2 = [...p.scenes]; s2.splice(k + 1, 0, { ...JSON.parse(JSON.stringify(s)), id: uid('sc') }); setScenes(s2); }} />}
          </div>);
      })}
    </div>
    <div className="row"><select value={addType} onChange={(e) => setAddType(e.target.value)} style={{ width: 220 }}>{Object.entries(SCENE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <button className="btn" onClick={() => { const ns: Scene = { id: uid('sc'), type: addType as any, vo: { text: '' }, props: {}, facts: [] }; const s = [...p.scenes]; const endIdx = s.findIndex((x) => x.type === 'end'); s.splice(endIdx >= 0 ? endIdx : s.length, 0, ns); setScenes(s); setSel(ns.id); }}>Add scene</button>
      <span className="grow" /><button className="btn primary" onClick={() => c.go('voice')}>Next: voice &amp; music →</button></div>
  </>);
}

function SceneEditor({ c, s, k, onChange, onMove, onDelete, onDup }: { c: Ctx; s: Scene; k: number; onChange: (s: Scene) => void; onMove: (d: number) => void; onDelete: () => void; onDup: () => void }) {
  const [json, setJson] = useState(JSON.stringify(s.props, null, 2));
  const [jerr, setJerr] = useState('');
  const [ins, setIns] = useState('');
  useEffect(() => { setJson(JSON.stringify(s.props, null, 2)); }, [s.props]);
  const set = (patch: Partial<Scene>) => onChange({ ...s, ...patch });
  const n = c.p.scenes.length;
  return (
    <div className="bd">
      <div className="small dim">{SCENE_TYPES[s.type]?.desc}</div>
      <div className="grid2">
        <label className="f">Type<select value={s.type} onChange={(e) => set({ type: e.target.value as any })}>{Object.entries(SCENE_TYPES).map(([k2, v]) => <option key={k2} value={k2}>{v.label}</option>)}</select></label>
        <label className="f">Duration (blank = from voice)<input type="number" step={0.5} min={1.5} max={10} value={s.duration ?? ''} onChange={(e) => set({ duration: e.target.value ? +e.target.value : undefined })} /></label>
      </div>
      <label className="f">Voice line<textarea rows={2} value={s.vo?.text || ''} onChange={(e) => set({ vo: e.target.value ? { ...(s.vo || {}), text: e.target.value } : undefined })} /></label>
      <div className="grid2">
        <label className="f">Caption (blank = voice line)<input value={s.caption || ''} onChange={(e) => set({ caption: e.target.value || undefined })} /></label>
        <label className="f">HUD status (after the reveal)<input value={s.status || ''} onChange={(e) => set({ status: e.target.value || undefined })} /></label>
      </div>
      <label className="f">Scene content (JSON)<textarea className="code" value={json} onChange={(e) => { setJson(e.target.value); try { const v = JSON.parse(e.target.value); setJerr(''); set({ props: v }); } catch (er: any) { setJerr(er.message); } }} />{jerr && <span style={{ color: 'var(--bad)' }}>{jerr}</span>}</label>
      <div className="small muted">Images you can use: {c.p.visuals.filter((v) => v.use).map((v) => v.id).join(', ') || 'none'}</div>
      <label className="f">Facts this scene relies on<input value={(s.facts || []).join(', ')} onChange={(e) => set({ facts: e.target.value.split(/[ ,]+/).filter(Boolean) })} placeholder="f1a2b3, …" /></label>
      <div className="row wrap">
        <input className="grow" style={{ width: 'auto' }} placeholder="Ask AI: “make the line punchier”, “use the pricing screenshot”, “turn this into a quote”…" value={ins} onChange={(e) => setIns(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && ins.trim()) { await c.act(`scenes/${s.id}/revise`, { instruction: ins }); setIns(''); } }} />
        <button className="btn" disabled={!ins.trim() || c.busy('revise')} onClick={async () => { await c.act(`scenes/${s.id}/revise`, { instruction: ins }); setIns(''); }}>{c.busy('revise') ? 'Revising…' : 'Revise with AI'}</button>
      </div>
      <div className="row"><button className="btn sm" disabled={k === 0} onClick={() => onMove(-1)}>↑</button><button className="btn sm" disabled={k === n - 1} onClick={() => onMove(1)}>↓</button><button className="btn sm" onClick={onDup}>Duplicate</button><span className="grow" /><button className="btn sm danger" onClick={() => confirm('Delete this scene?') && onDelete()}>Delete</button></div>
    </div>
  );
}

// ═════════════ 5. Voice & music ═════════════
export function VoicePanel(c: Ctx) {
  const { p } = c;
  const lines = p.scenes.filter((s) => s.vo?.text);
  const voiced = lines.filter((s) => s.vo?.file).length;
  return (<>
    <div className="card col">
      <div className="row between"><h2>Voice-over</h2><span className="small muted">{voiced}/{lines.length} lines voiced · word-timed captions</span></div>
      <table className="t"><tbody>{lines.map((s) => <tr key={s.id}><td style={{ width: 30 }} className="mono">{p.scenes.indexOf(s) + 1}</td><td>{s.vo!.text}</td><td style={{ width: 230 }}>{s.vo?.file ? <audio controls src={fileUrl(p.id, s.vo.file)} style={{ width: 220, height: 30 }} /> : <span className="pill neu">not voiced</span>}</td></tr>)}</tbody></table>
      <div className="row"><span className="small dim grow">Voices are cached — only changed lines are regenerated.</span><button className="btn primary" disabled={c.busy('voice') || !lines.length} onClick={() => c.act('voice')}>{c.busy('voice') ? 'Voicing…' : voiced ? 'Update voice-over' : 'Generate voice-over'}</button></div>
    </div>
    <div className="card col">
      <div className="row between"><h2>Music &amp; sound design</h2><div className="seg">{(['generated', 'none'] as const).map((m) => <button key={m} className={p.music.mode === m ? 'on' : ''} onClick={() => c.save({ music: { mode: m } })}>{m === 'generated' ? 'Original score' : 'No music'}</button>)}</div></div>
      <div className="small muted">An original 120 BPM score is composed to your storyboard: tension before the reveal, a drop on the reveal, a groove under the demo, and a sting on the end card — plus sounds for every counter, click, stamp and keystroke. The voice is ducked on top. Nothing to license.</div>
      {p.audioFile && p.audioHash ? <audio controls src={fileUrl(p.id, p.audioFile)} style={{ width: '100%' }} /> : <div className="small dim">Not built yet (or out of date after edits).</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" disabled={c.busy('audio')} onClick={() => c.act('audio')}>{c.busy('audio') ? 'Building…' : 'Build soundtrack'}</button><button className="btn primary" onClick={() => c.go('render')}>Next: render →</button></div>
    </div>
  </>);
}

// ═════════════ 6. Render ═════════════
export function RenderPanel(c: Ctx) {
  const { p } = c;
  const [fmts, setFmts] = useState<string[]>(p.intake.formats);
  const [override, setOverride] = useState(false);
  const errors = c.issues.filter((i) => i.level === 'error');
  const job = c.jobs.find((j) => j.kind === 'render');
  const name = (p.intake.productName || p.name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video';
  return (<>
    <div className="card col">
      <h2>Render</h2>
      <div className="row wrap">{(['4x5', '9x16', '1x1'] as const).map((f) => <label key={f} className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 14 }} checked={fmts.includes(f)} onChange={(e) => setFmts(e.target.checked ? [...fmts, f] : fmts.filter((x) => x !== f))} />{{ '4x5': '4:5 · LinkedIn / Instagram feed', '9x16': '9:16 · Reels / Stories', '1x1': '1:1 · Square' }[f]}</label>)}</div>
      {!p.scenes.some((s) => s.vo?.file) && <div className="issue warn">No voice-over yet — the video will have music and captions only.</div>}
      {errors.length > 0 && <div className="issue error">{errors.length} number(s) are not backed by an approved fact. Fix them in the storyboard, or <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 14 }} checked={override} onChange={(e) => setOverride(e.target.checked)} />render anyway (I checked them)</label></div>}
      <div className="row"><span className="small dim grow">1080 px wide · 30 fps · H.264 + AAC · −14 LUFS · burned-in captions + .srt + facts ledger</span>
        <button className="btn primary" disabled={!fmts.length || c.busy('render') || (errors.length > 0 && !override)} onClick={() => c.act('render', { formats: fmts, override })}>{c.busy('render') ? 'Rendering…' : 'Render video'}</button></div>
      {job && (job.status === 'running' || job.status === 'queued') && <div className="col" style={{ gap: 6 }}><div className="bar"><i style={{ width: `${job.progress}%` }} /></div><div className="small muted">{job.message}</div></div>}
    </div>
    {p.renders.length > 0 && <div className="col" style={{ gap: 12 }}>
      {p.renders.map((r) => <div key={r.id} className="card col">
        <div className="row between"><h3>{r.format.replace('x', ':')} · {r.duration.toFixed(1)}s</h3><span className="small muted">{new Date(r.at).toLocaleString()} · {(r.bytes / 1e6).toFixed(1)} MB</span></div>
        <video controls src={fileUrl(p.id, r.file)} style={{ maxHeight: 520 }} />
        <div className="row wrap"><a className="btn primary sm" href={fileUrl(p.id, r.file) + '?download'}>Download MP4</a>{r.srt && <a className="btn sm" href={fileUrl(p.id, r.srt) + '?download'}>Captions .srt</a>}<a className="btn sm" href={fileUrl(p.id, `renders/${name}_FACTS.md`)} target="_blank" rel="noreferrer">Facts ledger</a><span className="small dim grow" style={{ textAlign: 'right', wordBreak: 'break-all' }}>data/projects/{p.id}/{r.file}</span></div>
      </div>)}
    </div>}
  </>);
}
