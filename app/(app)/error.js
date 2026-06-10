'use client';

// error.js — error boundary for the signed-in pages. If a page throws, Next.js
// renders this instead of a blank screen, with a button to retry.
import { useEffect } from 'react';

export default function AppError({ error, reset }) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="center-screen">
      <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
        <div className="empty-icon">😕</div>
        <h2>Something went wrong</h2>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          {error?.message || 'An unexpected error occurred.'}
        </p>
        <button className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
