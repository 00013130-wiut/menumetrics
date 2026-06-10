// Plain-English presentation helpers for non-technical restaurant owners.
// These ONLY translate already-computed numbers into words — no maths here.
import { formatMoney, formatPct } from './format.js';

// Friendly DISPLAY labels for the four menu-engineering categories.
// IMPORTANT: these are presentation only. The internal category keys stay
// Star / Plowhorse / Puzzle / Dog everywhere in the logic (lib/analytics.js) and
// drive the colours; we only swap the text the owner sees. The academic origins
// (Kasavana–Smith) are still shown via a note on the dashboard.
//   Star      → "Star"
//   Plowhorse → "Crowd-Pleaser"
//   Puzzle    → "Hidden Gem"
//   Dog       → "Underperformer"
export const CATEGORY_LABEL = {
  Star: 'Star',
  Plowhorse: 'Crowd-Pleaser',
  Puzzle: 'Hidden Gem',
  Dog: 'Underperformer',
};

// Friendly one-liner for each category (keyed by the internal key).
export const CATEGORY_MEANING = {
  Star: 'Keep doing it',
  Plowhorse: 'Popular but earns you little',
  Puzzle: 'Profitable — promote it',
  Dog: 'Consider dropping',
};

export const CATEGORY_HELP = {
  Star: 'Sells well AND makes good money. Protect it: keep the recipe and quality consistent and feature it on the menu.',
  Plowhorse:
    'People order it a lot but each one earns little. Try trimming the ingredient cost or nudging the price up.',
  Puzzle:
    'Makes good money but few people order it. Promote it — better menu placement, a photo, or staff recommendations.',
  Dog: 'Few orders and low profit. Consider removing it, reworking the recipe, or replacing it.',
};

// What each KPI means, in one plain sentence.
export function kpiMeaning(key, model, currency, targetWastePct) {
  switch (key) {
    case 'revenue':
      return 'Total money taken from sales in this period.';
    case 'margin': {
      const keep = Math.round((model.grossMargin || 0) * 100);
      return `After ingredient costs, you keep about ${keep} so'm of every 100.`;
    }
    case 'waste':
      return `Share of your ingredient spend that was thrown away. Lower is better — aim under ${targetWastePct}%.`;
    case 'menu':
      return 'How many dishes are winners versus ones that need attention.';
    default:
      return '';
  }
}

// A short, human tooltip for a single classified dish.
export function dishBlurb(d, currency) {
  const profit = formatMoney(d.grossProfit, currency);
  switch (d.category) {
    case 'Star':
      return `${d.name} sells well and earns a healthy ${profit} per serving — a winner.`;
    case 'Plowhorse':
      return `${d.name} sells a lot but earns only about ${profit} per serving.`;
    case 'Puzzle':
      return `${d.name} earns a good ${profit} per serving but few people order it.`;
    case 'Dog':
      return `${d.name} earns only ${profit} per serving and sells slowly.`;
    default:
      return d.name;
  }
}

// The headline plain-English summary sentence built from the data.
// e.g. "Strong month — 73% margin, but 8% of your food spend is wasted, mostly on Tomato."
export function summarySentence(model, currency, targetWastePct) {
  const margin = model.grossMargin || 0;
  const wr = model.wasteRatio || 0;
  const counts = model.categoryCounts || {};

  let lead;
  if (margin >= 0.6) lead = 'Strong period';
  else if (margin >= 0.4) lead = 'Healthy period';
  else if (margin > 0) lead = 'Tight margins';
  else lead = 'Just getting started';

  const parts = [];
  if (model.totalRevenue > 0) {
    parts.push(
      `${formatMoney(model.totalRevenue, currency)} in sales at a ${formatPct(
        margin
      )} margin`
    );
  }

  if (wr > 0) {
    const top = model.wasteAnalysis?.byIngredient?.[0];
    const overTarget = wr > (targetWastePct || 5) / 100;
    let waste = `${formatPct(wr)} of your food spend was wasted`;
    if (top) waste += `, mostly on ${top.name}`;
    parts.push((overTarget ? 'but ' : 'and ') + waste);
  }

  const stars = counts.Star || 0;
  const dogs = counts.Dog || 0;
  if (stars || dogs) {
    const bits = [];
    if (stars) bits.push(`${stars} star dish${stars === 1 ? '' : 'es'}`);
    if (dogs) bits.push(`${dogs} to review`);
    parts.push(bits.join(' and '));
  }

  if (parts.length === 0) return 'Add some sales to see your performance summary.';
  return `${lead} — ${parts.join('; ')}.`;
}
