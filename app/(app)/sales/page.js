'use client';

// sales/page.js — four ways to get sales into the system, all scoped to this
// restaurant by RLS:
//   • Add a sale     — a simple manual form.
//   • CSV upload     — columns date, dish_name, quantity; matches names to your
//                      dishes and previews matched / unmatched / invalid rows.
//   • Simulate POS   — generates one realistic day of sales for demos.
//   • POS push API   — documented here; the actual endpoint is /api/pos/sales.
// Also shows recent sales. The CSV parsing/validation lives in lib/csv.js.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useApp } from '@/lib/AppContext';
import { logActivity } from '@/lib/activity';
import { parseSalesCsv, validateSalesRecord } from '@/lib/csv';
import { formatMoney, formatDate } from '@/lib/format';
import { useToast } from '@/components/Toast';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export default function SalesPage() {
  const { profile, restaurant, user, settings } = useApp();
  const restaurantId = profile?.restaurant_id;
  const currency = settings?.currency || "so'm";

  const toast = useToast();
  const [dishes, setDishes] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const [d, s] = await Promise.all([
      supabase.from('dishes').select('id, name, menu_price').order('name'),
      supabase
        .from('sales')
        .select('id, quantity, sold_on, dishes(name, menu_price)')
        .order('sold_on', { ascending: false })
        .limit(50),
    ]);
    if (d.error || s.error) toast.error((d.error || s.error).message);
    else {
      setDishes(d.data || []);
      setRecent(s.data || []);
    }
    setLoading(false);
  }, [restaurantId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const dishByLcName = useMemo(
    () => Object.fromEntries(dishes.map((d) => [d.name.toLowerCase(), d])),
    [dishes]
  );

  const onDone = async (msg) => {
    toast.success(msg);
    await load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sales</h1>
          <div className="subtitle">
            Record sales manually, import a POS export, or simulate a day —{' '}
            {restaurant?.name}
          </div>
        </div>
      </div>

      {dishes.length === 0 && !loading && (
        <div className="alert alert-info">
          You have no dishes yet. Add dishes on the <strong>Menu</strong> page
          (or load demo data) before recording sales.
        </div>
      )}

      <div className="grid grid-2">
        <ManualAdd
          dishes={dishes}
          restaurantId={restaurantId}
          userEmail={user?.email}
          onDone={onDone}
          onError={toast.error}
        />
        <SimulateFeed
          dishes={dishes}
          restaurantId={restaurantId}
          userEmail={user?.email}
          onDone={onDone}
          onError={toast.error}
        />
      </div>

      <CsvUpload
        dishByLcName={dishByLcName}
        restaurantId={restaurantId}
        userEmail={user?.email}
        onDone={onDone}
        onError={toast.error}
      />

      <RecentSales recent={recent} loading={loading} currency={currency} />

      <ApiDocs apiKey={restaurant?.api_key} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Manual add
// ---------------------------------------------------------------------------
function ManualAdd({ dishes, restaurantId, userEmail, onDone, onError }) {
  const [dishId, setDishId] = useState('');
  const [qty, setQty] = useState('1');
  const [date, setDate] = useState(todayYmd());
  const [busy, setBusy] = useState(false);

  async function add() {
    onError('');
    const q = Number(qty);
    if (!dishId) return onError('Pick a dish.');
    if (!Number.isInteger(q) || q <= 0)
      return onError('Quantity must be a positive whole number.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return onError('Pick a valid date.');
    setBusy(true);
    const { error } = await supabase.from('sales').insert({
      restaurant_id: restaurantId,
      dish_id: dishId,
      quantity: q,
      sold_on: date,
    });
    setBusy(false);
    if (error) return onError(error.message);
    const dish = dishes.find((d) => d.id === dishId);
    await logActivity({
      restaurant_id: restaurantId,
      user_email: userEmail,
      action: 'create',
      entity: 'sale',
      detail: `${q} × ${dish?.name} on ${date}`,
    });
    setQty('1');
    onDone(`Recorded ${q} × ${dish?.name}.`);
  }

  return (
    <div className="card">
      <h2>Add a sale</h2>
      <div className="field">
        <label>Dish</label>
        <select value={dishId} onChange={(e) => setDishId(e.target.value)}>
          <option value="">Select dish…</option>
          {dishes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: 1 }}>
          <label>Quantity</label>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>
      <button
        className="btn btn-primary"
        onClick={add}
        disabled={busy || dishes.length === 0}
      >
        {busy ? 'Saving…' : 'Add sale'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulate POS feed
// ---------------------------------------------------------------------------
function SimulateFeed({ dishes, restaurantId, userEmail, onDone, onError }) {
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(todayYmd());

  async function simulate() {
    onError('');
    if (dishes.length === 0) return onError('Add dishes first.');
    setBusy(true);
    // One realistic day: most dishes sell, with varied volumes.
    const rows = [];
    for (const d of dishes) {
      if (Math.random() < 0.85) {
        const q = Math.floor(Math.random() * 14) + 1;
        rows.push({
          restaurant_id: restaurantId,
          dish_id: d.id,
          quantity: q,
          sold_on: date,
        });
      }
    }
    const { error } = await supabase.from('sales').insert(rows);
    setBusy(false);
    if (error) return onError(error.message);
    const total = rows.reduce((s, r) => s + r.quantity, 0);
    await logActivity({
      restaurant_id: restaurantId,
      user_email: userEmail,
      action: 'simulate',
      entity: 'sale',
      detail: `Simulated POS feed: ${total} units across ${rows.length} dishes on ${date}`,
    });
    onDone(`Simulated ${total} units across ${rows.length} dishes for ${date}.`);
  }

  return (
    <div className="card">
      <h2>Simulate POS feed</h2>
      <p className="muted" style={{ fontSize: '0.88rem' }}>
        Generates one realistic day of sales across your menu — handy for a quick
        demo without a real POS connected.
      </p>
      <div className="field">
        <label>Day to simulate</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <button
        className="btn"
        onClick={simulate}
        disabled={busy || dishes.length === 0}
      >
        {busy ? 'Generating…' : '🎲 Simulate a day of sales'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV upload
// ---------------------------------------------------------------------------
function CsvUpload({ dishByLcName, restaurantId, userEmail, onDone, onError }) {
  const [preview, setPreview] = useState(null); // { matched, unmatched, invalid }
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  function onFile(e) {
    onError('');
    setPreview(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const { records, errors } = parseSalesCsv(reader.result);
      if (errors.length) {
        onError('CSV problem: ' + errors.join(' '));
        return;
      }
      const matched = [];
      const unmatched = [];
      const invalid = [];
      for (const rec of records) {
        const v = validateSalesRecord(rec);
        if (v) {
          invalid.push({ ...rec, reason: v });
          continue;
        }
        const dish = dishByLcName[rec.dish_name.toLowerCase()];
        if (!dish) {
          unmatched.push(rec);
        } else {
          matched.push({ ...rec, dish });
        }
      }
      setPreview({ matched, unmatched, invalid });
    };
    reader.readAsText(file);
  }

  async function commit() {
    if (!preview || preview.matched.length === 0) return;
    setBusy(true);
    onError('');
    const rows = preview.matched.map((m) => ({
      restaurant_id: restaurantId,
      dish_id: m.dish.id,
      quantity: Number(m.quantity),
      sold_on: m.date,
    }));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase
        .from('sales')
        .insert(rows.slice(i, i + 200));
      if (error) {
        setBusy(false);
        return onError('Import failed: ' + error.message);
      }
      inserted += rows.slice(i, i + 200).length;
    }
    await logActivity({
      restaurant_id: restaurantId,
      user_email: userEmail,
      action: 'import',
      entity: 'sale',
      detail: `CSV import: ${inserted} sales rows from ${fileName}`,
    });
    setBusy(false);
    setPreview(null);
    setFileName('');
    onDone(`Imported ${inserted} sales rows.`);
  }

  return (
    <div className="card">
      <div className="row-between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Import sales CSV</h2>
        <a className="pill" href="/sample-sales.csv" download>
          ⬇ sample CSV
        </a>
      </div>
      <p className="muted" style={{ fontSize: '0.88rem' }}>
        Columns: <span className="mono">date, dish_name, quantity</span> (date as
        YYYY-MM-DD). Dish names are matched to your menu (case-insensitive).
      </p>
      <input type="file" accept=".csv,text/csv" onChange={onFile} />

      {preview && (
        <div style={{ marginTop: 16 }}>
          <div className="toolbar">
            <span className="badge badge-star">{preview.matched.length} matched</span>
            {preview.unmatched.length > 0 && (
              <span className="badge badge-plowhorse">
                {preview.unmatched.length} unmatched
              </span>
            )}
            {preview.invalid.length > 0 && (
              <span className="badge badge-dog">{preview.invalid.length} invalid</span>
            )}
          </div>

          {preview.matched.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Dish</th>
                    <th className="num">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.matched.slice(0, 50).map((m, i) => (
                    <tr key={i}>
                      <td>{m.date}</td>
                      <td>{m.dish.name}</td>
                      <td className="num">{m.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.matched.length > 50 && (
                <div className="faint" style={{ padding: '8px 12px' }}>
                  …and {preview.matched.length - 50} more
                </div>
              )}
            </div>
          )}

          {preview.unmatched.length > 0 && (
            <div className="alert alert-info">
              <strong>Unmatched dish names</strong> (these rows will be skipped —
              add the dishes or fix the names):
              <div className="mono" style={{ marginTop: 6 }}>
                {[...new Set(preview.unmatched.map((u) => u.dish_name))].join(', ')}
              </div>
            </div>
          )}

          {preview.invalid.length > 0 && (
            <div className="alert alert-error">
              <strong>Invalid rows skipped:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {preview.invalid.slice(0, 8).map((iv, i) => (
                  <li key={i} className="mono" style={{ fontSize: '0.8rem' }}>
                    {iv.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={commit}
            disabled={busy || preview.matched.length === 0}
          >
            {busy
              ? 'Importing…'
              : `Import ${preview.matched.length} matched row${
                  preview.matched.length === 1 ? '' : 's'
                }`}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent sales
// ---------------------------------------------------------------------------
function RecentSales({ recent, loading, currency }) {
  if (loading)
    return (
      <div className="card">
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    );
  return (
    <div className="card">
      <h2>Recent sales</h2>
      {recent.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🧾</div>
          <p>No sales recorded yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Dish</th>
                <th className="num">Qty</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.sold_on)}</td>
                  <td>{r.dishes?.name || '—'}</td>
                  <td className="num">{r.quantity}</td>
                  <td className="num">
                    {formatMoney((r.dishes?.menu_price || 0) * r.quantity, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// API documentation
// ---------------------------------------------------------------------------
function ApiDocs({ apiKey }) {
  const [show, setShow] = useState(false);
  const example = `curl -X POST ${
    typeof window !== 'undefined' ? window.location.origin : ''
  }/api/pos/sales \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey || 'YOUR_RESTAURANT_API_KEY'}" \\
  -d '{
    "sales": [
      { "date": "2026-06-09", "dish_name": "Osh (Plov)", "quantity": 12 },
      { "date": "2026-06-09", "dish_id": "<uuid>", "quantity": 5 }
    ]
  }'`;

  return (
    <div className="card">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>POS push API</h2>
        <button className="btn btn-sm" onClick={() => setShow((s) => !s)}>
          {show ? 'Hide' : 'Show'} integration docs
        </button>
      </div>
      {show && (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            A real POS (e.g. Poster, iiko, r_keeper) can push sales to{' '}
            <span className="mono">POST /api/pos/sales</span>. Authenticate with
            your restaurant&apos;s API key in the{' '}
            <span className="mono">x-api-key</span> header. Each sale matches a
            dish by <span className="mono">dish_id</span> or by{' '}
            <span className="mono">dish_name</span>.
          </p>
          <div className="field">
            <label>Your restaurant API key</label>
            <input readOnly value={apiKey || ''} className="mono" />
          </div>
          <label>Example request</label>
          <pre
            className="mono"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              overflowX: 'auto',
              fontSize: '0.8rem',
            }}
          >
            {example}
          </pre>
          <p className="faint" style={{ fontSize: '0.82rem' }}>
            Response: <span className="mono">{`{ inserted, unmatched, errors }`}</span>.
            Unmatched dish names are reported, not inserted. (The route requires
            the server-side SUPABASE_SERVICE_ROLE_KEY to be configured.)
          </p>
        </div>
      )}
    </div>
  );
}
