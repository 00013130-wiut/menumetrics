'use client';

// signup/page.js — create an account (Supabase Auth, email + password).
// The restaurant name is stashed in the user's auth metadata. Because this
// project has email confirmation ON, signUp usually returns no session, so the
// restaurant is created later (on first login). If confirmation is OFF we get a
// session immediately and provision right away. Either path uses lib/provision.js.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ensureRestaurantProvisioned } from '@/lib/provision';

// Imports the Supabase client → render at request time, not at build time.
export const dynamic = 'force-dynamic';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    restaurantName: '',
    city: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validate() {
    if (!form.restaurantName.trim()) return 'Restaurant name is required.';
    if (!form.email.trim()) return 'Email is required.';
    if (form.password.length < 6)
      return 'Password must be at least 6 characters.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
    return '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);

    // Restaurant name is stashed in user metadata so we can create the
    // restaurant/profile once the user has an authenticated session.
    const { data, error: signErr } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          restaurant_name: form.restaurantName.trim(),
          restaurant_city: form.city.trim(),
        },
      },
    });

    if (signErr) {
      setError(signErr.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      // Email confirmation is off → we already have a session. Provision now.
      const res = await ensureRestaurantProvisioned(data.user);
      setBusy(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.replace('/dashboard');
    } else {
      // Email confirmation is on → user must confirm, then log in. The
      // restaurant is created on first login.
      setBusy(false);
      setNotice(
        'Account created! Please check your email to confirm your address, then sign in. Your restaurant workspace is set up automatically on first login.'
      );
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-logo">M</div>
          <div>
            <div className="brand-name">MenuMetrics</div>
            <div className="brand-sub">Create your restaurant workspace</div>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-success">{notice}</div>}

        {!notice && (
          <form onSubmit={onSubmit}>
            <div className="field">
              <label>Restaurant name</label>
              <input
                value={form.restaurantName}
                onChange={(e) => update('restaurantName', e.target.value)}
                placeholder="e.g. Chaikhana Navat"
                autoFocus
              />
            </div>
            <div className="field">
              <label>City (optional)</label>
              <input
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder="Tashkent"
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="you@restaurant.com"
              />
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Confirm</label>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => update('confirm', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={busy}
            >
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
        )}

        <div className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
