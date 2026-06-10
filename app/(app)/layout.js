'use client';

// (app)/layout.js — the protected shell shared by every signed-in page
// (dashboard, menu, sales, waste, logs, settings — all the folders next to this
// one). On load it:
//   1. checks there's a Supabase session (else redirects to /login),
//   2. loads the user's profile (→ restaurant_id + role), their restaurant, and
//      their settings, provisioning the restaurant on first login if needed,
//   3. shares all of that to child pages via AppContext (useApp()),
//   4. renders the sidebar + toast provider around the page content.
// NOTE: this guard is for UX only — the real security boundary is Supabase
// Row-Level Security, which stops a user reading another restaurant's rows even
// if they bypassed this screen.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { AppContext, DEFAULT_SETTINGS } from '@/lib/AppContext';
import { ensureRestaurantProvisioned } from '@/lib/provision';
import Sidebar from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';

// Render these authenticated pages at request time, never at build time. They
// rely on the Supabase client + a live session, so static prerendering is wrong
// for them (and would try to use Supabase before env vars exist). This config in
// the layout cascades to every page in the (app) segment.
export const dynamic = 'force-dynamic';

// Protected shell for every signed-in page. Loads the user's session and the
// profile/restaurant/settings that the rest of the app needs, and redirects to
// /login if there is no session. (RLS is the real security boundary; this guard
// is for UX so users never see an empty protected page.)
export default function AppLayout({ children }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [settings, setSettings] = useState(null);
  const [fatal, setFatal] = useState(null);

  const loadAll = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace('/login');
      return false;
    }
    setUser(session.user);

    // Profile -> restaurant_id + role
    let { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('id, restaurant_id, role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profErr) {
      setFatal('Could not load your profile: ' + profErr.message);
      return false;
    }
    if (!prof) {
      // Authenticated but not yet provisioned (e.g. confirmed via email link
      // and landed here directly). Create the restaurant now.
      const res = await ensureRestaurantProvisioned(session.user);
      if (res.error || !res.profile) {
        setFatal(
          'Could not set up your restaurant workspace: ' +
            (res.error || 'unknown error')
        );
        return false;
      }
      prof = res.profile;
    }
    setProfile(prof);

    // Restaurant (name, city, api_key)
    const { data: rest } = await supabase
      .from('restaurants')
      .select('id, name, city, api_key, created_at')
      .eq('id', prof.restaurant_id)
      .maybeSingle();
    setRestaurant(rest || null);

    // Settings (fall back to defaults if no row)
    const { data: sett } = await supabase
      .from('settings')
      .select('restaurant_id, currency, popularity_threshold, target_waste_pct')
      .eq('restaurant_id', prof.restaurant_id)
      .maybeSingle();
    setSettings(
      sett || { restaurant_id: prof.restaurant_id, ...DEFAULT_SETTINGS }
    );

    return true;
  }, [router]);

  const refreshSettings = useCallback(async () => {
    if (!profile) return;
    const { data: sett } = await supabase
      .from('settings')
      .select('restaurant_id, currency, popularity_threshold, target_waste_pct')
      .eq('restaurant_id', profile.restaurant_id)
      .maybeSingle();
    setSettings(
      sett || { restaurant_id: profile.restaurant_id, ...DEFAULT_SETTINGS }
    );
  }, [profile]);

  useEffect(() => {
    let active = true;
    (async () => {
      await loadAll();
      if (active) setLoading(false);
    })();

    // React to sign-out / token changes from any tab.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login');
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadAll, router]);

  if (loading) {
    return (
      <div className="center-screen">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 14px' }} />
          <div className="muted">Loading your restaurant…</div>
        </div>
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="center-screen">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="empty-icon">⚠️</div>
          <p>{fatal}</p>
          <button
            className="btn btn-primary"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace('/login');
            }}
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider
      value={{
        loading,
        user,
        profile,
        restaurant,
        settings,
        refresh: loadAll,
        refreshSettings,
      }}
    >
      <ToastProvider>
        <div className="md:flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 max-w-[1260px] px-5 md:px-9 py-6 md:py-7 pb-16">
            {children}
          </main>
        </div>
      </ToastProvider>
    </AppContext.Provider>
  );
}
