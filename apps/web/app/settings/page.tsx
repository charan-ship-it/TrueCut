'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../components/api';
import { I } from '../../components/icons';

type Tab = 'profile' | 'keys' | 'models' | 'skills' | 'usage' | 'extension';
const TABS: [Tab, string][] = [['profile', 'Profile'], ['keys', 'API keys'], ['models', 'Models & budget'], ['skills', 'Skills'], ['usage', 'Usage'], ['extension', 'Capture extension']];

export default function SettingsPage() { return <Suspense fallback={null}><Settings /></Suspense>; }

function Settings() {
  const sp = useSearchParams(); const r = useRouter();
  const tab = (TABS.find(([k]) => k === sp.get('tab'))?.[0] || 'profile') as Tab;
  const [s, setS] = useState<any>(null); const [err, setErr] = useState('');
  const load = useCallback(() => api('/api/settings').then(setS).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="page settings">
      <h1 className="serif" style={{ fontSize: 40, fontWeight: 400, margin: '8px 0 6px' }}>Settings</h1>
      <p className="muted small" style={{ margin: '0 0 18px' }}>{s ? <>You are {s.role === 'owner' ? 'an owner' : 'a member'} of this workspace.{s.role !== 'owner' ? ' Owners manage the shared key, models and budget.' : ''}</> : ' '}</p>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => r.replace(`/settings?tab=${k}`)}>{l}</button>)}</div>
      {err && <div className="issue error" style={{ marginTop: 16 }}>{err}</div>}
      <div style={{ marginTop: 20 }}>
        {!s ? <div className="dim small">Loading…</div>
          : tab === 'profile' ? <Profile />
          : tab === 'keys' ? <Keys s={s} reload={load} />
          : tab === 'models' ? <Models s={s} setS={setS} />
          : tab === 'skills' ? <Skills />
          : tab === 'usage' ? <Usage />
          : <Extension />}
      </div>
    </div>
  );
}

// ───────── Profile ─────────
function Profile() {
  const [me, setMe] = useState<any>(null); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  useEffect(() => { api('/api/me').then((m) => { setMe(m); setName(m.user.name || ''); }).catch((e) => setMsg({ t: e.message, bad: true })); }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { const r = await api('/api/me', { method: 'PATCH', json: { name } }); setName(r.name); setMsg({ t: 'Saved.' }); window.dispatchEvent(new Event('tc-me')); }
    catch (err: any) { setMsg({ t: err.message, bad: true }); }
    setBusy(false);
  };
  if (!me) return <div className="dim small">Loading…</div>;
  return (
    <div className="ccard" style={{ maxWidth: 560 }}>
      <div className="hd"><h3>Your profile</h3></div>
      <form className="bd col" style={{ gap: 14 }} onSubmit={save}>
        <label className="f"><span>Name</span><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Your name" disabled={!me.auth} /></label>
        <div className="xs dim">Shown in the sidebar and next to the videos you make.{!me.auth ? ' Sign-in is off on this machine, so there is no profile to save.' : ''}</div>
        <label className="f"><span>Email</span><input value={me.user.email} disabled readOnly /></label>
        {me.auth && <div className="row" style={{ gap: 10, alignItems: 'center' }}><button className="btn primary" disabled={busy || !name.trim() || name.trim() === me.user.name}>{busy ? 'Saving…' : 'Save'}</button>{msg && <span className={`xs ${msg.bad ? 'bad' : 'muted'}`}>{msg.t}</span>}</div>}
      </form>
    </div>
  );
}

// ───────── API keys ─────────
const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic (Claude)', powers: 'Reading sources, angles, storyboards, casting, the founder-talk edit, reading screenshots.', where: 'console.anthropic.com → API keys', placeholder: 'sk-ant-…' },
  { id: 'elevenlabs', name: 'ElevenLabs', powers: 'Voice-over for ads and transcription of founder talks.', where: 'elevenlabs.io → Developers → API keys', placeholder: 'Your ElevenLabs key' },
];
const SOURCE: Record<string, string> = { personal: 'your personal key', workspace: "the workspace's shared key", server: "the server's built-in key", none: 'no key: AI features fall back to templates' };

