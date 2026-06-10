import { createClient } from '@supabase/supabase-js';

// =============================================================================
// POST /api/pos/sales  — external POS push endpoint
// -----------------------------------------------------------------------------
// Auth: send the restaurant's api_key in the `x-api-key` header (or
// `Authorization: Bearer <api_key>`). The key maps 1:1 to a restaurant.
//
// Body (JSON):
//   {
//     "sales": [
//       { "date": "2026-06-09", "dish_name": "Osh (Plov)", "quantity": 12 },
//       { "date": "2026-06-09", "dish_id": "<uuid>",        "quantity": 5  }
//     ]
//   }
// Each sale must have date (YYYY-MM-DD) and a positive integer quantity, and
// identify a dish by dish_id OR dish_name (matched case-insensitively).
//
// Response: { inserted, unmatched: [names], errors: [strings] }
//
// Because this runs server-side with no user session, it uses the Supabase
// service_role key to bypass RLS — a real POS integration is a trusted backend
// caller, not a logged-in browser user. Set SUPABASE_SERVICE_ROLE_KEY in the
// environment to enable it.
// =============================================================================

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getApiKey(req) {
  const direct = req.headers.get('x-api-key');
  if (direct) return direct.trim();
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer '))
    return auth.slice(7).trim();
  return null;
}

export async function POST(req) {
  const db = admin();
  if (!db) {
    return Response.json(
      {
        error:
          'POS API not configured. Set SUPABASE_SERVICE_ROLE_KEY in the server environment (.env.local) to enable this endpoint.',
      },
      { status: 503 }
    );
  }

  const apiKey = getApiKey(req);
  if (!apiKey) {
    return Response.json(
      { error: 'Missing API key. Send it in the x-api-key header.' },
      { status: 401 }
    );
  }

  // api_key is a uuid column; reject malformed keys up front so a bad key is a
  // clean 401 rather than a Postgres type error.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(apiKey)) {
    return Response.json({ error: 'Invalid API key.' }, { status: 401 });
  }

  // Resolve restaurant from api_key.
  const { data: restaurant, error: restErr } = await db
    .from('restaurants')
    .select('id, name')
    .eq('api_key', apiKey)
    .maybeSingle();
  if (restErr)
    return Response.json({ error: restErr.message }, { status: 500 });
  if (!restaurant)
    return Response.json({ error: 'Invalid API key.' }, { status: 401 });

  // Parse body.
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body must be valid JSON.' }, { status: 400 });
  }
  const sales = Array.isArray(body?.sales) ? body.sales : null;
  if (!sales) {
    return Response.json(
      { error: 'Expected { "sales": [ ... ] }.' },
      { status: 400 }
    );
  }
  if (sales.length === 0) {
    return Response.json({ inserted: 0, unmatched: [], errors: [] });
  }
  if (sales.length > 5000) {
    return Response.json(
      { error: 'Too many rows in one request (max 5000).' },
      { status: 400 }
    );
  }

  // Load this restaurant's dishes for name/id matching.
  const { data: dishes, error: dishErr } = await db
    .from('dishes')
    .select('id, name')
    .eq('restaurant_id', restaurant.id);
  if (dishErr)
    return Response.json({ error: dishErr.message }, { status: 500 });
  const byId = new Set(dishes.map((d) => d.id));
  const byLcName = Object.fromEntries(
    dishes.map((d) => [d.name.toLowerCase(), d.id])
  );

  const rows = [];
  const errors = [];
  const unmatched = new Set();

  sales.forEach((s, i) => {
    const date = String(s.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`sales[${i}]: date must be YYYY-MM-DD`);
      return;
    }
    const q = Number(s.quantity);
    if (!Number.isInteger(q) || q <= 0) {
      errors.push(`sales[${i}]: quantity must be a positive integer`);
      return;
    }
    let dishId = null;
    if (s.dish_id && byId.has(s.dish_id)) dishId = s.dish_id;
    else if (s.dish_name) {
      const found = byLcName[String(s.dish_name).toLowerCase()];
      if (found) dishId = found;
    }
    if (!dishId) {
      unmatched.add(s.dish_name || s.dish_id || `row ${i}`);
      return;
    }
    rows.push({
      restaurant_id: restaurant.id,
      dish_id: dishId,
      quantity: q,
      sold_on: date,
    });
  });

  let inserted = 0;
  if (rows.length) {
    const { error: insErr } = await db.from('sales').insert(rows);
    if (insErr)
      return Response.json({ error: insErr.message }, { status: 500 });
    inserted = rows.length;

    await db.from('activity_logs').insert({
      restaurant_id: restaurant.id,
      user_email: 'pos-api',
      action: 'import',
      entity: 'sale',
      detail: `POS API push: ${inserted} sales rows`,
    });
  }

  return Response.json({
    inserted,
    unmatched: [...unmatched],
    errors,
  });
}

export async function GET() {
  return Response.json({
    endpoint: 'POST /api/pos/sales',
    auth: 'x-api-key: <restaurant api_key>',
    body: {
      sales: [{ date: 'YYYY-MM-DD', dish_name: 'string|optional', dish_id: 'uuid|optional', quantity: 1 }],
    },
  });
}
