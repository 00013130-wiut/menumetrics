'use client';

// waste/page.js — log spoiled / wasted ingredients and see what it costs.
// Each entry is ingredient + quantity + reason + date. The page totals the cost
// (quantity × ingredient cost) and ranks the worst offenders using analyzeWaste
// from lib/analytics.js. These entries feed the dashboard's waste ratio.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useApp } from '@/lib/AppContext';
import { logActivity } from '@/lib/activity';
import { analyzeWaste } from '@/lib/analytics';
import { formatMoney, formatDate, formatPct } from '@/lib/format';
import { useToast } from '@/components/Toast';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

const REASONS = ['Spoiled', 'Expired', 'Over-prep', 'Trim / portioning', 'Damaged', 'Other'];

export default function WastePage() {
  const { profile, restaurant, user, settings } = useApp();
  const restaurantId = profile?.restaurant_id;
  const currency = settings?.currency || "so'm";

  const toast = useToast();
  const [ingredients, setIngredients] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // form
  const [ingId, setIngId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('Spoiled');
  const [date, setDate] = useState(todayYmd());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const [ing, w] = await Promise.all([
      supabase.from('ingredients').select('id, name, unit, cost_per_unit').order('name'),
      supabase
        .from('waste_logs')
        .select('id, ingredient_id, quantity, reason, logged_on, ingredients(name, unit, cost_per_unit)')
        .order('logged_on', { ascending: false })
        .limit(200),
    ]);
    if (ing.error || w.error) toast.error((ing.error || w.error).message);
    else {
      setIngredients(ing.data || []);
      setLogs(w.data || []);
    }
    setLoading(false);
  }, [restaurantId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const withCost = logs.map((w) => ({
      ingredient_id: w.ingredient_id,
      name: w.ingredients?.name || 'Unknown',
      quantity: w.quantity,
      cost_per_unit: w.ingredients?.cost_per_unit || 0,
    }));
    return analyzeWaste(withCost);
  }, [logs]);

  async function add() {
    const q = Number(qty);
    if (!ingId) return toast.error('Pick an ingredient.');
    if (Number.isNaN(q) || q <= 0) return toast.error('Quantity must be greater than 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast.error('Pick a valid date.');
    setBusy(true);
    const { error: insErr } = await supabase.from('waste_logs').insert({
      restaurant_id: restaurantId,
      ingredient_id: ingId,
      quantity: q,
      reason,
      logged_on: date,
    });
    setBusy(false);
    if (insErr) return toast.error(insErr.message);
    const ing = ingredients.find((i) => i.id === ingId);
    await logActivity({
      restaurant_id: restaurantId,
      user_email: user?.email,
      action: 'create',
      entity: 'waste',
      detail: `${q} ${ing?.unit || ''} ${ing?.name} — ${reason}`,
    });
    setQty('');
    await load();
    toast.success('Waste logged.');
  }

  async function remove(w) {
    if (!window.confirm('Delete this waste entry?')) return;
    const { error: delErr } = await supabase.from('waste_logs').delete().eq('id', w.id);
    if (delErr) return toast.error(delErr.message);
    await logActivity({
      restaurant_id: restaurantId,
      user_email: user?.email,
      action: 'delete',
      entity: 'waste',
      detail: `${w.quantity} ${w.ingredients?.name || ''}`,
    });
    await load();
    toast.success('Waste entry deleted.');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Waste</h1>
          <div className="subtitle">Log spoilage and track waste cost · {restaurant?.name}</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Log waste</h2>
          {ingredients.length === 0 ? (
            <div className="alert alert-info">Add ingredients on the Menu page first.</div>
          ) : (
            <>
              <div className="field">
                <label>Ingredient</label>
                <select value={ingId} onChange={(e) => setIngId(e.target.value)}>
                  <option value="">Select ingredient…</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Quantity{ingId ? ' (' + (ingredients.find((i) => i.id === ingId)?.unit || '') + ')' : ''}</label>
                  <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Reason</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" onClick={add} disabled={busy}>
                {busy ? 'Saving…' : 'Log waste'}
              </button>
            </>
          )}
        </div>

        <div className="card">
          <h2>Top waste by cost</h2>
          <div className="kpi-label" style={{ marginBottom: 12 }}>
            Total waste cost: <strong style={{ color: 'var(--red)' }}>{formatMoney(summary.totalWasteCost, currency)}</strong>
          </div>
          {summary.byIngredient.length === 0 ? (
            <p className="faint">No waste logged yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th className="num">Qty</th>
                    <th className="num">Cost</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byIngredient.slice(0, 6).map((x) => (
                    <tr key={x.ingredient_id}>
                      <td>{x.name}</td>
                      <td className="num">{x.totalQuantity}</td>
                      <td className="num">{formatMoney(x.totalCost, currency)}</td>
                      <td className="num">{formatPct(x.costShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Waste log</h2>
        {loading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : logs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🗑️</div>
            <p>No waste entries yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ingredient</th>
                  <th className="num">Qty</th>
                  <th>Reason</th>
                  <th className="num">Cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((w) => (
                  <tr key={w.id}>
                    <td>{formatDate(w.logged_on)}</td>
                    <td>{w.ingredients?.name || '—'}</td>
                    <td className="num">
                      {w.quantity} {w.ingredients?.unit || ''}
                    </td>
                    <td>
                      <span className="pill">{w.reason || '—'}</span>
                    </td>
                    <td className="num">
                      {formatMoney((w.ingredients?.cost_per_unit || 0) * w.quantity, currency)}
                    </td>
                    <td className="num">
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--red)' }}
                        onClick={() => remove(w)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
