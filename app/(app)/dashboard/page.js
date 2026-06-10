'use client';

// dashboard/page.js — the analytics dashboard (the heart of the app).
// Loads this restaurant's raw rows (dishes, recipes, ingredients, sales, waste),
// then in ONE useMemo runs them through lib/analytics.js to build the whole
// model: food cost & margin per dish, the Kasavana–Smith classification, waste
// figures, the advisor recommendations, and the chart data. Everything below is
// presentation of that model: a plain-English summary, KPI cards, the AI card,
// charts (components/charts.js), the advisor list, and the dishes table.
// Settings (currency, thresholds) feed in live, so editing them re-runs the maths.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, Wallet, Trash2, UtensilsCrossed } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useApp } from '@/lib/AppContext';
import {
  dishFoodCost,
  classifyMenu,
  analyzeWaste,
  wasteRatio,
  buildRecommendations,
} from '@/lib/analytics';
import {
  summarySentence,
  kpiMeaning,
  dishBlurb,
  CATEGORY_MEANING,
  CATEGORY_LABEL,
} from '@/lib/humanize';
import { formatMoney, formatPct, formatNumber } from '@/lib/format';
import {
  MenuMatrixChart,
  RevenueWasteChart,
  UnitsBarChart,
  CategoryDonut,
  CAT_COLOR,
} from '@/components/charts';
import InfoTooltip from '@/components/InfoTooltip';
import AiAnalysis from '@/components/AiAnalysis';