function Keys({ s, reload }: { s: any; reload: () => void }) {
  return (
    <div className="col" style={{ gap: 16 }}>
      {!s.secretsAvailable && <div className="issue warn">Saving keys is turned off: the server needs <code>TRUECUT_ENCRYPTION_KEY</code> (see docs/DEPLOYMENT.md). Keys are encrypted before they are stored and are never shown again.</div>}
      <p className="small muted" style={{ margin: 0 }}>Jobs use <b>your personal key</b> first, then <b>the workspace key</b>, then the server's. Keys are checked with the provider when you save them, encrypted at rest, and never sent back to the browser.</p>
      {PROVIDERS.map((p) => {
        const ws = s.keys.find((k: any) => k.provider === p.id && k.scope === 'workspace');
        const mine = s.keys.find((k: any) => k.provider === p.id && k.scope === 'personal');
        return (
          <div key={p.id} className="ccard">
            <div className="hd"><I.key size={15} /><h3>{p.name}</h3><span className="grow" /><span className="xs muted">Your jobs use {SOURCE[s.effective[p.id] || 'none']}</span></div>
            <div className="bd col" style={{ gap: 14 }}>
              <p className="xs dim" style={{ margin: 0 }}>{p.powers} Get a key at {p.where}.</p>
              <KeyRow label="Workspace key" help="Shared by everyone in the workspace." k={ws} canEdit={s.role === 'owner'} provider={p.id} scope="workspace" placeholder={p.placeholder} disabled={!s.secretsAvailable} reload={reload} />
              {s.auth && <KeyRow label="Personal key" help="Only your jobs use it; usage is still shown to the team." k={mine} canEdit provider={p.id} scope="personal" placeholder={p.placeholder} disabled={!s.secretsAvailable} reload={reload} />}
              {s.server[p.id] && <div className="xs dim">The server also has a built-in {p.name} key, used when neither of these is set.</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KeyRow({ label, help, k, canEdit, provider, scope, placeholder, disabled, reload }: any) {
  const [edit, setEdit] = useState(false); const [v, setV] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api('/api/settings/keys', { json: { provider, scope, secret: v } }); setMsg({ t: r.check?.message || 'Saved.' }); setV(''); setEdit(false); reload(); }
    catch (e: any) { setMsg({ t: e.message, bad: true }); }
    setBusy(false);
  };
  const remove = async () => { if (!confirmRemove(label)) return; setBusy(true); try { await api(`/api/settings/keys/${k.id}`, { method: 'DELETE' }); reload(); } catch (e: any) { setMsg({ t: e.message, bad: true }); } setBusy(false); };
  return (
    <div className="keyrow">
      <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <div className="grow"><div style={{ fontWeight: 500, fontSize: 13.5 }}>{label}</div><div className="xs dim">{help}</div></div>
        {k && !edit && <><span className="tc">••••{k.last4}</span>{k.status === 'invalid' ? <span className="pill bad" title={k.statusMessage || ''}>Rejected</span> : <span className="pill good">Active</span>}</>}
        {!k && !edit && <span className="pill neu">Not set</span>}
        {canEdit && !edit && <button className="btn sm" disabled={disabled || busy} onClick={() => { setEdit(true); setMsg(null); }}>{k ? 'Replace' : 'Add'}</button>}
        {canEdit && k && !edit && <button className="btn sm ghost danger" disabled={busy} onClick={remove}>Remove</button>}
      </div>
      {edit && (
        <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (v.trim()) save(); }}>
          <input type="password" autoComplete="off" spellCheck={false} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} autoFocus aria-label={`${label} value`} />
          <button className="btn primary sm" disabled={busy || !v.trim()} type="submit">{busy ? 'Checking…' : 'Check & save'}</button>
          <button className="btn sm ghost" type="button" onClick={() => { setEdit(false); setV(''); }}>Cancel</button>
        </form>
      )}
      {k?.status === 'invalid' && k.statusMessage && !edit && <div className="xs" style={{ color: 'var(--bad)', marginTop: 6 }}>{k.statusMessage}. Replace it to start using it again.</div>}
      {msg && <div className="xs" style={{ marginTop: 6, color: msg.bad ? 'var(--bad)' : 'var(--mu)' }}>{msg.t}</div>}
    </div>
  );
}
const confirmRemove = (label: string) => typeof window === 'undefined' || window.confirm(`Remove the ${label.toLowerCase()}? Jobs will fall back to the next key.`);

// ───────── models & budget ─────────
const usd = (n: number, d = 2) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

function Models({ s, setS }: { s: any; setS: (x: any) => void }) {
  const owner = s.role === 'owner';
  const [budget, setBudget] = useState(s.settings.monthlyBudgetUsd == null ? '' : String(s.settings.monthlyBudgetUsd));
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const patch = async (b: any) => { setMsg(null); try { setS(await api('/api/settings', { method: 'PATCH', json: b })); setMsg({ t: 'Saved.' }); } catch (e: any) { setMsg({ t: e.message, bad: true }); } };
  const cap = s.settings.monthlyBudgetUsd; const pct = cap ? Math.min(100, (s.spentThisMonth / cap) * 100) : 0;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="ccard">
        <div className="hd"><I.spark size={15} /><h3>Models</h3></div>
        <div className="bd col" style={{ gap: 16 }}>
          <p className="xs dim" style={{ margin: 0 }}>Claude Opus 5.5 is the default for everything. Change a job type to a cheaper model if cost matters more than quality there. Prices are per million tokens (input / output).</p>
          {s.slots.map((slot: any) => {
            const cur = s.models.find((m: any) => m.id === s.settings.models[slot.key]);
            return (
              <label key={slot.key} className="f">
                <span><b style={{ color: 'var(--ink)' }}>{slot.label}</b> · {slot.help}</span>
                <select disabled={!owner} value={s.settings.models[slot.key]} onChange={(e) => patch({ models: { [slot.key]: e.target.value } })}>
                  {s.models.map((m: any) => <option key={m.id} value={m.id}>{m.label} · ${m.input} / ${m.output}</option>)}
                </select>
                {cur && <span className="xs dim">{cur.note}</span>}
              </label>
            );
          })}
        </div>
      </div>
      <div className="ccard">
        <div className="hd"><I.shield size={15} /><h3>Monthly budget</h3><span className="grow" /><span className="xs muted">{usd(s.spentThisMonth)} used this month{cap != null ? ` of ${usd(cap)}` : ''}</span></div>
        <div className="bd col" style={{ gap: 12 }}>
          {cap != null && <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={s.spentThisMonth} aria-label="Budget used"><i style={{ width: `${pct}%`, background: pct >= 90 ? 'var(--bad)' : pct >= 75 ? 'var(--warn)' : 'var(--a)' }} /></div>}
          <p className="xs dim" style={{ margin: 0 }}>When the workspace reaches the cap, new Claude and ElevenLabs calls stop with a clear message until next month (UTC) or until an owner raises it. Estimated from list prices; the Anthropic Console is the real bill.</p>
          <form className="row" onSubmit={(e) => { e.preventDefault(); const n = budget.trim() === '' ? null : Number(budget); if (n !== null && (!Number.isFinite(n) || n < 0)) { setMsg({ t: 'Enter a number of dollars, or leave it empty for no limit.', bad: true }); return; } patch({ monthlyBudgetUsd: n }); }}>
            <span className="muted">$</span>
            <input inputMode="decimal" disabled={!owner} placeholder="No limit" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} style={{ maxWidth: 160 }} aria-label="Monthly budget in US dollars" />
            <button className="btn sm" disabled={!owner} type="submit">Save</button>
          </form>
        </div>
      </div>
      {msg && <div className="xs" style={{ color: msg.bad ? 'var(--bad)' : 'var(--mu)' }}>{msg.t}</div>}
    </div>
  );
}

