'use client';

// login/page.js — email + password sign-in (Supabase Auth).
// On success it calls ensureRestaurantProvisioned: if this is the user's first
// login after confirming their email, that's when their restaurant/profile/
// settings rows get created (see lib/provision.js for why it's deferred to here).
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ensureRestaurantProvisioned } from '@/lib/provision';

// Imports the Supabase client → render at request time, not at build time.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);

    const { data, error: signErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signErr) {
      setError(signErr.message);
      setBusy(false);
      return;
    }

    // First login after email confirmation may need to create the restaurant.
    const res = await ensureRestaurantProvisioned(data.user);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.replace('/dashboard');
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-logo">M</div>
          <div>
            <div className="brand-name">MenuMetrics</div>
            <div className="brand-sub">Sign in to your workspace</div>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.com"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={busy}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-switch">
          New to MenuMetrics? <Link href="/signup">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
