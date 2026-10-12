export default function NotFound() {
  return (
    <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div className="col" style={{ alignItems: 'center', gap: 12 }}>
        <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, margin: 0 }}>Nothing here</h1>
        <p className="muted small" style={{ margin: 0 }}>That video or page doesn't exist, or it was deleted.</p>
        <a className="btn" href="/">Back to the studio</a>
      </div>
    </div>
  );
}
