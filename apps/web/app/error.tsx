'use client';
import { useEffect } from 'react';
// Shown when a page crashes. The details go to the browser console; the person gets a way back.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div className="col" style={{ alignItems: 'center', gap: 12, maxWidth: 420 }}>
        <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, margin: 0 }}>Something broke on this page</h1>
        <p className="muted small" style={{ margin: 0 }}>Your work is saved. Try again, and if it keeps happening, send the time and this code to whoever runs TrueCut: <span className="tc">{error.digest || 'n/a'}</span></p>
        <div className="row"><button className="btn primary" onClick={reset}>Try again</button><a className="btn" href="/">Back to the studio</a></div>
      </div>
    </div>
  );
}
