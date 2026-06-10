// =============================================================================
// MenuMetrics - Business Logic Layer
// -----------------------------------------------------------------------------
// Pure, dependency-free functions implementing:
//   (1) Recipe / food-cost costing
//   (2) Menu-engineering classification (Stars / Plowhorses / Puzzles / Dogs)
//   (3) Waste-cost analysis
//   (4) The rule-based "smart advisor" recommendation engine
//
// These functions are deliberately pure (no DB, no I/O) so they can be unit
// tested in isolation and explained line-by-line in the viva.
// =============================================================================

'use strict';

// ---------------------------------------------------------------------------
// 1. COSTING
// ---------------------------------------------------------------------------

/**
 * Food cost of a single dish = sum over its recipe of (quantity * unit cost).
 * @param {Array<{quantity:number, costPerUnit:number}>} recipeItems
 * @returns {number} total ingredient cost of the dish
 */
function dishFoodCost(recipeItems) {
  return recipeItems.reduce(
    (sum, item) => sum + item.quantity * item.costPerUnit,
    0
  );
}

/**
 * Per-dish profitability metrics.
 * @param {number} menuPrice  selling price
 * @param {number} foodCost   ingredient cost (from dishFoodCost)
 */
function dishProfitability(menuPrice, foodCost) {
  const grossProfit = menuPrice - foodCost;
  const foodCostPct = menuPrice > 0 ? foodCost / menuPrice : 0;
  const marginPct = menuPrice > 0 ? grossProfit / menuPrice : 0;
  return { grossProfit, foodCostPct, marginPct };
}

// ---------------------------------------------------------------------------
// 2. MENU ENGINEERING
// ---------------------------------------------------------------------------
// Classic menu-engineering model (Kasavana & Smith). Each dish is rated on two
// axes against the menu averages:
//   - Profitability: gross profit per unit vs. the average gross profit.
//   - Popularity:    its share of total sales (menu mix) vs. an expected share.
//
// The widely used "70% rule": a dish is "popular" if its menu-mix share is at
// least 70% of the equal-share baseline (1 / number_of_dishes).
//
//                 HIGH popularity        LOW popularity
//  HIGH profit     STAR                   PUZZLE
//  LOW  profit     PLOWHORSE              DOG
// ---------------------------------------------------------------------------

/**
 * Classify every dish on the menu-engineering matrix.
 * @param {Array<{id:number,name:string,menuPrice:number,foodCost:number,unitsSold:number}>} dishes
 * @param {number} popularityRuleFactor  defaults to 0.70 (the "70% rule")
 * @returns {{dishes:Array, averages:{avgGrossProfit:number, expectedShare:number, popularityThreshold:number, totalUnits:number}}}
 */