// ───────── usage ─────────
const fmtK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n || 0)));
const OPS: Record<string, string> = { analysis: 'Reading sources', angles: 'Angles', storyboard: 'Storyboards', lines: 'Tightening the script', scene: 'Scene edits', cast: 'Voice casting', decide: 'Chat', edit: 'Founder-talk edit', beat: 'Founder-talk beat edits', face: 'Finding the speaker', library_read: 'Reading screenshots', tts: 'Voice-over', stt: 'Transcription', voices: 'Voice library' };
const opLabel = (o: string) => OPS[o] || o.replace(/_/g, ' ');
const monthAdd = (m: string, d: number) => { const [y, mm] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mm - 1 + d, 1)); return t.toISOString().slice(0, 7); };

function Usage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [u, setU] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { setU(null); api(`/api/usage?month=${month}`).then(setU).catch((e) => setErr(e.message)); }, [month]);
  const now = new Date().toISOString().slice(0, 7);
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const chars = u?.byOperation?.find((o: any) => o.operation === 'tts')?.units || 0;
  const secs = u?.byOperation?.find((o: any) => o.operation === 'stt')?.units || 0;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row">
        <button className="btn sm icon" aria-label="Previous month" onClick={() => setMonth(monthAdd(month, -1))}>‹</button>
        <b style={{ minWidth: 130, textAlign: 'center' }}>{label}</b>
        <button className="btn sm icon" aria-label="Next month" disabled={month >= now} onClick={() => setMonth(monthAdd(month, 1))}>›</button>
        <span className="grow" /><span className="xs dim">Estimates from list prices (UTC months). The provider's console is the bill of record.</span>
      </div>
      {err && <div className="issue error">{err}</div>}
      {!u ? <div className="dim small">Loading…</div> : (<>
        <div className="tiles">
          <Tile k="AI spend" v={usd(u.total.cost)} sub={u.budget != null ? `of ${usd(u.budget)} budget` : 'no budget set'} />
          <Tile k="Claude tokens" v={fmtK(u.total.input + u.total.output + u.total.cacheWrite + u.total.cacheRead)} sub={`${fmtK(u.total.input)} in · ${fmtK(u.total.output)} out`} />
          <Tile k="Voice-over" v={`${fmtK(chars)} chars`} sub="ElevenLabs text-to-speech" />
          <Tile k="Transcribed" v={`${Math.round(secs / 60)} min`} sub="ElevenLabs Scribe" />
          <Tile k="Calls" v={fmtK(u.total.calls)} sub={u.total.failed ? `${u.total.failed} failed` : 'none failed'} bad={!!u.total.failed} />
        </div>
        <DailyBars month={month} rows={u.byDay} />
        <div className="grid2">
          <Breakdown title="By person" rows={u.byUser.map((r: any) => ({ k: r.name || r.email || 'Local / system', cost: r.cost, tokens: r.input + r.output + r.cacheWrite + r.cacheRead, calls: r.calls }))} />
          <Breakdown title="By video" rows={u.byProject.map((r: any) => ({ k: r.name || (r.projectId ? `Deleted video (${r.projectId})` : 'Library & settings'), cost: r.cost, tokens: r.input + r.output + r.cacheWrite + r.cacheRead, calls: r.calls, href: r.name ? `/p/${r.projectId}` : undefined }))} />
          <Breakdown title="By model" rows={u.byModel.map((r: any) => ({ k: r.model || (r.provider === 'elevenlabs' ? 'ElevenLabs' : r.provider), cost: r.cost, tokens: r.input + r.output + r.cacheWrite + r.cacheRead, calls: r.calls }))} />
          <Breakdown title="By task" rows={u.byOperation.map((r: any) => ({ k: opLabel(r.operation), cost: r.cost, tokens: r.input + r.output + r.cacheWrite + r.cacheRead, calls: r.calls }))} />
        </div>
        <div className="ccard">
          <div className="hd"><h3>Recent calls</h3></div>
          <div className="bd" style={{ padding: 0, overflowX: 'auto' }}>
            {!u.recent.length ? <div className="dim small" style={{ padding: 14 }}>Nothing this month.</div> : (
              <table className="tbl"><thead><tr><th>When</th><th>Who</th><th>Task</th><th>Model</th><th className="r">Tokens in / out</th><th className="r">Cost</th><th>Key</th><th></th></tr></thead>
                <tbody>{u.recent.map((r: any) => <tr key={r.id}><td className="tc">{new Date(r.at).toLocaleString()}</td><td>{r.user || '—'}</td><td>{opLabel(r.operation)}</td><td className="tc">{r.model || r.provider}</td><td className="r tc">{fmtK(r.input)} / {fmtK(r.output)}</td><td className="r tc">{usd(r.cost, 4)}</td><td className="xs muted">{r.keySource}</td><td>{r.ok ? '' : <span className="pill bad" title={r.error || ''}>Failed</span>}</td></tr>)}</tbody>
              </table>)}
          </div>
        </div>
      </>)}
    </div>
  );
}

