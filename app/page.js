'use client';

// page.js (route "/") — the entry point.
// Quickly checks the Supabase client is reachable, then sends the visitor to the
// dashboard if they're logged in, or to the login page if not. Just a redirect
// gate — no real content lives here.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Entry point. Confirms the Supabase client is reachable, then routes the user
// to the dashboard (if logged in) or the login page (if not).
export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState('Connecting to Supabase…');

  useEffect(() => {
    let active = true;
    (async () => {
      // Lightweight connectivity probe: a HEAD count against a table. With RLS
      // and no session this returns no rows, but a non-network response proves
      // the client reached the project.
      const { error } = await supabase
        .from('restaurants')
        .select('id', { count: 'exact', head: true });

      if (!active) return;

      if (error && error.message && /fetch|network/i.test(error.message)) {
        setStatus('Could not reach Supabase: ' + error.message);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      router.replace(session ? '/dashboard' : '/login');
    })();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="center-screen">
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <div className="muted">{status}</div>
      </div>
    </div>
  );
}
