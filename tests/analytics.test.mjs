// Unit tests for the pure analytics logic. Run with:  node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dishFoodCost,
  dishProfitability,
  classifyMenu,
  analyzeWaste,
  wasteRatio,
  buildRecommendations,
} from '../lib/analytics.js';

test('dishFoodCost sums quantity * cost_per_unit', () => {
  const cost = dishFoodCost([
    { quantity: 0.2, cost_per_unit: 18000 }, // 3600
    { quantity: 0.12, cost_per_unit: 75000 }, // 9000
    { quantity: 0.1, cost_per_unit: 6000 }, // 600
  ]);
  assert.equal(cost, 13200);
});

test('dishProfitability computes gross profit and margins', () => {
  const p = dishProfitability(45000, 13200);
  assert.equal(p.grossProfit, 31800);
  assert.ok(Math.abs(p.marginPct - 31800 / 45000) < 1e-9);
  assert.ok(Math.abs(p.foodCostPct - 13200 / 45000) < 1e-9);
});

test('dishProfitability handles zero price safely', () => {
  const p = dishProfitability(0, 100);
  assert.equal(p.marginPct, 0);
  assert.equal(p.foodCostPct, 0);
});

test('classifyMenu assigns the four Kasavana-Smith categories', () => {
  // 4 dishes; avg gross profit and popularity threshold derived internally.
  const dishes = [
    { id: 'a', name: 'Star', menu_price: 50000, foodCost: 15000, unitsSold: 100 },
    { id: 'b', name: 'Plowhorse', menu_price: 20000, foodCost: 14000, unitsSold: 100 },
    { id: 'c', name: 'Puzzle', menu_price: 60000, foodCost: 12000, unitsSold: 5 },
    { id: 'd', name: 'Dog', menu_price: 18000, foodCost: 14000, unitsSold: 5 },
  ];
  const { dishes: cl, averages } = classifyMenu(dishes, 0.7);
  const byName = Object.fromEntries(cl.map((d) => [d.name, d.category]));
  assert.equal(byName.Star, 'Star');
  assert.equal(byName.Plowhorse, 'Plowhorse');
  assert.equal(byName.Puzzle, 'Puzzle');
  assert.equal(byName.Dog, 'Dog');
  // threshold = (1/4) * 0.7 = 0.175
  assert.ok(Math.abs(averages.popularityThreshold - 0.175) < 1e-9);
  assert.equal(averages.totalUnits, 210);
});

test('classifyMenu handles an empty menu', () => {
  const { dishes, averages } = classifyMenu([], 0.7);
  assert.deepEqual(dishes, []);
  assert.equal(averages.totalUnits, 0);
});

test('analyzeWaste aggregates by ingredient and ranks by cost', () => {
  const { byIngredient, totalWasteCost } = analyzeWaste([
    { ingredient_id: 'i1', name: 'Tomato', quantity: 2, cost_per_unit: 12000 }, // 24000
    { ingredient_id: 'i1', name: 'Tomato', quantity: 1, cost_per_unit: 12000 }, // 12000
    { ingredient_id: 'i2', name: 'Lamb', quantity: 1, cost_per_unit: 85000 }, // 85000
  ]);
  assert.equal(totalWasteCost, 121000);
  assert.equal(byIngredient[0].name, 'Lamb'); // ranked first by cost
  const tomato = byIngredient.find((x) => x.name === 'Tomato');
  assert.equal(tomato.totalCost, 36000);
  assert.equal(tomato.entries, 2);
});

test('wasteRatio = waste / (waste + food cost sold)', () => {
  assert.equal(wasteRatio(50, 950), 0.05);
  assert.equal(wasteRatio(0, 0), 0);
});

test('buildRecommendations flags a Dog and a high waste ratio', () => {
  const dishes = [
    { id: 'a', name: 'Star', menu_price: 50000, foodCost: 15000, unitsSold: 100 },
    { id: 'd', name: 'Dog', menu_price: 18000, foodCost: 14000, unitsSold: 5 },
  ];
  const { dishes: cl, averages } = classifyMenu(dishes, 0.7);
  const waste = analyzeWaste([
    { ingredient_id: 'i1', name: 'Tomato', quantity: 5, cost_per_unit: 12000 },
  ]);
  const recs = buildRecommendations({
    classified: cl,
    averages,
    waste,
    wasteRatioValue: 0.12, // above a 5% target
    targetWastePct: 5,
  });
  assert.ok(recs.some((r) => r.severity === 'critical')); // Dog
  assert.ok(recs.some((r) => r.type === 'waste')); // waste ratio flag
});