const CAT_BADGE = {
  Star: 'badge-star',
  Plowhorse: 'badge-plowhorse',
  Puzzle: 'badge-puzzle',
  Dog: 'badge-dog',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { profile, restaurant, settings } = useApp();
  const restaurantId = profile?.restaurant_id;
  const currency = settings?.currency || "so'm";
  const popFactor = Number(settings?.popularity_threshold) || 0.7;
  const targetWastePct = Number(settings?.target_waste_pct) || 5;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const [dishes, recipes, ingredients, sales, waste] = await Promise.all([
      supabase.from('dishes').select('id, name, category, menu_price'),
      supabase.from('recipe_items').select('dish_id, ingredient_id, quantity'),
      supabase.from('ingredients').select('id, name, cost_per_unit'),
      supabase.from('sales').select('dish_id, quantity, sold_on'),
      supabase
        .from('waste_logs')
        .select('ingredient_id, quantity, reason, logged_on'),
    ]);
    const err =
      dishes.error || recipes.error || ingredients.error || sales.error || waste.error;
    if (err) setError(err.message);
    else
      setRaw({
        dishes: dishes.data || [],
        recipes: recipes.data || [],
        ingredients: ingredients.data || [],
        sales: sales.data || [],
        waste: waste.data || [],
      });
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  const model = useMemo(() => {
    if (!raw) return null;
    const { dishes, recipes, ingredients, sales, waste } = raw;
    const ingById = Object.fromEntries(ingredients.map((i) => [i.id, i]));

    const recipeByDish = {};
    for (const r of recipes) {
      (recipeByDish[r.dish_id] ||= []).push({
        quantity: r.quantity,
        cost_per_unit: ingById[r.ingredient_id]?.cost_per_unit || 0,
      });
    }
    const unitsByDish = {};
    for (const s of sales)
      unitsByDish[s.dish_id] = (unitsByDish[s.dish_id] || 0) + Number(s.quantity);

    const dishesEnriched = dishes.map((d) => ({
      ...d,
      foodCost: dishFoodCost(recipeByDish[d.id] || []),
      unitsSold: unitsByDish[d.id] || 0,
    }));

    const { dishes: classified, averages } = classifyMenu(dishesEnriched, popFactor);

    const totalRevenue = classified.reduce((s, d) => s + d.revenue, 0);
    const totalGrossProfit = classified.reduce((s, d) => s + d.grossProfitTotal, 0);
    const grossMargin = totalRevenue > 0 ? totalGrossProfit / totalRevenue : 0;
    const totalFoodCostSold = classified.reduce(
      (s, d) => s + d.foodCost * d.unitsSold,
      0
    );

    const wasteWithCost = waste.map((w) => ({
      ...w,
      name: ingById[w.ingredient_id]?.name || 'Unknown',
      cost_per_unit: ingById[w.ingredient_id]?.cost_per_unit || 0,
    }));
    const wasteAnalysis = analyzeWaste(wasteWithCost);
    const wr = wasteRatio(wasteAnalysis.totalWasteCost, totalFoodCostSold);

    const recommendations = buildRecommendations({
      classified,
      averages,
      waste: wasteAnalysis,
      wasteRatioValue: wr,
      targetWastePct,
      currency,
    });

    const priceById = Object.fromEntries(
      dishes.map((d) => [d.id, Number(d.menu_price)])
    );
    const revByDay = {};
    for (const s of sales)
      revByDay[s.sold_on] =
        (revByDay[s.sold_on] || 0) + Number(s.quantity) * (priceById[s.dish_id] || 0);
    const wasteByDay = {};
    for (const w of wasteWithCost)
      wasteByDay[w.logged_on] =
        (wasteByDay[w.logged_on] || 0) + Number(w.quantity) * w.cost_per_unit;
    const allDates = [
      ...new Set([...Object.keys(revByDay), ...Object.keys(wasteByDay)]),
    ].sort();
    const series = [];
    if (allDates.length) {
      const start = new Date(allDates[0]);
      const end = new Date(allDates[allDates.length - 1]);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        series.push({
          date: key.slice(5),
          revenue: revByDay[key] || 0,
          waste: wasteByDay[key] || 0,
        });
      }
    }

    const scatter = classified
      .filter((d) => d.unitsSold > 0 || d.foodCost > 0)
      .map((d) => ({
        name: d.name,
        x: d.menuMixShare * 100,
        y: d.marginPct * 100,
        z: d.revenue,
        units: d.unitsSold,
        category: d.category,
      }));

    const sortedByUnits = [...classified].sort((a, b) => b.unitsSold - a.unitsSold);
    const bar = sortedByUnits.map((d) => ({
      name: d.name,
      units: d.unitsSold,
      category: d.category,
    }));

    const categoryCounts = classified.reduce((acc, d) => {
      acc[d.category] = (acc[d.category] || 0) + 1;
      return acc;
    }, {});
    const unitsByCat = {};
    for (const d of classified)
      unitsByCat[d.category] = (unitsByCat[d.category] || 0) + d.unitsSold;
    const donut = ['Star', 'Plowhorse', 'Puzzle', 'Dog']
      .map((c) => ({ name: c, value: unitsByCat[c] || 0 }))
      .filter((d) => d.value > 0);

    return {
      classified: [...classified].sort((a, b) => b.revenue - a.revenue),
      averages,
      totalRevenue,
      grossMargin,
      totalGrossProfit,
      wasteAnalysis,
      wasteRatio: wr,
      recommendations,
      series,
      scatter,
      bar,
      donut,
      categoryCounts,
      hasSales: sales.length > 0,
      counts: { dishes: dishes.length, sales: sales.length, waste: waste.length },
    };
  }, [raw, popFactor, targetWastePct, currency]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <div className="alert alert-error">{error}</div>;

  if (!model || model.counts.dishes === 0) {
    return (
      <>
        <Header restaurant={restaurant} />
        <div className="card empty">
          <div className="empty-icon">📊</div>
          <p className="mb-3">
            No data yet — add dishes and record sales, or load the demo menu.
          </p>
          <div className="flex gap-2.5 justify-center">
            <Link href="/menu" className="btn btn-primary btn-sm">
              Go to Menu
            </Link>
            <Link href="/sales" className="btn btn-sm">
              Record sales
            </Link>
          </div>
        </div>
      </>
    );
  }

  const cc = model.categoryCounts;

  return (
    <>
      <Header restaurant={restaurant} />

      {/* Plain-English summary */}
      <div className="card mb-[18px] border-l-[3px] border-l-primary">
        <div className="flex items-start gap-3">
          <span className="text-xl leading-none mt-0.5">📌</span>
          <div>
            <div className="text-[11.5px] uppercase tracking-[0.07em] text-muted font-semibold mb-1">
              In plain English
            </div>
            <p className="text-[15px] leading-relaxed m-0 text-ink">
              {summarySentence(model, currency, targetWastePct)}
            </p>
          </div>
        </div>
      </div>

      {!model.hasSales && (
        <div className="alert alert-info">
          No sales recorded yet — popularity classifications will be limited. Add
          sales on the <Link href="/sales" className="font-semibold underline">Sales</Link> page.
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-4 mb-[18px]">
        <KpiCard
          icon={TrendingUp}
          label="Revenue"
          value={formatMoney(model.totalRevenue, currency)}
          meaning={kpiMeaning('revenue', model, currency, targetWastePct)}
          sub={`${formatNumber(model.averages.totalUnits)} items sold`}
        />
        <KpiCard
          icon={Wallet}
          label="Profit margin"
          value={formatPct(model.grossMargin)}
          meaning={kpiMeaning('margin', model, currency, targetWastePct)}
          sub={`${formatMoney(model.totalGrossProfit, currency)} kept after food cost`}
          tip="Profit margin = the share of each sale left after ingredient costs. Higher is better."
        />
        <KpiCard
          icon={Trash2}
          label="Waste ratio"
          value={formatPct(model.wasteRatio)}
          meaning={kpiMeaning('waste', model, currency, targetWastePct)}
          sub={`${formatMoney(model.wasteAnalysis.totalWasteCost, currency)} · target ${targetWastePct}%`}
          tone={model.wasteRatio > targetWastePct / 100 ? 'bad' : 'good'}
          tip="Waste ratio = wasted ingredient cost as a share of total ingredient spend."
        />
        <KpiCard
          icon={UtensilsCrossed}
          label="Menu health"
          value={`${cc.Star || 0} ★`}
          meaning={kpiMeaning('menu', model, currency, targetWastePct)}
          sub={`${cc.Star || 0} stars · ${cc.Puzzle || 0} hidden gems · ${cc.Plowhorse || 0} crowd-pleasers · ${cc.Dog || 0} underperformers`}
        />
      </div>

      {/* AI analysis */}
      <div className="mb-[18px]">
        <AiAnalysis
          model={model}
          restaurant={restaurant}
          currency={currency}
          targetWastePct={targetWastePct}
        />
      </div>

      {/* Matrix + advisor */}
      <div className="grid mb-[18px]" style={{ gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)' }}>
        <div className="card">
          <h3 className="flex items-center gap-1.5">
            Menu map
            <InfoTooltip text="Every dish placed by how often it sells (left↔right) and how much profit it makes (bottom↕top). The corner tells you what to do." />
          </h3>
          <div className="card-cap">Which dishes to keep, fix, promote or drop</div>
          <MenuMatrixChart
            data={model.scatter}
            popularityThresholdPct={model.averages.popularityThreshold * 100}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-[12px] text-soft">
            {Object.entries(CATEGORY_MEANING).map(([cat, meaning]) => (
              <span key={cat} className="inline-flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CAT_COLOR[cat] }} />
                <strong className="font-semibold">{CATEGORY_LABEL[cat]}</strong> = {meaning}
              </span>
            ))}
          </div>
          <div className="faint mt-2.5" style={{ fontSize: '11px' }}>
            Based on the Kasavana–Smith menu-engineering model
            (Star / Plowhorse / Puzzle / Dog).
          </div>
        </div>

        <Advisor recommendations={model.recommendations} />
      </div>

      {/* Trend + donut */}
      <div className="grid mb-[18px]" style={{ gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)' }}>
        <div className="card">
          <h3>Revenue vs waste</h3>
          <div className="card-cap">Daily money in (green) against money wasted (red)</div>
          {model.series.length > 1 ? (
            <RevenueWasteChart data={model.series} currency={currency} />
          ) : (
            <div className="empty"><p className="faint">Not enough dated data for a trend yet.</p></div>
          )}
        </div>
        <div className="card">
          <h3>Sales by category</h3>
          <div className="card-cap">Share of items sold by menu class</div>
          {model.donut.length ? (
            <CategoryDonut data={model.donut} />
          ) : (
            <div className="empty"><p className="faint">No sales yet.</p></div>
          )}
        </div>
      </div>

      {/* Units bar */}
      <div className="card mb-[18px]">
        <h3>Most-ordered dishes</h3>
        <div className="card-cap">Units sold per dish, coloured by class</div>
        {model.bar.some((b) => b.units > 0) ? (
          <UnitsBarChart data={model.bar} />
        ) : (
          <div className="empty"><p className="faint">No sales yet.</p></div>
        )}
      </div>

      {/* Dishes table */}
      <DishTable dishes={model.classified} currency={currency} />
    </>
  );
}

// ---------------------------------------------------------------------------
function Header({ restaurant }) {
  return (
    <div className="page-head">
      <div>
        <h1>
          {greeting()}
          {restaurant?.name ? `, ${restaurant.name}` : ''}
        </h1>
        <div className="subtitle">Menu &amp; waste performance — last 30 days</div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, meaning, sub, tone, tip }) {
  const valueColor =
    tone === 'bad' ? 'var(--color-primary-dark)' : tone === 'good' ? 'var(--color-star)' : 'var(--color-ink)';
  return (
    <div className="kpi">
      <div className="flex items-center justify-between">
        <div className="kpi-label flex items-center gap-1.5">
          {label}
          {tip && <InfoTooltip text={tip} size={12} />}
        </div>
        {Icon && <Icon size={16} className="text-muted" />}
      </div>
      <div className="kpi-value" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="text-[12px] text-soft mt-1.5 leading-snug">{meaning}</div>
      {sub && <div className="kpi-sub mt-1">{sub}</div>}
    </div>
  );
}

function Advisor({ recommendations }) {
  const TAG = {
    positive: { label: 'Protect', cls: 'badge-star' },
    info: { label: 'Promote', cls: 'badge-puzzle' },
    warning: { label: 'Improve', cls: 'badge-plowhorse' },
    critical: { label: 'Act now', cls: 'badge-dog' },
  };
  return (
    <div className="card">
      <h3>Advisor</h3>
      <div className="card-cap">What to do, and why</div>
      <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
        {recommendations.map((r, i) => {
          const tag = TAG[r.severity] || TAG.info;
          return (
            <div key={i} className={'rec rec-' + r.severity}>
              <span className={'badge ' + tag.cls}>{tag.label}</span>
              <div className="rec-msg mt-1.5">{r.message}</div>
              {r.evidence && <div className="rec-evidence">{r.evidence}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DishTable({ dishes, currency }) {
  return (
    <div className="card">
      <h3>Dish performance</h3>
      <div className="card-cap">Sorted by revenue — hover a dish for a plain-English read</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dish</th>
              <th>Class</th>
              <th className="num">Sold</th>
              <th className="num">
                <span className="inline-flex items-center gap-1">Share of sales <InfoTooltip text="How big a slice of all items sold this dish makes up." size={11} /></span>
              </th>
              <th className="num">Price</th>
              <th className="num">Food cost</th>
              <th className="num">Margin</th>
              <th className="num">
                <span className="inline-flex items-center gap-1">Profit per dish <InfoTooltip text="What you keep on one serving after ingredient cost (price − food cost)." size={11} /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {dishes.map((d) => (
              <tr key={d.id} title={dishBlurb(d, currency)}>
                <td className="font-medium">{d.name}</td>
                <td>
                  <span className={'badge ' + (CAT_BADGE[d.category] || 'badge-muted')}>
                    {CATEGORY_LABEL[d.category] || d.category}
                  </span>
                </td>
                <td className="num">{formatNumber(d.unitsSold)}</td>
                <td className="num">{formatPct(d.menuMixShare)}</td>
                <td className="num">{formatMoney(d.menu_price, currency)}</td>
                <td className="num">{formatMoney(d.foodCost, currency)}</td>
                <td className="num">{formatPct(d.marginPct)}</td>
                <td className="num">{formatMoney(d.grossProfit, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="skeleton h-7 w-64 mb-2" />
          <div className="skeleton h-4 w-48" />
        </div>
      </div>
      <div className="skeleton h-16 w-full mb-[18px] rounded-2xl" />
      <div className="grid grid-4 mb-[18px]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi">
            <div className="skeleton h-20 w-full" />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="skeleton h-72 w-full" />
      </div>
    </>
  );
}
