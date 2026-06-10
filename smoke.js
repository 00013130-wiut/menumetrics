const { openDb, initSchema, seed, Repo } = require('./db');
const L = require('./logic');
const fs = require('fs');
try { fs.unlinkSync(__dirname + '/data/menumetrics.db'); } catch {}
const db = openDb();
initSchema(db);
console.log('seeded:', seed(db));
const dishes = Repo.listDishes(db);
const { dishes: cls, averages } = L.classifyMenu(dishes);
console.log('\nMenu engineering:');
for (const d of cls) {
  console.log('  ' + d.category.padEnd(10) + ' ' + d.name.padEnd(22) +
    ' margin ' + (d.marginPct * 100).toFixed(0) + '%  sold ' + d.unitsSold);
}
const waste = L.analyzeWaste(Repo.listWaste(db));
const tfc = Repo.totalFoodCostSold(db);
const wr = L.wasteRatio(waste.totalWasteCost, tfc);
console.log('\nWaste total:', Math.round(waste.totalWasteCost), 'soum; ratio', (wr * 100).toFixed(1) + '%');
console.log('Top waste:', waste.byIngredient.slice(0, 3).map(x => x.name + ' ' + (x.costShare * 100).toFixed(0) + '%').join(', '));
const recs = L.buildRecommendations({ classified: cls, averages, waste, wasteRatioValue: wr });
console.log('\nRecommendations:', recs.length);
recs.slice(0, 5).forEach(r => console.log('  [' + r.severity + '] ' + r.message.slice(0, 95)));
