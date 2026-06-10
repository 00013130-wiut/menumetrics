// Browser Supabase client (singleton).
// Uses the public anon/publishable key. All data access goes through this client
// so Postgres Row-Level Security enforces per-restaurant tenant isolation: a
// logged-in user can only read/write rows belonging to their own restaurant.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfaced clearly during dev if .env.local is missing.
  console.error(
    'Missing Supabase env vars. Add NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.'
  );
}

// A single client instance is reused across the app (HMR-safe via globalThis).
let client = globalThis.__menumetricsSupabase;
if (!client) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  globalThis.__menumetricsSupabase = client;
}

export const supabase = client;
