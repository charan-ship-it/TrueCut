'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { I } from './icons';
import { detectSources, type Attachment } from '@truecut/shared/detect';
import { DIRECTIONS } from '@truecut/engine/styles.js';

export type Options = { kind: string; length: number; formats: string[]; preset: string };
export const KINDS = [
  { id: 'ad', label: 'Ad', hint: 'Hook, reveal, proof, CTA' },
  { id: 'explainer', label: 'Explainer', hint: 'How it works, step by step' },
  { id: 'launch', label: 'Launch', hint: 'Big news, high energy' },
  { id: 'social', label: 'Social clip', hint: 'One idea, 15 seconds' },
  { id: 'talk', label: 'Founder talk', hint: 'Podcast or talking head → illustrated short' },
];
const LENGTHS = [{ v: 0, l: 'Auto', s: 'Nick picks from your sources' }, { v: 15, l: '15 seconds', s: 'Stories, Reels hooks' }, { v: 30, l: '30 seconds', s: 'The classic ad' }, { v: 45, l: '45 seconds', s: 'Room for proof' }, { v: 60, l: '60 seconds', s: 'Explainers' }];
const FORMATS = [{ id: '4x5', l: '4:5', s: 'LinkedIn + Instagram feed' }, { id: '9x16', l: '9:16', s: 'Reels, Stories, Shorts' }, { id: '1x1', l: '1:1', s: 'Square' }];
const SLASH = [
  { c: '/render', d: 'Voice, score and render the video' },
  { c: '/shorter', d: 'Cut it down by ten seconds' },
  { c: '/angles', d: 'Pitch me three new angles' },
  { c: '/storyboard', d: 'Rewrite the storyboard' },
  ...Object.entries(DIRECTIONS).map(([k, d]: any) => ({ c: `/direction ${k}`, d: d.label + ', ' + d.vibe.split('.')[0].toLowerCase() })),
];

