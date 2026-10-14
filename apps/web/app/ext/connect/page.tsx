'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../components/api';

// Pairs the TrueCut Capture extension with this account: the extension opens this page with its own id, the
// person confirms, a token is created and handed straight to the extension. No address or token to type.
export default function ExtConnect() {
  const [ext, setExt] = useState(''); const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle'); const [msg, setMsg] = useState('');
  useEffect(() => { setExt(new URLSearchParams(location.search).get('ext') || ''); }, []);
  const valid = /^[a-p]{32}$/.test(ext);
  async function connect() {
    setState('working'); setMsg('');
    try {
      const c = (window as any).chrome;
      if (!c?.runtime?.sendMessage) throw new Error('Open this page in Chrome, with the TrueCut Capture extension installed.');
      const t = await api('/api/settings/tokens', { json: { name: `Chrome on ${navigator.platform || 'this computer'}`.slice(0, 60), days: 365 } });
      const res: any = await new Promise((ok, no) => c.runtime.sendMessage(ext, { type: 'tc-connect', server: location.origin, token: t.token }, (r: any) => (c.runtime.lastError ? no(new Error('The extension did not answer. Reload it in chrome://extensions and try again.')) : ok(r))));
      if (!res?.ok) throw new Error(res?.error || 'The extension could not connect.');
      setState('done');
    } catch (e: any) { setMsg(e.message || 'Something went wrong.'); setState('error'); }
  }
  return (
    <div className="home"><div className="section" style={{ paddingTop: 80, maxWidth: 520, margin: '0 auto' }}>
      <h1 className="serif" style={{ fontSize: 40, fontWeight: 400 }}>Connect TrueCut Capture</h1>
      {!valid ? <div className="issue error" style={{ marginTop: 16 }}>Open this page from the extension: click the TrueCut icon in Chrome, then <b>Connect to TrueCut</b>.</div> : state === 'done' ? (
        <div className="issue" style={{ marginTop: 16 }}><b>Connected.</b> You can close this tab and start capturing. The extension stays connected on this browser; you can revoke it any time in Settings → Capture extension.</div>
      ) : (
        <div className="col" style={{ gap: 14, marginTop: 16 }}>
          <p className="muted" style={{ margin: 0 }}>This links the extension in this browser to your TrueCut account, so captures go to your team's Library. It creates a personal token that you can revoke in Settings.</p>
          <div><button className="btn primary" disabled={state === 'working'} onClick={connect}>{state === 'working' ? 'Connecting…' : 'Connect this browser'}</button></div>
          {msg && <div className="issue error">{msg}</div>}
        </div>
      )}
    </div></div>
  );
}
