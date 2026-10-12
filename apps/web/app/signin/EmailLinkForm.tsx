'use client';
import { useState } from 'react';

export default function EmailLinkForm({ callbackUrl, primary }: { callbackUrl: string; primary: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [err, setErr] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    // read the field itself: someone may have typed before the page finished loading
    const typed = String(new FormData(e.currentTarget as HTMLFormElement).get('email') || '').trim();
    if (!typed) return;
    setEmail(typed); setState('busy');
    try {
      const r = await fetch('/api/auth-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: typed, callbackUrl }) });
      if (r.ok) { setState('sent'); return; }
      const j = await r.json().catch(() => ({}));
      setErr(r.status === 400 ? 'That doesn’t look like an email address.' : j.error || 'Something went wrong. Please try again.');
    } catch { setErr('Couldn’t reach TrueCut. Check your connection and try again.'); }
    setState('idle');
  }
  if (state === 'sent') return (
    <div className="signin-sent">
      <strong>Check your email.</strong><br />
      If <strong>{email}</strong> can sign in to TrueCut, a link is on its way. It works once and expires in 15 minutes.
      <div style={{ marginTop: 10 }}><button className="btn" onClick={() => setState('idle')}>Use a different address</button></div>
    </div>
  );
  return (
    <form className="signin-form" onSubmit={submit}>
      <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@company.com" aria-label="Work email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={state === 'busy'} />
      <button className={`btn signin-btn${primary ? ' primary' : ''}`} style={{ marginTop: 0 }} disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Email me a sign-in link'}</button>
      {err && <p className="signin-err">{err}</p>}
    </form>
  );
}
