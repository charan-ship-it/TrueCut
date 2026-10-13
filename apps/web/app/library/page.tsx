'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, timeAgo } from '../../components/api';
import { I } from '../../components/icons';
import { useShared } from '../../components/Shell';

type Asset = { id: string; title: string; url: string | null; domain: string | null; product: string | null; tags: string[]; source: string; w: number; h: number; status: string; error: string | null; createdBy?: string; capturedAt: string; image: string; thumb: string; summary: string; kind: string | null; numbers: { value: number; label: string; quote: string }[]; text: string; sensitive: { has: boolean; kinds: string[]; note?: string } };

export default function LibraryPage() {
  const [items, setItems] = useState<Asset[] | null>(null); const [products, setProducts] = useState<{ product: string; count: number }[]>([]);
  const [q, setQ] = useState(''); const [product, setProduct] = useState(''); const [more, setMore] = useState(false);
  const [open, setOpen] = useState<Asset | null>(null); const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [uploading, setUploading] = useState(0); const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qs = useCallback((offset = 0) => `/api/library?limit=60&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}${product ? `&product=${encodeURIComponent(product)}` : ''}`, [q, product]);
  const load = useCallback(async () => { try { const r = await api(qs()); setItems(r.items); setMore(r.more); if (r.products) setProducts(r.products); } catch (e: any) { setMsg({ t: e.message, bad: true }); } }, [qs]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);
  // keep polling while anything is still being read
  useEffect(() => { if (!items?.some((a) => a.status === 'pending')) return; const t = setTimeout(load, 2500); return () => clearTimeout(t); }, [items, load]);

  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
    if (!imgs.length) { setMsg({ t: 'Drop PNG, JPEG or WebP images.', bad: true }); return; }
    setUploading(imgs.length); setMsg(null);
    let dup = 0, failed = 0;
    for (const f of imgs) {
      const fd = new FormData(); fd.append('image', f); if (product) fd.append('product', product);
      try { const r = await fetch('/api/library', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Upload failed'); dup += j.items.filter((x: any) => x.duplicate).length; }
      catch (e: any) { failed++; setMsg({ t: `${f.name}: ${e.message}`, bad: true }); }
      setUploading((n) => n - 1);
    }
    if (!failed) setMsg({ t: `Added ${imgs.length - dup} screenshot${imgs.length - dup === 1 ? '' : 's'}${dup ? ` (${dup} already in the Library)` : ''}. Nick is reading them.` });
    load();
  };
  // paste a screenshot straight from the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const t = e.target as HTMLElement; if (/INPUT|TEXTAREA/.test(t?.tagName)) return; const f = [...(e.clipboardData?.files || [])]; if (f.length) { e.preventDefault(); upload(f); } };
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste);
  });

  const loadMore = async () => { const r = await api(qs(items?.length || 0)); setItems([...(items || []), ...r.items]); setMore(r.more); };

  return (
    <div className="page" onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }} onDrop={(e) => { e.preventDefault(); setOver(false); upload([...e.dataTransfer.files]); }}>
      <div className="row between wrap" style={{ margin: '8px 0 6px' }}>
        <h1 className="serif" style={{ fontSize: 40, fontWeight: 400, margin: 0 }}>Library</h1>
        <div className="row"><a className="btn sm ghost" href="/settings?tab=extension"><I.image size={14} />Get the capture extension</a><button className="btn primary sm" onClick={() => fileRef.current?.click()} disabled={!!uploading}><I.upload size={14} />{uploading ? `Uploading ${uploading}…` : 'Upload'}</button></div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { upload([...(e.target.files || [])]); e.target.value = ''; }} />
      </div>
      <p className="muted small" style={{ margin: '0 0 16px' }}>Real product screens the team captured. Nick reads each one (text, numbers, any personal data) and uses matching shots when he makes a video. Drop or paste images here, or capture them with the extension.</p>
      <div className="row wrap" style={{ marginBottom: 16, gap: 8 }}>
        <input placeholder="Search titles, products and on-screen text…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 340 }} aria-label="Search the library" />
        <button className={`chip ${!product ? 'on' : ''}`} onClick={() => setProduct('')}>All</button>
        {products.slice(0, 12).map((p) => <button key={p.product} className={`chip ${product === p.product ? 'on' : ''}`} onClick={() => setProduct(product === p.product ? '' : p.product)}>{p.product} <span className="tc">{p.count}</span></button>)}
      </div>
      {msg && <div className={`issue ${msg.bad ? 'error' : 'warn'}`} style={{ marginBottom: 14 }}>{msg.t}</div>}
      {over && <div className="dropzone">Drop screenshots to add them to the Library</div>}
      {items === null ? <div className="dim small">Loading…</div> : !items.length ? (
        <div className="empty" style={{ padding: 48 }}><div className="serif" style={{ fontSize: 26, color: 'var(--ink)', marginBottom: 6 }}>{q || product ? 'No matches' : 'No screenshots yet'}</div>{q || product ? 'Try another search.' : 'Capture product screens with the TrueCut extension, or drop images here.'}</div>
      ) : (<>
        <div className="libgrid">{items.map((a) => (
          <button key={a.id} className="libcard" onClick={() => setOpen(a)} title={a.summary || a.title}>
            <span className="shot"><img src={a.thumb} alt={a.summary || a.title} loading="lazy" /></span>
            <span className="meta"><span className="ell" style={{ fontWeight: 500 }}>{a.title}</span>
              <span className="row xs dim" style={{ gap: 6 }}>{a.status === 'pending' ? <><span className="dot busy" />Reading…</> : a.error ? <span style={{ color: 'var(--warn)' }}>Not read</span> : <>{a.product || a.domain || 'Screenshot'}</>}<span className="grow" />{a.sensitive.has && <span className="pill warn" title={a.sensitive.note || a.sensitive.kinds.join(', ')}>Personal data</span>}</span>
            </span>
          </button>))}
        </div>
        {more && <div style={{ textAlign: 'center', marginTop: 16 }}><button className="btn" onClick={loadMore}>Load more</button></div>}
      </>)}
      {open && <Detail a={open} onClose={() => setOpen(null)} onChange={(x) => { setOpen(x); setItems((list) => list?.map((i) => (i.id === x.id ? x : i)) || null); }} onDelete={() => { setItems((list) => list?.filter((i) => i.id !== open.id) || null); setOpen(null); }} />}
    </div>
  );
}

