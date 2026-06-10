// =============================================================================
// MenuMetrics — analytics / business logic (pure functions, no I/O)
// -----------------------------------------------------------------------------
// Ported from the original prototype and adapted to the Supabase column names
// (cost_per_unit, menu_price, quantity). Kept pure so it is easy to unit-test
// and to explain line-by-line.
//
//   (1) Recipe / food-cost costing
//   (2) Menu engineering (Kasavana & Smith: Stars / Plowhorses / Puzzles / Dogs)
//   (3) Waste-cost analysis
//   (4) Rule-based advisor (transparent, evidence-carrying recommendations)
// =============================================================================

import { formatMoney, formatPct } from './format.js';

// ---------------------------------------------------------------------------
// 1. COSTING
// ---------------------------------------------------------------------------

// Food cost of one dish = sum over its recipe of (quantity * ingredient cost).
// recipeItems: [{ quantity, cost_per_unit }]
export function dishFoodCost(recipeItems) {
  return (recipeItems || []).reduce(
    (sum, it) => sum + Number(it.quantity || 0) * Number(it.cost_per_unit || 0),
    0
  );
}

export function dishProfitability(menuPrice, foodCost) {
  const price = Number(menuPrice || 0);
  const grossProfit = price - foodCost;
  return {
    grossProfit,
    foodCostPct: price > 0 ? foodCost / price : 0,
    marginPct: price > 0 ? grossProfit / price : 0,
  };
}

// ---------------------------------------------------------------------------
// 2. MENU ENGINEERING
// ---------------------------------------------------------------------------
// Each dish is rated on two axes vs. the menu:
//   - Profitability: gross profit per unit vs. the average gross profit.
//   - Popularity:    its menu-mix share vs. an expected share.
// The "70% rule": popular if share >= popularity_threshold * (1 / n_dishes).
//
//                 HIGH popularity        LOW popularity
//  HIGH profit     STAR                   PUZZLE
//  LOW  profit     PLOWHORSE              DOG
//
// dishes: [{ id, name, menu_price, foodCost, unitsSold, category }]
export function classifyMenu(dishes, popularityThresholdFactor = 0.7) {
  const n = dishes.length;
  if (n === 0) {
    return {
      dishes: [],
      averages: {
        avgGrossProfit: 0,
        expectedShare: 0,
        popularityThreshold: 0,
        totalUnits: 0,
      },
    };
  }

  // Total plates sold across the whole menu — the denominator for "share".
  const totalUnits = dishes.reduce((s, d) => s + (Number(d.unitsSold) || 0), 0);

  // PROFIT axis threshold = the average gross profit per plate across the menu.
  // (Gross profit of one plate = its price − its food cost.) A dish counts as
  // "high profit" if it beats this menu average.
  const grossProfits = dishes.map((d) => Number(d.menu_price) - d.foodCost);
  const avgGrossProfit = grossProfits.reduce((s, g) => s + g, 0) / n;

  // POPULARITY axis threshold (the classic "70% rule"). If every dish sold
  // equally, each would have a 1/n share (expectedShare). A dish counts as
  // "popular" if it reaches at least `factor` (default 0.70) of that fair share.
  // Example: 10 dishes → fair share 10%; threshold = 0.70 × 10% = 7%.
  const expectedShare = 1 / n;
  const popularityThreshold = expectedShare * popularityThresholdFactor;

  const classified = dishes.map((d) => {
    const price = Number(d.menu_price) || 0;
    const grossProfit = price - d.foodCost; // money kept on one plate
    const share = totalUnits > 0 ? (Number(d.unitsSold) || 0) / totalUnits : 0;

    // Where does this dish sit on each axis?
    const highProfit = grossProfit >= avgGrossProfit;
    const highPopularity = share >= popularityThreshold;

    // The Kasavana–Smith 2×2 grid. (Internal keys stay Star/Plowhorse/Puzzle/Dog;
    // the UI shows friendlier labels — see lib/humanize.js → CATEGORY_LABEL.)
    let category;
    if (highProfit && highPopularity) category = 'Star'; // sells a lot AND earns a lot → protect
    else if (!highProfit && highPopularity) category = 'Plowhorse'; // popular but low profit → re-cost
    else if (highProfit && !highPopularity) category = 'Puzzle'; // profitable but few buy it → promote
    else category = 'Dog'; // neither → rework or drop

    return {
      ...d,
      grossProfit,
      foodCostPct: price > 0 ? d.foodCost / price : 0,
      marginPct: price > 0 ? grossProfit / price : 0,
      menuMixShare: share,
      revenue: price * (Number(d.unitsSold) || 0),
      grossProfitTotal: grossProfit * (Number(d.unitsSold) || 0),
      highProfit,
      highPopularity,
      category,
    };
  });

  return {
    dishes: classified,
    averages: { avgGrossProfit, expectedShare, popularityThreshold, totalUnits },
  };
}

