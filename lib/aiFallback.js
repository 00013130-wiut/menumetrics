// Templated, fluent fallback for the AI analyzer — used when LLM_API_KEY is not
// set or the LLM call fails. Produces the SAME shape the LLM is asked for, so
// the dashboard renders identically either way. Pure: no maths, just wording.
import { formatMoney, formatPct } from './format.js';

export function templateAnalysis(p) {
  const cur = p.currency || "so'm";
  const money = (v) => formatMoney(v, cur);
  const pct = (v) => formatPct((Number(v) || 0) / 100); // v is already a percent
  const cats = p.categories || {};
  const overWaste = p.wasteRatioPct > (p.targetWastePct || 5);

  // Headline
  let mood;
  if (p.grossMarginPct >= 60) mood = 'A strong month';
  else if (p.grossMarginPct >= 40) mood = 'A steady month';
  else mood = 'A tough month';
  const headline = `${mood}: ${money(p.revenue)} in sales at a ${pct(
    p.grossMarginPct
  )} profit margin${
    overWaste ? `, though ${pct(p.wasteRatioPct)} of food spend went to waste` : ''
  }.`;

  // Going well
  const goingWell = [];
  const topRev = (p.topDishesByRevenue || [])[0];
  if (topRev)
    goingWell.push(
      `${topRev.name} is your top earner — ${money(topRev.revenue)} from ${topRev.unitsSold} sold.`
    );
  if ((cats.Star || 0) > 0)
    goingWell.push(
      `${cats.Star} dish${cats.Star === 1 ? '' : 'es'} ${
        cats.Star === 1 ? 'is a' : 'are'
      } Star — popular and profitable. Keep them front and centre.`
    );
  if (p.grossMarginPct >= 55)
    goingWell.push(
      `Your overall margin of ${pct(p.grossMarginPct)} is healthy for a café.`
    );
  if (!overWaste && p.wasteRatioPct >= 0)
    goingWell.push(
      `Waste is under control at ${pct(p.wasteRatioPct)}, below your ${p.targetWastePct}% target.`
    );
  if (goingWell.length === 0)
    goingWell.push('You have data flowing in — keep recording sales and waste.');

  // Biggest problem
  let biggestProblem;
  const topWaste = (p.topWaste || [])[0];
  if (overWaste && topWaste) {
    biggestProblem = `Food waste is your biggest leak: ${pct(
      p.wasteRatioPct
    )} of ingredient spend (${money(p.totalWasteCost)}), and ${topWaste.name} alone is ${pct(
      topWaste.sharePct
    )} of it. That money goes straight off your bottom line.`;
  } else if ((cats.Plowhorse || 0) >= 2) {
    biggestProblem = `You have ${cats.Plowhorse} Plowhorses — dishes people love but that earn little per plate. They keep the tables full but quietly thin your profit.`;
  } else if ((cats.Dog || 0) >= 1) {
    const dog = (p.worstDishes || [])[0];
    biggestProblem = `${
      dog ? dog.name : 'A few dishes'
    } sell slowly and earn little — they take up menu space and prep time for little return.`;
  } else {
    biggestProblem =
      'No single glaring problem — the focus now is fine-tuning prices and portions to lift margin further.';
  }

  // Three concrete actions for this week
  const actions = [];
  if (overWaste && topWaste)
    actions.push(
      `Order ${topWaste.name} in smaller, more frequent batches and run a special that uses up near-expiry stock.`
    );
  const plow = (p.worstDishes || []).find((d) => d.category === 'Plowhorse');
  if (plow)
    actions.push(
      `Re-cost ${plow.name}: trim its portion or lift its price ~5–10% to widen the ${formatPct(
        (plow.marginPct || 0) / 100
      )} margin.`
    );
  const puzzle = (p.topDishesByRevenue || []).find((d) => d.category === 'Puzzle');
  if (puzzle)
    actions.push(
      `Promote ${puzzle.name} — it earns ${money(
        puzzle.grossProfit
      )} a plate but few order it. Feature it or have staff recommend it.`
    );
  const dog2 = (p.worstDishes || []).find((d) => d.category === 'Dog');
  if (dog2 && actions.length < 3)
    actions.push(`Review ${dog2.name} for removal or a recipe rework to cut its cost.`);
  if (topRev && actions.length < 3)
    actions.push(`Protect ${topRev.name} — keep its quality and availability consistent.`);
  while (actions.length < 3)
    actions.push('Keep recording daily sales so the analysis sharpens over time.');

  return { headline, goingWell, biggestProblem, actions: actions.slice(0, 3) };
}