export default function Composer({ onSend, busy, placeholder, options, setOptions, autoFocus, compact }: {
  onSend: (text: string, atts: Attachment[], files: File[]) => void | Promise<void>; busy?: boolean; placeholder?: string;
  options?: Options; setOptions?: (o: Options) => void; autoFocus?: boolean; compact?: boolean;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [focus, setFocus] = useState(false);
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const found = useMemo(() => detectSources(text).filter((a) => !removed.includes(a.ref)), [text, removed]);
  const slash = text.startsWith('/') && !text.includes('\n') ? SLASH.filter((s) => s.c.startsWith(text.trim().toLowerCase()) || text.trim().length <= 1).slice(0, 7) : [];
  useEffect(() => { const t = ta.current; if (!t) return; t.style.height = 'auto'; t.style.height = Math.min(240, t.scrollHeight) + 'px'; }, [text]);
  useEffect(() => { if (autoFocus) ta.current?.focus(); }, [autoFocus]);
  useEffect(() => { setHi(0); }, [text]);
  // window-level drag & drop
  useEffect(() => {
    let depth = 0;
    const en = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { depth++; setOver(true); } };
    const lv = () => { depth = Math.max(0, depth - 1); if (!depth) setOver(false); };
    const ov = (e: DragEvent) => e.preventDefault();
    const dr = (e: DragEvent) => { e.preventDefault(); depth = 0; setOver(false); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) setFiles((x) => [...x, ...fs]); };
    window.addEventListener('dragenter', en); window.addEventListener('dragleave', lv); window.addEventListener('dragover', ov); window.addEventListener('drop', dr);
    return () => { window.removeEventListener('dragenter', en); window.removeEventListener('dragleave', lv); window.removeEventListener('dragover', ov); window.removeEventListener('drop', dr); };
  }, []);
  const can = !busy && (text.trim() || files.length);
  async function go(t = text) {
    if (busy || (!t.trim() && !files.length)) return;
    const atts = detectSources(t).filter((a) => !removed.includes(a.ref));
    const fs = files;
    setText(''); setFiles([]); setRemoved([]);
    await onSend(t.trim(), atts, fs);
  }
  const pick = (c: string) => { if (c.startsWith('/direction')) { go(c); return; } go(c); };
  const kind = KINDS.find((k) => k.id === options?.kind);
  return (
    <>
      <div className={`composer ${focus ? 'focus' : ''} ${over ? 'over' : ''}`} onClick={() => ta.current?.focus()}>
        {(found.length > 0 || files.length > 0) && (
          <div className="pills">
            {found.map((a) => <span key={a.ref} className="spill" title={a.ref}><span className="ico">{a.kind === 'url' ? <I.link size={11} /> : <I.folder size={11} />}</span><span className="ell">{a.label}</span><button onClick={(e) => { e.stopPropagation(); setRemoved((r) => [...r, a.ref]); }} title="Don't read this">×</button></span>)}
            {files.map((f, i) => <span key={i} className="spill" title={f.name}><span className="ico"><I.file size={11} /></span><span className="ell">{f.name}</span><span className="tc xs">{fmtBytes(f.size)}</span><button onClick={(e) => { e.stopPropagation(); setFiles((x) => x.filter((_, j) => j !== i)); }}>×</button></span>)}
          </div>
        )}
        <textarea id="nm-composer" ref={ta} rows={1} value={text} placeholder={placeholder || 'Paste a link, a folder path, or describe the video…'}
          onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); setFiles((x) => [...x, ...fs]); } }}
          onKeyDown={(e) => {
            if (slash.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : slash.length - 1)) % slash.length); return; }
            if (slash.length && (e.key === 'Tab')) { e.preventDefault(); setText(slash[hi].c); return; }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (slash.length && text.trim() !== slash[hi].c) { pick(slash[hi].c); return; } go(); }
          }} />
        {slash.length > 0 && focus && (
          <div className="menu up" style={{ left: 12 }} onMouseDown={(e) => e.preventDefault()}>
            {slash.map((s, i) => <button key={s.c} className={i === hi ? 'hi' : ''} onClick={() => pick(s.c)}><span className="tc" style={{ color: 'var(--ink)', minWidth: 130 }}>{s.c}</span><small className="ell">{s.d}</small></button>)}
          </div>
        )}
        <div className="bar2">
          <button className="opt" title="Attach files (or drop them anywhere)" onClick={(e) => { e.stopPropagation(); fileIn.current?.click(); }}><I.clip size={15} />{!compact && 'Attach'}</button>
          <input ref={fileIn} id="nm-attach" type="file" multiple hidden onChange={(e) => { const fs = [...(e.target.files || [])]; setFiles((x) => [...x, ...fs]); e.target.value = ''; }} />
          {options && setOptions && <>
            <Drop id="kind" menu={menu} setMenu={setMenu} label={<><I.film size={15} />{kind?.label}</>}>
              {KINDS.map((k) => <button key={k.id} onClick={() => { setOptions({ ...options, kind: k.id, length: options.length || (k.id === 'social' ? 15 : 0) }); setMenu(null); }}><span>{k.label}<small>{k.hint}</small></span>{options.kind === k.id && <span className="ck"><I.check size={14} /></span>}</button>)}
            </Drop>
            <Drop id="len" menu={menu} setMenu={setMenu} label={<><I.clock size={15} />{options.length ? `${options.length}s` : 'Auto length'}</>}>
              {LENGTHS.map((k) => <button key={k.v} onClick={() => { setOptions({ ...options, length: k.v }); setMenu(null); }}><span>{k.l}<small>{k.s}</small></span>{options.length === k.v && <span className="ck"><I.check size={14} /></span>}</button>)}
            </Drop>
            <Drop id="fmt" menu={menu} setMenu={setMenu} label={<><I.frame size={15} />{options.formats.map((f) => f.replace('x', ':')).join(' + ')}</>}>
              {FORMATS.map((k) => { const on = options.formats.includes(k.id); return <button key={k.id} onClick={() => { const n = on ? options.formats.filter((x) => x !== k.id) : [...options.formats, k.id]; if (n.length) setOptions({ ...options, formats: n }); }}><span>{k.l}<small>{k.s}</small></span>{on && <span className="ck"><I.check size={14} /></span>}</button>; })}
            </Drop>
            <Drop id="dir" menu={menu} setMenu={setMenu} label={<><I.palette size={15} />{options.preset ? DIRECTIONS[options.preset]?.label : 'Nick picks the look'}</>}>
              <button onClick={() => { setOptions({ ...options, preset: '' }); setMenu(null); }}><span>Let Nick decide<small>He pitches three angles, each with its own look</small></span>{!options.preset && <span className="ck"><I.check size={14} /></span>}</button>
              {Object.entries(DIRECTIONS).map(([k, d]: any) => <button key={k} onClick={() => { setOptions({ ...options, preset: k }); setMenu(null); }}><span style={{ width: 14, height: 14, borderRadius: 4, background: d.palette.bg, border: `3px solid ${d.palette.accent}`, flex: 'none' }} /><span>{d.label}<small className="ell" style={{ maxWidth: 200 }}>{d.vibe.split('.')[0]}</small></span>{options.preset === k && <span className="ck"><I.check size={14} /></span>}</button>)}
            </Drop>
          </>}
          <span className="grow" />
          {!compact && <span className="dim xs hide-sm" style={{ marginRight: 6 }}>{text.startsWith('/') ? 'Tab to complete' : <><span className="kbd">/</span> for commands</>}</span>}
          <button className="send" disabled={!can} onClick={(e) => { e.stopPropagation(); go(); }} title="Send (Enter)">{busy ? <span className="spin" /> : <I.arrowUp size={18} />}</button>
        </div>
      </div>
      {over && <div className="dropveil"><div><div className="serif" style={{ fontSize: 40 }}>Drop it <i>here</i></div><div className="muted">Docs, screenshots, PDFs, transcripts, logos. Nick reads them all.</div></div></div>}
    </>
  );
}

function Drop({ id, menu, setMenu, label, children }: { id: string; menu: string | null; setMenu: (m: string | null) => void; label: React.ReactNode; children: React.ReactNode }) {
  const open = menu === id;
  useEffect(() => { if (!open) return; const c = () => setMenu(null); setTimeout(() => window.addEventListener('click', c), 0); return () => window.removeEventListener('click', c); }, [open, setMenu]);
  return <span style={{ position: 'relative' }}><button className={`opt ${open ? 'open' : ''}`} onClick={(e) => { e.stopPropagation(); setMenu(open ? null : id); }}>{label}</button>{open && <div className="menu down" style={{ left: 0 }} onClick={(e) => e.stopPropagation()}>{children}</div>}</span>;
}
export const fmtBytes = (n: number) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
