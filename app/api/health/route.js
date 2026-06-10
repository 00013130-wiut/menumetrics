import { createClient } from '@supabase/supabase-js';

// Connectivity check: confirms the Supabase project is reachable using the
// public anon key. Returns ok:true on any non-network response (RLS may return
// zero rows for an unauthenticated request, which still proves connectivity).
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return Response.json(
      { ok: false, error: 'Missing Supabase env vars' },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(url, key);
    const { error } = await supabase
      .from('restaurants')
      .select('id', { count: 'exact', head: true });

    if (error && /fetch|network|ENOTFOUND|ECONN/i.test(error.message)) {
      return Response.json(
        { ok: false, reachable: false, error: error.message },
        { status: 502 }
      );
    }

    return Response.json({
      ok: true,
      reachable: true,
      project: url,
      note: error ? 'reached Supabase (RLS: ' + error.message + ')' : 'reached Supabase',
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
