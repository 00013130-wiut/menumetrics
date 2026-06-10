// Browser Supabase client (single shared instance).
// Uses the public anon/publishable key. All data access goes through this client
// so Postgres Row-Level Security enforces per-restaurant tenant isolation: a
// logged-in user can only read/write rows belonging to their own restaurant.
//
// IMPORTANT: the client is created LAZILY (on first use), never at import time.
// Next.js statically analyses/prerenders pages at build time, when the
// NEXT_PUBLIC_* env vars may be absent. Creating the client at module load would
// then throw "supabaseUrl is required" and fail the build. By deferring creation
// until a property is actually accessed (at request time / in the browser), the
// build succeeds with no env vars and behaviour at runtime is unchanged — call
// sites still use `supabase.from(...)`, `supabase.auth...` exactly as before.
import { createClient } from '@supabase/supabase-js';

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Read/require the env vars only when the client is actually used — not at
  // import time. A genuinely misconfigured runtime still gets a clear error.
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY (in .env.local locally, or your host’s env).'
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

// Build (or reuse, HMR-safe) the single client instance on first access.
function getClient() {
  if (!globalThis.__menumetricsSupabase) {
    globalThis.__menumetricsSupabase = createSupabaseClient();
  }
  return globalThis.__menumetricsSupabase;
}

// A proxy that defers client creation until a property is read. This keeps every
// existing call site (`supabase.from(...)`, `supabase.auth.getSession()`, …)
// working unchanged while ensuring nothing runs — and nothing throws — at import.
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getClient();
      const value = client[prop];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);