function Detail({ a, onClose, onChange, onDelete }: { a: Asset; onClose: () => void; onChange: (a: Asset) => void; onDelete: () => void }) {
  const { projects } = useShared();
  const [title, setTitle] = useState(a.title); const [product, setProduct] = useState(a.product || ''); const [tags, setTags] = useState(a.tags.join(', '));
  const [pid, setPid] = useState(''); const [note, setNote] = useState<{ t: string; bad?: boolean } | null>(null); const [showText, setShowText] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const patch = async (b: any) => { try { onChange(await api(`/api/library/${a.id}`, { method: 'PATCH', json: b })); setNote({ t: 'Saved.' }); } catch (e: any) { setNote({ t: e.message, bad: true }); } };
  const reread = async () => { try { await api(`/api/library/${a.id}/reread`, { json: {} }); onChange({ ...a, status: 'pending', error: null }); setNote({ t: 'Reading it again…' }); } catch (e: any) { setNote({ t: e.message, bad: true }); } };
  const del = async () => { if (!window.confirm('Delete this screenshot from the Library? Videos that already use it keep their copy.')) return; try { await api(`/api/library/${a.id}`, { method: 'DELETE' }); onDelete(); } catch (e: any) { setNote({ t: e.message, bad: true }); } };
  const use = async () => { if (!pid) return; try { const r = await api(`/api/projects/${pid}/library`, { json: { ids: [a.id] } }); setNote({ t: r.added.length ? 'Added to the video. Ask Nick to use it in the storyboard.' : 'That video already has this shot.' }); } catch (e: any) { setNote({ t: e.message, bad: true }); } };
  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={a.title}>
        <div className="row" style={{ marginBottom: 12 }}><b className="grow ell">{a.title}</b><button className="btn icon sm ghost" onClick={onClose} aria-label="Close"><I.x /></button></div>
        <a href={a.image} target="_blank" rel="noreferrer" className="bigshot"><img src={a.image} alt={a.summary || a.title} /></a>
        <div className="xs dim" style={{ margin: '8px 0 14px' }}>{a.w}×{a.h} · {a.source === 'extension' ? 'captured' : a.source === 'website' ? 'saved from the website' : 'uploaded'} {timeAgo(a.capturedAt)}{a.createdBy ? ` by ${a.createdBy}` : ''}{a.url ? <> · <a href={a.url} target="_blank" rel="noreferrer">{a.domain || 'source'}</a></> : ''}</div>
        {a.sensitive.has && <div className="issue warn" style={{ marginBottom: 12 }}><b>Shows personal data</b> ({a.sensitive.kinds.join(', ').replace(/_/g, ' ') || 'personal details'}){a.sensitive.note ? `: ${a.sensitive.note}` : ''}. Nick won't put it on screen unless someone confirms it's fine. <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => patch({ sensitiveOk: true })}>It's fine to show</button></div>}
        {a.status === 'pending' ? <div className="small muted"><span className="dot busy" /> Nick is reading this screenshot…</div> : a.error ? <div className="issue warn">{a.error} <button className="btn sm" onClick={reread}>Read again</button></div> : (
          <div className="col" style={{ gap: 10 }}>
            {a.summary && <p className="small" style={{ margin: 0 }}>{a.summary}</p>}
            {!!a.numbers.length && <div><div className="xs muted" style={{ marginBottom: 6 }}>Numbers on screen (usable as sourced facts)</div><div className="row wrap" style={{ gap: 6 }}>{a.numbers.map((n, i) => <span key={i} className="pill acc" title={n.quote}>{n.value.toLocaleString()} · {n.label}</span>)}</div></div>}
            {a.text && <div><button className="btn sm ghost" onClick={() => setShowText(!showText)}>{showText ? 'Hide' : 'Show'} on-screen text</button>{showText && <pre className="ocr">{a.text}</pre>}</div>}
          </div>)}
        <div className="col" style={{ gap: 10, marginTop: 16 }}>
          <label className="f">Title<input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== a.title && patch({ title })} /></label>
          <label className="f">Product<input value={product} onChange={(e) => setProduct(e.target.value)} onBlur={() => product !== (a.product || '') && patch({ product: product || null })} placeholder="e.g. Agent Nick" /></label>
          <label className="f">Tags<input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => tags !== a.tags.join(', ') && patch({ tags: tags.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="inbox, dashboard" /></label>
          <div className="row"><select value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Video to add this to"><option value="">Add to a video…</option>{(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="btn sm primary" disabled={!pid} onClick={use}>Add</button></div>
          <div className="row"><button className="btn sm" onClick={reread} disabled={a.status === 'pending'}>Read again</button><span className="grow" /><button className="btn sm ghost danger" onClick={del}><I.trash size={14} />Delete</button></div>
          {note && <div className="xs" style={{ color: note.bad ? 'var(--bad)' : 'var(--mu)' }}>{note.t}</div>}
        </div>
      </aside>
    </div>
  );
}
