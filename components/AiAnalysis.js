'use client';

// AiAnalysis.js — the "AI analysis" card on the dashboard.
// Takes the already-computed dashboard model, boils it down to a compact payload
// (buildPayload), and POSTs it to /api/analyze, which returns a plain-English
// review (headline, what's going well, biggest problem, 3 actions). The result
// is cached per restaurant in the browser (localStorage) so it survives reloads.
// The server decides whether a real LLM or the templated fallback wrote it; this
// component just renders whatever comes back.
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

// Builds the compact analytics payload for /api/analyze from the dashboard model.
function buildPayload(model, restaurant, currency, targetWastePct) {
  const pct = (v) => Math.round((Number(v) || 0) * 1000) / 10; // ratio -> percent, 1dp
  return {
    restaurantName: restaurant?.name || 'the café',
    currency,
    targetWastePct,
    revenue: Math.round(model.totalRevenue),
    grossMarginPct: pct(model.grossMargin),
    totalGrossProfit: Math.round(model.totalGrossProfit),
    wasteRatioPct: pct(model.wasteRatio),
    totalWasteCost: Math.round(model.wasteAnalysis.totalWasteCost),
    unitsSold: model.averages.totalUnits,
    categories: model.categoryCounts,
    topWaste: (model.wasteAnalysis.byIngredient || []).slice(0, 3).map((w) => ({
      name: w.name,
      cost: Math.round(w.totalCost),
      sharePct: pct(w.costShare),
    })),
    topDishesByRevenue: (model.classified || []).slice(0, 6).map((d) => ({
      name: d.name,
      category: d.category,
      marginPct: pct(d.marginPct),
      sharePct: pct(d.menuMixShare),
      grossProfit: Math.round(d.grossProfit),
      revenue: Math.round(d.revenue),
      unitsSold: d.unitsSold,
    })),
    worstDishes: (model.classified || [])
      .filter((d) => d.category === 'Dog' || d.category === 'Plowhorse')
      .slice(0, 4)
      .map((d) => ({
        name: d.name,
        category: d.category,
        marginPct: pct(d.marginPct),
        grossProfit: Math.round(d.grossProfit),
      })),
    advisor: (model.recommendations || []).map((r) => ({
      severity: r.severity,
      message: r.message,
    })),
  };
}

export default function AiAnalysis({ model, restaurant, currency, targetWastePct }) {
  const restaurantId = restaurant?.id;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [stamp, setStamp] = useState(null);

  const cacheKey = restaurantId ? `mm-ai-analysis-${restaurantId}` : null;

  // Load cached analysis for this restaurant on mount.
  useEffect(() => {
    if (!cacheKey) return;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setResult(saved.result);
        setStamp(saved.at);
      }
    } catch {
      /* ignore */
    }
  }, [cacheKey]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = buildPayload(model, restaurant, currency, targetWastePct);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
      const at = new Date().toISOString();
      setStamp(at);
      if (cacheKey)
        localStorage.setItem(cacheKey, JSON.stringify({ result: data, at }));
    } catch (e) {
      setError(e.message || 'Could not generate analysis.');
    }
    setLoading(false);
  }, [model, restaurant, currency, targetWastePct, cacheKey]);

  return (
    <div className="card" style={{ background: 'linear-gradient(180deg,#fff, #fdfaf5)' }}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 className="flex items-center gap-2">
            <Sparkles size={17} className="text-primary" />
            AI analysis
          </h3>
          <div className="card-cap">
            A plain-English read on your month — what&apos;s working, the biggest
            problem, and what to do this week.
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={generate}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Analysing…
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              {result ? 'Regenerate' : 'Generate analysis'}
            </>
          )}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

      {!result && !loading && !error && (
        <div className="empty" style={{ padding: '28px 12px' }}>
          <Sparkles size={26} className="text-primary" style={{ margin: '0 auto 8px' }} />
          <p className="faint">Click <strong>Generate analysis</strong> for an owner-friendly review.</p>
        </div>
      )}

      {loading && !result && (
        <div style={{ marginTop: 14 }}>
          <div className="skeleton" style={{ height: 18, width: '70%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 52, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 70 }} />
        </div>
      )}

      {result && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
            {result.headline}
          </p>

          <div className="grid grid-2" style={{ gap: 14 }}>
            <div>
              <div className="kpi-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} className="text-star" /> Going well
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                {(result.goingWell || []).map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="kpi-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} className="text-plowhorse" /> Biggest problem
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
                {result.biggestProblem}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="kpi-label" style={{ marginBottom: 8 }}>Do this week</div>
            <div className="flex flex-col gap-2">
              {(result.actions || []).map((a, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5"
                  style={{
                    background: 'var(--color-warm-2)',
                    border: '1px solid var(--color-hairline)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 13.5,
                  }}
                >
                  <span
                    style={{
                      background: 'var(--color-primary)',
                      color: '#fff',
                      borderRadius: 999,
                      width: 20,
                      height: 20,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      flex: 'none',
                      marginTop: 1,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span>{a}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="faint" style={{ fontSize: 11, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowRight size={11} />
            {result.source === 'ai'
              ? `Written by ${result.model}`
              : 'Generated summary (add LLM_API_KEY for an AI-written review)'}
            {stamp ? ' · ' + new Date(stamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
          </div>
        </div>
      )}
    </div>
  );
}
