// Minimal test runner for logic.js (no external deps). Run: node test_logic.js
'use strict';
const assert = require('assert');
const L = require('./logic');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('logic.js tests');

test('dishFoodCost sums quantity*cost', () => {
  const cost = L.dishFoodCost([
    { quantity: 2, costPerUnit: 1000 },
    { quantity: 0.5, costPerUnit: 4000 },
  ]);
  assert.strictEqual(cost, 4000); // 2000 + 2000
});

test('dishProfitability computes margins', () => {
  const p = L.dishProfitability(10000, 3000);
  assert.strictEqual(p.grossProfit, 7000);
  assert.ok(Math.abs(p.foodCostPct - 0.3) < 1e-9);
  assert.ok(Math.abs(p.marginPct - 0.7) < 1e-9);
});

test('classifyMenu assigns four quadrants correctly', () => {
  // 4 dishes; equal-share baseline = 0.25; 70% threshold = 0.175
  const dishes = [
    { id: 1, name: 'Star',      menuPrice: 30000, foodCost: 9000,  unitsSold: 100 }, // high profit 21000, high pop
    { id: 2, name: 'Plowhorse', menuPrice: 12000, foodCost: 9000,  unitsSold: 120 }, // low profit 3000, high pop
    { id: 3, name: 'Puzzle',    menuPrice: 40000, foodCost: 12000, unitsSold: 10  }, // high profit 28000, low pop
    { id: 4, name: 'Dog',       menuPrice: 10000, foodCost: 8000,  unitsSold: 8   }, // low profit 2000, low pop
  ];
  const { dishes: c } = L.classifyMenu(dishes);
  const byName = Object.fromEntries(c.map((d) => [d.name, d.category]));
  assert.strictEqual(byName['Star'], 'Star');
  assert.strictEqual(byName['Plowhorse'], 'Plowhorse');
  assert.strictEqual(byName['Puzzle'], 'Puzzle');
  assert.strictEqual(byName['Dog'], 'Dog');
});

test('analyzeWaste aggregates and ranks by cost', () => {
  const { byIngredient, totalWasteCost } = L.analyzeWaste([
    { ingredientId: 1, name: 'Tomato', quantity: 5, costPerUnit: 6000, reason: 'spoiled' },
    { ingredientId: 1, name: 'Tomato', quantity: 3, costPerUnit: 6000, reason: 'spoiled' },
    { ingredientId: 2, name: 'Bread',  quantity: 10, costPerUnit: 2000, reason: 'stale' },
  ]);
  assert.strictEqual(totalWasteCost, 8 * 6000 + 10 * 2000); // 48000 + 20000 = 68000
  assert.strictEqual(byIngredient[0].name, 'Tomato'); // highest cost first
  assert.ok(Math.abs(byIngredient[0].costShare - 48000 / 68000) < 1e-9);
});

test('wasteRatio is waste / (waste + sold food cost)', () => {
  const r = L.wasteRatio(10000, 90000);
  assert.ok(Math.abs(r - 0.1) < 1e-9);
});

test('buildRecommendations produces messages for each category + waste', () => {
  const dishes = [
    { id: 1, name: 'Plov',    menuPrice: 30000, foodCost: 9000,  unitsSold: 100 },
    { id: 2, name: 'Lagman',  menuPrice: 12000, foodCost: 9000,  unitsSold: 120 },
    { id: 3, name: 'Steak',   menuPrice: 40000, foodCost: 12000, unitsSold: 10  },
    { id: 4, name: 'Salad',   menuPrice: 10000, foodCost: 8000,  unitsSold: 8   },
  ];
  const { dishes: classified, averages } = L.classifyMenu(dishes);
  const waste = L.analyzeWaste([
    { ingredientId: 1, name: 'Tomato', quantity: 20, costPerUnit: 6000, reason: 'spoiled' },
  ]);
  const wr = L.wasteRatio(waste.totalWasteCost, 200000);
  const recs = L.buildRecommendations({ classified, averages, waste, wasteRatioValue: wr });
  assert.ok(recs.length >= 4, 'should have at least 4 recommendations');
  assert.ok(recs.some((r) => r.type === 'menu'));
});

console.log(`\n${passed} checks passed.`);
