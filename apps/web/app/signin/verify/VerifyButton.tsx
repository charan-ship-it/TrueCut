'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function VerifyButton({ email, token, callbackUrl }: { email: string; token: string; callbackUrl: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true); setErr('');
    const r = await signIn('email-link', { email, token, redirect: false, callbackUrl }).catch(() => null);
    if (r?.ok && !r.error) { window.location.replace(callbackUrl); return; }
    setErr(r?.error === 'CredentialsSignin' ? 'This link has expired or was already used.' : 'Sign-in didn’t work. Please try again.');
    setBusy(false);
  }
  return (
    <>
      <p className="muted">Sign in as <strong>{email}</strong></p>
      <button className="btn primary signin-btn" onClick={go} disabled={busy || !!err}>{busy ? 'Signing in…' : 'Continue to TrueCut'}</button>
      {err && <><p className="signin-err">{err}</p><a className="btn" href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Get a new link</a></>}
    </>
  );
}
