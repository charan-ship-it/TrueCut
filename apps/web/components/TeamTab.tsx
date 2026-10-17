'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 300) return 'Active now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
};
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function TeamTab() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const [email, setEmail] = useState(''); const [role, setRole] = useState<'member' | 'owner'>('member');
  const load = useCallback(() => api('/api/team').then((x) => { setD(x); setErr(''); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  const run = async (key: string, f: () => Promise<any>) => { setBusy(key); setErr(''); try { await f(); await load(); } catch (e: any) { setErr(e.message); } setBusy(''); };
  if (!d) return err ? <div className="issue error">{err}</div> : <div className="dim small">Loading…</div>;
  const owner = d.role === 'owner';
  const active = d.members.filter((m: any) => !m.disabled);
  return (
    <div className="col" style={{ gap: 18, maxWidth: 760 }}>
      {err && <div className="issue error">{err}</div>}
      <div className="ccard">
        <div className="hd"><h3>Team</h3><span className="grow" /><span className="xs muted">{active.length} active · {d.members.length - active.length} switched off</span></div>
        <div className="bd col" style={{ gap: 0 }}>
          {d.members.map((m: any) => {
            const me = m.id === d.me;
            return (
              <div key={m.id} className="row" style={{ gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--line, rgba(128,128,128,.2))', opacity: m.disabled ? 0.55 : 1 }}>
                {m.image ? <img src={m.image} alt="" width={32} height={32} style={{ borderRadius: 16 }} /> : <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(128,128,128,.25)', display: 'grid', placeItems: 'center', fontSize: 13 }}>{(m.name || m.email)[0]?.toUpperCase()}</div>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="small" style={{ fontWeight: 500 }}>{m.name || m.email}{me ? ' (you)' : ''}</div>
                  <div className="xs dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email} · joined {day(m.joinedAt)}</div>
                </div>
                <div className="xs muted" style={{ minWidth: 80, textAlign: 'right' }}>{m.disabled ? 'Switched off' : ago(m.lastSeenAt)}</div>
                {owner ? (
                  <select value={m.role} disabled={busy === m.id} onChange={(e) => run(m.id, () => api(`/api/team/members/${m.id}`, { method: 'PATCH', json: { role: e.target.value } }))}>
                    <option value="owner">Owner</option><option value="member">Member</option>
                  </select>
                ) : <span className="xs muted" style={{ minWidth: 60 }}>{m.role === 'owner' ? 'Owner' : 'Member'}</span>}
                {owner && !me && <button className="btn" disabled={busy === m.id} onClick={() => run(m.id, () => api(`/api/team/members/${m.id}`, { method: 'PATCH', json: { disabled: !m.disabled } }))}>{m.disabled ? 'Switch on' : 'Switch off'}</button>}
              </div>
            );
          })}
        </div>
      </div>
      {owner && (
        <div className="ccard">
          <div className="hd"><h3>Invite someone</h3></div>
          <div className="bd col" style={{ gap: 12 }}>
            <div className="xs dim">{d.domains.length ? <>Anyone with an address at {d.domains.join(', ')} can already sign in. </> : null}Invite an address outside that to let it in too. They sign in with Google or an emailed link, and get the role you pick.</div>
            <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (!email.trim()) return; run('invite', async () => { await api('/api/team/invites', { json: { email, role } }); setEmail(''); }); }}>
              <input style={{ flex: 1 }} type="email" value={email} placeholder="name@company.com" onChange={(e) => setEmail(e.target.value)} />
              <select value={role} onChange={(e) => setRole(e.target.value as any)}><option value="member">Member</option><option value="owner">Owner</option></select>
              <button className="btn primary" disabled={busy === 'invite' || !email.trim()}>{busy === 'invite' ? 'Inviting…' : 'Invite'}</button>
            </form>
            {d.invites.length > 0 && (
              <div className="col" style={{ gap: 6 }}>
                <div className="xs muted">Waiting for their first sign-in</div>
                {d.invites.map((i: any) => (
                  <div key={i.email} className="row small" style={{ gap: 10, alignItems: 'center' }}>
                    <span style={{ flex: 1 }}>{i.email}</span><span className="xs muted">{i.role === 'owner' ? 'Owner' : 'Member'} · invited {day(i.createdAt)}</span>
                    <button className="btn" disabled={busy === i.email} onClick={() => run(i.email, () => api('/api/team/invites', { method: 'DELETE', json: { email: i.email } }))}>Cancel</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {!owner && <div className="xs dim">Only owners can invite people, change roles or switch access off.</div>}
    </div>
  );
}
