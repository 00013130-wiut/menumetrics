// loading.js — Next.js route-level loading UI for the signed-in pages.
// Shown automatically while an (app) route segment is loading.
export default function Loading() {
  return (
    <div className="center-screen">
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 14px' }} />
        <div className="muted">Loading…</div>
      </div>
    </div>
  );
}
