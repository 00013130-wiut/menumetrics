// Unit tests for the templated AI-analysis fallback (lib/aiFallback.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateAnalysis } from '../lib/aiFallback.js';

const samplePayload = {
  currency: "so'm",
  targetWastePct: 5,
  revenue: 84331000,
  grossMarginPct: 72.7,
  totalGrossProfit: 61300000,
  wasteRatioPct: 8.3,
  totalWasteCost: 2300000,
  unitsSold: 2294,
  categories: { Star: 1, Plowhorse: 5, Puzzle: 2, Dog: 1 },
  topWaste: [{ name: 'Cream', cost: 480000, sharePct: 21 }],
  topDishesByRevenue: [
    { name: 'Osh (Plov)', category: 'Star', marginPct: 67, sharePct: 16.8, grossProfit: 31800, revenue: 17000000, unitsSold: 385 },
  ],
  worstDishes: [
    { name: 'Olivier Salad', category: 'Dog', marginPct: 80, grossProfit: 20000 },
    { name: 'Cappuccino', category: 'Plowhorse', marginPct: 77, grossProfit: 16800 },
  ],
  advisor: [{ severity: 'critical', message: 'Olivier Salad is an Underperformer' }],
};

test('templateAnalysis returns the expected shape', () => {
  const r = templateAnalysis(samplePayload);
  assert.equal(typeof r.headline, 'string');
  assert.ok(Array.isArray(r.goingWell) && r.goingWell.length > 0);
  assert.equal(typeof r.biggestProblem, 'string');
  assert.ok(Array.isArray(r.actions));
});

test('templateAnalysis always returns exactly 3 actions', () => {
  assert.equal(templateAnalysis(samplePayload).actions.length, 3);
  // Even with a near-empty payload it still pads to 3 generic actions.
  const sparse = templateAnalysis({ currency: "so'm", targetWastePct: 5, categories: {} });
  assert.equal(sparse.actions.length, 3);
});

test('templateAnalysis flags waste over target as the biggest problem', () => {
  const r = templateAnalysis(samplePayload); // 8.3% > 5% target
  assert.match(r.biggestProblem, /waste/i);
  assert.match(r.biggestProblem, /Cream/);
});