// ---------------------------------------------------------------------------
// 3. WASTE ANALYSIS
// ---------------------------------------------------------------------------
// wasteLogs: [{ ingredient_id, name, quantity, cost_per_unit, reason }]
export function analyzeWaste(wasteLogs) {
  const map = new Map();
  let totalWasteCost = 0;

  for (const w of wasteLogs || []) {
    const cost = Number(w.quantity || 0) * Number(w.cost_per_unit || 0);
    totalWasteCost += cost;
    const existing = map.get(w.ingredient_id) || {
      ingredient_id: w.ingredient_id,
      name: w.name,
      totalQuantity: 0,
      totalCost: 0,
      entries: 0,
    };
    existing.totalQuantity += Number(w.quantity || 0);
    existing.totalCost += cost;
    existing.entries += 1;
    map.set(w.ingredient_id, existing);
  }

  const byIngredient = [...map.values()]
    .map((x) => ({
      ...x,
      costShare: totalWasteCost > 0 ? x.totalCost / totalWasteCost : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  return { byIngredient, totalWasteCost };
}

// Waste ratio — what fraction of all the ingredients you paid for ended up in
// the bin instead of in a sold dish. In plain terms:
//
//        wasted ingredient cost
//   ------------------------------------------     (a number between 0 and 1)
//   wasted cost  +  ingredient cost of sales
//
// Lower is better; the dashboard compares it against the restaurant's target %.
// Guard against divide-by-zero when there's no data yet.
export function wasteRatio(totalWasteCost, totalFoodCostSold) {
  const denom = totalWasteCost + totalFoodCostSold;
  return denom > 0 ? totalWasteCost / denom : 0;
}

// ---------------------------------------------------------------------------
// 4. RULE-BASED ADVISOR
// ---------------------------------------------------------------------------
// Each recommendation carries: type, severity, message and the evidence that
// triggered it, so every suggestion is explainable.
//
// targetWastePct is a percentage (e.g. 5 means 5%).
export function buildRecommendations({
  classified,
  averages,
  waste,
  wasteRatioValue,
  targetWastePct = 5,
  currency = "so'm",
}) {
  const recs = [];
  const money = (v) => formatMoney(v, currency);

  for (const d of classified) {
    switch (d.category) {
      case 'Star':
        recs.push({
          type: 'menu',
          severity: 'positive',
          dish: d.name,
          message: `"${d.name}" is a Star (popular & profitable, margin ${formatPct(
            d.marginPct
          )}). Protect it: keep quality consistent, hold the price, and feature it prominently.`,
          evidence: `share ${formatPct(d.menuMixShare)} ≥ threshold ${formatPct(
            averages.popularityThreshold
          )}; gross profit ${money(d.grossProfit)} ≥ avg ${money(
            averages.avgGrossProfit
          )}`,
        });
        break;
      case 'Plowhorse':
        recs.push({
          type: 'menu',
          severity: 'warning',
          dish: d.name,
          message: `"${d.name}" is a Crowd-Pleaser (popular but low margin, ${formatPct(
            d.marginPct
          )}). It draws customers but earns little. Cut its ingredient cost, gently raise the price, or bundle it with a high-margin side.`,
          evidence: `food cost ${formatPct(
            d.foodCostPct
          )} of price; gross profit ${money(d.grossProfit)} < avg ${money(
            averages.avgGrossProfit
          )}`,
        });
        break;
      case 'Puzzle':
        recs.push({
          type: 'menu',
          severity: 'info',
          dish: d.name,
          message: `"${d.name}" is a Hidden Gem (profitable but unpopular). Promote it: reposition it on the menu, add a photo, train staff to recommend it, or run a limited promotion.`,
          evidence: `gross profit ${money(d.grossProfit)} ≥ avg ${money(
            averages.avgGrossProfit
          )}; share ${formatPct(d.menuMixShare)} < threshold ${formatPct(
            averages.popularityThreshold
          )}`,
        });
        break;
      case 'Dog':
        recs.push({
          type: 'menu',
          severity: 'critical',
          dish: d.name,
          message: `"${d.name}" is an Underperformer (unpopular & low margin). Consider removing it, reworking the recipe to cut cost, or replacing it — it consumes menu space and prep time for little return.`,
          evidence: `gross profit ${money(d.grossProfit)} < avg ${money(
            averages.avgGrossProfit
          )}; share ${formatPct(d.menuMixShare)} < threshold ${formatPct(
            averages.popularityThreshold
          )}`,
        });
        break;
      default:
        break;
    }
  }

  // Waste ratio vs. the restaurant's target.
  const target = Number(targetWastePct) / 100;
  if (wasteRatioValue >= target && wasteRatioValue > 0) {
    recs.push({
      type: 'waste',
      severity: wasteRatioValue >= target * 2 ? 'critical' : 'warning',
      message: `Food waste is ${formatPct(
        wasteRatioValue
      )} of ingredient spend, above your ${formatPct(
        target
      )} target. This is money thrown away — every 1% cut goes almost straight to profit.`,
      evidence: `total waste cost ${money(waste.totalWasteCost)}`,
    });
  }

  // Top waste ingredients (large share of waste cost).
  for (const ing of waste.byIngredient.slice(0, 3)) {
    if (ing.costShare >= 0.15) {
      recs.push({
        type: 'waste',
        severity: 'warning',
        ingredient: ing.name,
        message: `"${ing.name}" is ${formatPct(
          ing.costShare
        )} of your waste cost (${money(
          ing.totalCost
        )}). Order it in smaller, more frequent batches, improve storage, or design a special that uses up near-expiry stock.`,
        evidence: `wasted quantity ${ing.totalQuantity} across ${ing.entries} entr${
          ing.entries === 1 ? 'y' : 'ies'
        }`,
      });
    }
  }

  if (recs.length === 0) {
    recs.push({
      type: 'info',
      severity: 'positive',
      message:
        'No critical issues detected. Menu mix and waste levels look healthy — keep monitoring weekly.',
      evidence: '',
    });
  }

  // Sort: most urgent first.
  const order = { critical: 0, warning: 1, info: 2, positive: 3 };
  recs.sort((a, b) => order[a.severity] - order[b.severity]);
  return recs;
}
