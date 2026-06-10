// =============================================================================
// MenuMetrics - Application Layer (Node.js built-in HTTP server + REST API)
// -----------------------------------------------------------------------------
// Zero external dependencies. Run with:  node server.js
// Serves the static frontend from /public and a JSON REST API under /api.
// =============================================================================

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { openDb, initSchema, seed, Repo } = require('./db');
const L = require('./logic');

const PORT = process.env.PORT || 3000;

// --- Initialise database ----------------------------------------------------
const db = openDb();
initSchema(db);
const didSeed = seed(db);
console.log(didSeed ? 'Database seeded with Lazzat Cafe demo data.' : 'Database already populated.');

// --- Helpers ----------------------------------------------------------------
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, 'public', path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

// --- The analytics endpoint: the heart of the product -----------------------
function computeAnalytics() {
  const dishes = Repo.listDishes(db);
  const { dishes: classified, averages } = L.classifyMenu(dishes);
  const wasteLogs = Repo.listWaste(db);
  const waste = L.analyzeWaste(wasteLogs);
  const totalFoodCostSold = Repo.totalFoodCostSold(db);
  const wasteRatioValue = L.wasteRatio(waste.totalWasteCost, totalFoodCostSold);
  const recommendations = L.buildRecommendations({ classified, averages, waste, wasteRatioValue });

  // KPIs
  const totalRevenue = classified.reduce((s, d) => s + d.menuPrice * d.unitsSold, 0);
  const grossProfitSold = totalRevenue - totalFoodCostSold;
  const counts = { Star: 0, Plowhorse: 0, Puzzle: 0, Dog: 0 };
  classified.forEach((d) => counts[d.category]++);

  return {
    cafe: 'Lazzat Cafe (Tashkent)',
    kpis: {
      totalRevenue,
      totalFoodCostSold,
      grossProfitSold,
      grossMarginPct: totalRevenue > 0 ? grossProfitSold / totalRevenue : 0,
      totalWasteCost: waste.totalWasteCost,
      wasteRatioPct: wasteRatioValue,
      dishCount: classified.length,
    },
    matrixCounts: counts,
    averages,
    dishes: classified,
    waste,
    salesByDay: Repo.salesByDay(db),
    wasteByDay: Repo.wasteByDay(db),
    recommendations,
  };
}

// --- Router ------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (!url.startsWith('/api/')) return serveStatic(req, res);

    // GET endpoints
    if (req.method === 'GET') {
      if (url === '/api/analytics') return sendJson(res, 200, computeAnalytics());
      if (url === '/api/ingredients') return sendJson(res, 200, Repo.listIngredients(db));
      if (url === '/api/dishes') return sendJson(res, 200, Repo.listDishes(db));
      const m = url.match(/^\/api\/dishes\/(\d+)\/recipe$/);
      if (m) return sendJson(res, 200, Repo.getDishRecipe(db, Number(m[1])));
      if (url === '/api/waste') return sendJson(res, 200, Repo.listWaste(db));
      return sendJson(res, 404, { error: 'Not found' });
    }

    // POST endpoints
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (url === '/api/ingredients') return sendJson(res, 201, Repo.addIngredient(db, body));
      if (url === '/api/dishes') return sendJson(res, 201, Repo.addDish(db, body));
      if (url === '/api/sales') return sendJson(res, 201, Repo.addSale(db, body));
      if (url === '/api/waste') return sendJson(res, 201, Repo.addWaste(db, body));
      return sendJson(res, 404, { error: 'Not found' });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  MenuMetrics running at  http://localhost:${PORT}\n`);
});

module.exports = { computeAnalytics }; // for tests