function Tile({ k, v, sub, bad }: { k: string; v: string; sub: string; bad?: boolean }) {
  return <div className="tile"><div className="xs muted">{k}</div><div className="v">{v}</div><div className="xs" style={{ color: bad ? 'var(--bad)' : 'var(--dim)' }}>{sub}</div></div>;
}

/** Spend per day: one series, so no legend; hover a day for its numbers. */
function DailyBars({ month, rows }: { month: string; rows: any[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number); const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const by = new Map(rows.map((r) => [r.day, r]));
    return Array.from({ length: n }, (_, i) => { const d = `${month}-${String(i + 1).padStart(2, '0')}`; const r: any = by.get(d); return { d, cost: r?.cost || 0, calls: r?.calls || 0, tokens: r ? r.input + r.output + r.cacheWrite + r.cacheRead : 0 }; });
  }, [month, rows]);
  const max = Math.max(...days.map((d) => d.cost), 0.0001);
  const H = 120;
  return (
    <div className="ccard">
      <div className="hd"><h3>AI spend per day</h3><span className="grow" /><span className="xs muted">{hover != null ? `${new Date(days[hover].d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${usd(days[hover].cost, 3)} · ${fmtK(days[hover].tokens)} tokens · ${days[hover].calls} calls` : `Peak ${usd(max === 0.0001 ? 0 : max, 3)}`}</span></div>
      <div className="bd">
        <div className="bars" style={{ height: H }} onMouseLeave={() => setHover(null)}>
          {[0.5, 1].map((g) => <div key={g} className="grid" style={{ bottom: g * H }} />)}
          {days.map((d, i) => (
            <div key={d.d} className="slot" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.d}: ${usd(d.cost, 3)}`}>
              <i style={{ height: d.cost ? Math.max(2, (d.cost / max) * H) : 0, opacity: hover == null || hover === i ? 1 : 0.45 }} />
            </div>
          ))}
        </div>
        <div className="row between xs dim" style={{ marginTop: 6 }}><span>1</span><span>{Math.ceil(days.length / 2)}</span><span>{days.length}</span></div>
      </div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { k: string; cost: number; tokens: number; calls: number; href?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.cost), 0.0001);
  return (
    <div className="ccard">
      <div className="hd"><h3>{title}</h3></div>
      <div className="bd col" style={{ gap: 8 }}>
        {!rows.length ? <div className="dim small">Nothing yet.</div> : rows.slice(0, 8).map((r, i) => (
          <div key={i} className="brow">
            <div className="row" style={{ gap: 8 }}><span className="grow ell small">{r.href ? <a href={r.href}>{r.k}</a> : r.k}</span><span className="tc">{usd(r.cost, r.cost < 1 ? 3 : 2)}</span></div>
            <div className="row" style={{ gap: 8 }}><div className="hbar grow"><i style={{ width: `${(r.cost / max) * 100}%` }} /></div><span className="xs dim" style={{ minWidth: 110, textAlign: 'right' }}>{fmtK(r.tokens)} tokens · {r.calls}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────── capture extension ─────────
function Extension() {
  const [list, setList] = useState<any[] | null>(null); const [made, setMade] = useState<any>(null); const [err, setErr] = useState(''); const [copied, setCopied] = useState('');
  const load = () => api('/api/settings/tokens').then((r) => setList(r.tokens)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const copy = async (t: string, what: string) => { try { await navigator.clipboard.writeText(t); setCopied(what); setTimeout(() => setCopied(''), 1500); } catch {} };
  const create = async () => { setErr(''); try { setMade(await api('/api/settings/tokens', { json: { name: `Chrome on ${navigator.platform || 'this computer'}`.slice(0, 60), days: 180 } })); load(); } catch (e: any) { setErr(e.message); } };
  const revoke = async (id: string) => { if (!window.confirm('Revoke this token? The extension using it will stop uploading.')) return; await api(`/api/settings/tokens/${id}`, { method: 'DELETE' }); load(); };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="ccard">
        <div className="hd"><I.image size={15} /><h3>TrueCut Capture for Chrome</h3></div>
        <div className="bd col" style={{ gap: 10 }}>
          <p className="small muted" style={{ margin: 0 }}>Capture screens of the real product (behind its login) straight into the team Library. Nick reads each shot and uses it, and its on-screen numbers, when he makes a video.</p>
          <ol className="steps small">
            <li><a className="btn sm" href="/downloads/truecut-capture.zip" download><I.download size={14} />Download the extension</a> and unzip it.</li>
            <li>Open <code>chrome://extensions</code>, switch on <b>Developer mode</b>, click <b>Load unpacked</b> and pick the unzipped folder.</li>
            <li>Click the TrueCut icon, then <b>Connect</b>, and paste this server address and a token from below.</li>
          </ol>
          <div className="row"><span className="xs muted">Server</span><code className="grow ell">{origin}</code><button className="btn sm" onClick={() => copy(origin, 'server')}>{copied === 'server' ? 'Copied' : 'Copy'}</button></div>
        </div>
      </div>
      <div className="ccard">
        <div className="hd"><I.key size={15} /><h3>Your extension tokens</h3><span className="grow" /><button className="btn sm primary" onClick={create}>New token</button></div>
        <div className="bd col" style={{ gap: 10 }}>
          {err && <div className="issue error">{err}</div>}
          {made && <div className="issue warn col" style={{ gap: 8 }}><b>Copy this token now. It won't be shown again.</b><div className="row"><code className="grow ell">{made.token}</code><button className="btn sm" onClick={() => copy(made.token, 'token')}>{copied === 'token' ? 'Copied' : 'Copy'}</button></div><span className="xs">Expires {made.expiresAt ? new Date(made.expiresAt).toLocaleDateString() : 'never'}. It can only upload captures as you; revoke it any time.</span></div>}
          {list === null ? <div className="dim small">Loading…</div> : !list.length ? <div className="dim small">No tokens yet.</div> : list.map((t) => (
            <div key={t.id} className="row"><span className="grow small">{t.name} <span className="tc">{t.prefix}…</span></span><span className="xs dim">{t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'never used'} · {t.expiresAt ? `expires ${new Date(t.expiresAt).toLocaleDateString()}` : 'no expiry'}</span><button className="btn sm ghost danger" onClick={() => revoke(t.id)}>Revoke</button></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────── team skills ─────────
const EXAMPLES = [
  { name: 'brand-voice', description: 'Use for every video for our company: how we sound, words we use and avoid.', body: '# Brand voice\n\n- Plain, confident, a little dry. Short sentences.\n- Say "teams", never "users". Say "set up", never "onboard".\n- No exclamation marks. No "revolutionary", "game-changing" or "seamless".\n- End on what the viewer can do next, in their words.' },
  { name: 'linkedin-hooks', description: 'Use for LinkedIn ads aimed at B2B buyers: how to write the first line and the hook.', body: '# LinkedIn hooks\n\n1. The first spoken line names a specific pain the buyer has this week, in under 8 words.\n2. Put the strongest real number from the facts in the first 3 seconds if there is one.\n3. Never open with the product name. Reveal it after the problem lands.\n4. Prefer a question or a contrast ("Before / after") over a statement.' },
];
type Sk = { id: string; name: string; description: string; body: string; stages: string[]; always: boolean; enabled: boolean; source: string; createdBy: string | null; mine: boolean };
const blank = { name: '', description: '', body: '', stages: [] as string[], always: false };

function Skills() {
  const [d, setD] = useState<{ items: Sk[]; stages: { id: string; label: string }[]; limits: any } | null>(null);
  const [err, setErr] = useState(''); const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null); const [busy, setBusy] = useState(false);
  const load = () => api('/api/skills').then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!edit) return; setBusy(true); setErr('');
    try { const { id, ...v } = edit; await api(id ? `/api/skills/${id}` : '/api/skills', { method: id ? 'PATCH' : 'POST', json: v }); setEdit(null); load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const patch = async (k: Sk, v: any) => { setErr(''); try { await api(`/api/skills/${k.id}`, { method: 'PATCH', json: v }); load(); } catch (e: any) { setErr(e.message); } };
  const remove = async (k: Sk) => { if (!window.confirm(`Delete the ${k.name} skill? Projects using it stop following it.`)) return; try { await api(`/api/skills/${k.id}`, { method: 'DELETE' }); load(); } catch (e: any) { setErr(e.message); } };
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return; setBusy(true); setErr(''); const bad: string[] = [];
    for (const f of Array.from(files)) {
      try { await api('/api/skills', { json: { markdown: await f.text(), filename: f.name } }); } catch (e: any) { bad.push(`${f.name}: ${e.message}`); }
    }
    if (bad.length) setErr(bad.join(' · '));
    setBusy(false); load();
  };
  const download = (k: Sk) => {
    const fm = `---\nname: ${k.name}\ndescription: ${JSON.stringify(k.description)}\n${k.stages.length ? `stages: [${k.stages.join(', ')}]\n` : ''}${k.always ? 'always: true\n' : ''}---\n\n`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([fm + k.body + '\n'], { type: 'text/markdown' })); a.download = `${k.name}.SKILL.md`; a.click(); URL.revokeObjectURL(a.href);
  };
  const stageName = (id: string) => d?.stages.find((x) => x.id === id)?.label || id;
  if (!d) return err ? <div className="issue error">{err}</div> : <div className="dim small">Loading…</div>;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="ccard">
        <div className="hd"><I.wand size={15} /><h3>Team skills</h3><span className="grow" />
          <label className="btn sm" style={{ cursor: 'pointer' }}><I.upload size={14} />Import SKILL.md<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ''; }} /></label>
          <button className="btn sm primary" onClick={() => { setEdit({ ...blank }); setErr(''); }}>New skill</button>
        </div>
        <div className="bd col" style={{ gap: 10 }}>
          <p className="small muted" style={{ margin: 0 }}>Saved instructions Nick follows when he writes: your brand voice, how you like hooks, words to avoid, a review checklist. For each project Nick reads every skill's <b>description</b> and picks the ones that fit (or you say “use the brand-voice skill” in the chat). Skills shape tone and structure; they can't add facts. Every number still has to come from your sources.</p>
          <p className="xs dim" style={{ margin: 0 }}>Already have Claude skills? Import their SKILL.md files: the name and description come from the frontmatter.</p>
        </div>
      </div>
      {err && <div className="issue error">{err}</div>}
      {edit && (
        <div className="ccard">
          <div className="hd"><h3>{edit.id ? `Edit ${edit.name}` : 'New skill'}</h3><span className="grow" />{!edit.id && <span className="xs muted">Start from an example:</span>}{!edit.id && EXAMPLES.map((x) => <button key={x.name} className="btn sm ghost" onClick={() => setEdit({ ...blank, ...x })}>{x.name}</button>)}</div>
          <form className="bd col" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
            <label className="f"><span>Name</span><input value={edit.name} maxLength={64} placeholder="brand-voice" onChange={(e) => setEdit({ ...edit, name: e.target.value.toLowerCase().replace(/\s+/g, '-') })} /></label>
            <label className="f"><span>When to use it</span><input value={edit.description} maxLength={1024} placeholder="Use for LinkedIn ads for our enterprise product: …" onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
            <div className="xs dim" style={{ marginTop: -8 }}>Nick decides from this line alone whether the skill fits a project, so say what kind of video, product or audience it is for.</div>
            <label className="f"><span>Instructions</span><textarea className="code" style={{ minHeight: 220 }} value={edit.body} maxLength={d.limits.body} placeholder="# Brand voice&#10;&#10;- Plain, confident…" onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
            <div className="xs dim" style={{ marginTop: -8 }}>{edit.body.length.toLocaleString()} / {d.limits.body.toLocaleString()} characters</div>
            <div className="col" style={{ gap: 8 }}>
              <span className="small" style={{ fontWeight: 500 }}>Applies to</span>
              <div className="row wrap" style={{ gap: 8 }}>
                <button type="button" className={`chip ${!edit.stages.length ? 'on' : ''}`} onClick={() => setEdit({ ...edit, stages: [] })}>Everything</button>
                {d.stages.map((st) => { const on = edit.stages.includes(st.id); return <button type="button" key={st.id} className={`chip ${on ? 'on' : ''}`} onClick={() => setEdit({ ...edit, stages: on ? edit.stages.filter((x) => x !== st.id) : [...edit.stages, st.id] })}>{st.label}</button>; })}
              </div>
            </div>
            <label className="row small" style={{ gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={edit.always} onChange={(e) => setEdit({ ...edit, always: e.target.checked })} />Always use on every project (skip Nick's choice)</label>
            <div className="row" style={{ gap: 10 }}><button className="btn primary" disabled={busy || !edit.name.trim() || !edit.description.trim() || !edit.body.trim()}>{busy ? 'Saving…' : 'Save skill'}</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
          </form>
        </div>
      )}
      {!d.items.length && !edit ? <div className="dim small">No skills yet. Add one, or import a SKILL.md.</div> : d.items.map((k) => (
        <div key={k.id} className="ccard" style={{ opacity: k.enabled ? 1 : 0.6 }}>
          <div className="hd"><h3 className="tc" style={{ fontSize: 14 }}>{k.name}</h3>{k.always && <span className="pill acc">Always on</span>}{!k.enabled && <span className="pill neu">Off</span>}{k.source === 'import' && <span className="pill neu">Imported</span>}<span className="grow" />
            <button className="btn sm ghost" onClick={() => patch(k, { enabled: !k.enabled })}>{k.enabled ? 'Turn off' : 'Turn on'}</button>
            <button className="btn sm ghost" onClick={() => download(k)} title="Download as SKILL.md"><I.download size={14} /></button>
            <button className="btn sm ghost" onClick={() => { setEdit({ id: k.id, name: k.name, description: k.description, body: k.body, stages: k.stages, always: k.always }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><I.edit size={14} /></button>
            <button className="btn sm ghost danger" onClick={() => remove(k)}><I.trash size={14} /></button>
          </div>
          <div className="bd col" style={{ gap: 6 }}>
            <div className="small">{k.description}</div>
            <div className="xs dim">{k.stages.length ? k.stages.map(stageName).join(' · ') : 'All stages'} · {k.body.length.toLocaleString()} characters{k.createdBy ? ` · added by ${k.createdBy}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
