// not-found.js — custom 404 page for any unknown route.
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="center-screen">
      <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div className="empty-icon">🍽️</div>
        <h2>Page not found</h2>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          That page doesn&apos;t exist. Let&apos;s get you back on track.
        </p>
        <Link href="/dashboard" className="btn btn-primary">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