function classifyMenu(dishes, popularityRuleFactor = 0.7) {
  const n = dishes.length;
  if (n === 0) {
    return {
      dishes: [],
      averages: { avgGrossProfit: 0, expectedShare: 0, popularityThreshold: 0, totalUnits: 0 },
    };
  }

  const totalUnits = dishes.reduce((s, d) => s + (d.unitsSold || 0), 0);

  // Average gross profit across the menu (profitability axis threshold).
  const grossProfits = dishes.map((d) => d.menuPrice - d.foodCost);
  const avgGrossProfit = grossProfits.reduce((s, g) => s + g, 0) / n;

  // Popularity axis threshold (the 70% rule).
  const expectedShare = 1 / n;
  const popularityThreshold = expectedShare * popularityRuleFactor;

  const classified = dishes.map((d) => {
    const grossProfit = d.menuPrice - d.foodCost;
    const share = totalUnits > 0 ? (d.unitsSold || 0) / totalUnits : 0;

    const highProfit = grossProfit >= avgGrossProfit;
    const highPopularity = share >= popularityThreshold;

    let category;
    if (highProfit && highPopularity) category = 'Star';
    else if (!highProfit && highPopularity) category = 'Plowhorse';
    else if (highProfit && !highPopularity) category = 'Puzzle';
    else category = 'Dog';

    return {
      ...d,
      grossProfit,
      foodCostPct: d.menuPrice > 0 ? d.foodCost / d.menuPrice : 0,
      marginPct: d.menuPrice > 0 ? grossProfit / d.menuPrice : 0,
      menuMixShare: share,
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

/**
 * Aggregate waste cost by ingredient.
 * @param {Array<{ingredientId:number, name:string, quantity:number, costPerUnit:number, reason:string}>} wasteLogs
 * @returns {{byIngredient:Array, totalWasteCost:number}}
 */
function analyzeWaste(wasteLogs) {
  const map = new Map();
  let totalWasteCost = 0;

  for (const w of wasteLogs) {
    const cost = w.quantity * w.costPerUnit;
    totalWasteCost += cost;
    const existing = map.get(w.ingredientId) || {
      ingredientId: w.ingredientId,
      name: w.name,
      totalQuantity: 0,
      totalCost: 0,
    };
    existing.totalQuantity += w.quantity;
    existing.totalCost += cost;
    map.set(w.ingredientId, existing);
  }

  const byIngredient = [...map.values()]
    .map((x) => ({
      ...x,
      costShare: totalWasteCost > 0 ? x.totalCost / totalWasteCost : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  return { byIngredient, totalWasteCost };
}

/**
 * Waste as a percentage of total ingredient spend (waste cost / food revenue cost).
 * @param {number} totalWasteCost
 * @param {number} totalFoodCostSold  total ingredient cost embedded in sold dishes
 */
function wasteRatio(totalWasteCost, totalFoodCostSold) {
  const denom = totalWasteCost + totalFoodCostSold;
  return denom > 0 ? totalWasteCost / denom : 0;
}

// ---------------------------------------------------------------------------
// 4. SMART ADVISOR (rule-based recommendation engine)
// ---------------------------------------------------------------------------
// Transparent, explainable rules. Each recommendation carries a `type`,
// `severity`, the human-readable `message`, and the `evidence` that triggered
// it, so every suggestion can be justified in the viva.
// ---------------------------------------------------------------------------

const SO_M = (v) => Math.round(v).toLocaleString('en-US') + " so'm";
const PCT = (v) => (v * 100).toFixed(1) + '%';

function buildRecommendations({ classified, averages, waste, wasteRatioValue }) {
  const recs = [];

  for (const d of classified) {
    switch (d.category) {
      case 'Star':
        recs.push({
          type: 'menu',
          severity: 'positive',
          dish: d.name,
          message: `"${d.name}" is a STAR (popular & profitable, margin ${PCT(d.marginPct)}). Protect it: keep quality consistent, hold the price, and feature it prominently on the menu.`,
          evidence: `share ${PCT(d.menuMixShare)} ≥ threshold ${PCT(averages.popularityThreshold)}; gross profit ${SO_M(d.grossProfit)} ≥ avg ${SO_M(averages.avgGrossProfit)}`,
        });
        break;
      case 'Plowhorse':
        recs.push({
          type: 'menu',
          severity: 'warning',
          dish: d.name,
          message: `"${d.name}" is a PLOWHORSE (popular but low margin, ${PCT(d.marginPct)}). It draws customers but earns little. Reduce its portion/ingredient cost, gently raise the price, or bundle it with a high-margin side.`,
          evidence: `food cost ${PCT(d.foodCostPct)} of price; gross profit ${SO_M(d.grossProfit)} < avg ${SO_M(averages.avgGrossProfit)}`,
        });
        break;
      case 'Puzzle':
        recs.push({
          type: 'menu',
          severity: 'info',
          dish: d.name,
          message: `"${d.name}" is a PUZZLE (profitable but unpopular). It makes good money when it sells — promote it: reposition it on the menu, add a photo, train staff to recommend it, or run a limited promotion.`,
          evidence: `gross profit ${SO_M(d.grossProfit)} ≥ avg ${SO_M(averages.avgGrossProfit)}; share ${PCT(d.menuMixShare)} < threshold ${PCT(averages.popularityThreshold)}`,
        });
        break;
      case 'Dog':
        recs.push({
          type: 'menu',
          severity: 'critical',
          dish: d.name,
          message: `"${d.name}" is a DOG (unpopular & low margin). Consider removing it, reworking the recipe to cut cost, or replacing it. It consumes menu space and prep time for little return.`,
          evidence: `gross profit ${SO_M(d.grossProfit)} < avg ${SO_M(averages.avgGrossProfit)}; share ${PCT(d.menuMixShare)} < threshold ${PCT(averages.popularityThreshold)}`,
        });
        break;
    }
  }

  // Waste-driven recommendations.
  if (wasteRatioValue >= 0.05) {
    recs.push({
      type: 'waste',
      severity: wasteRatioValue >= 0.1 ? 'critical' : 'warning',
      message: `Food waste is ${PCT(wasteRatioValue)} of ingredient spend (industry healthy target is under 5%). This is money thrown away — every 1% cut goes almost straight to profit.`,
      evidence: `total waste cost ${SO_M(waste.totalWasteCost)}`,
    });
  }

  // Top waste ingredient(s).
  const top = waste.byIngredient.slice(0, 2);
  for (const ing of top) {
    if (ing.costShare >= 0.15) {
      recs.push({
        type: 'waste',
        severity: 'warning',
        ingredient: ing.name,
        message: `"${ing.name}" accounts for ${PCT(ing.costShare)} of your waste cost (${SO_M(ing.totalCost)}). Order it in smaller, more frequent batches, improve storage, or design a special that uses up near-expiry stock.`,
        evidence: `wasted quantity ${ing.totalQuantity}`,
      });
    }
  }

  if (recs.length === 0) {
    recs.push({
      type: 'info',
      severity: 'positive',
      message: 'No critical issues detected. Menu mix and waste levels look healthy — keep monitoring weekly.',
      evidence: '',
    });
  }

  return recs;
}

module.exports = {
  dishFoodCost,
  dishProfitability,
  classifyMenu,
  analyzeWaste,
  wasteRatio,
  buildRecommendations,
  // exported for tests / formatting reuse
  _fmt: { SO_M, PCT },
};
