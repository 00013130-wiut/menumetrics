// =============================================================================
// MenuMetrics - Presentation Layer (vanilla JS SPA)
// Fetches analytics from the API, renders KPIs, tables, charts and advice.
// =============================================================================

const CAT_COLOR = { Star: '#22c55e', Plowhorse: '#f59e0b', Puzzle: '#3b82f6', Dog: '#ef4444' };
const fmtSom = (v) => Math.round(v).toLocaleString('en-US') + " so'm";
const fmtPct = (v) => (v * 100).toFixed(1) + '%';
const fmtShort = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : (v / 1e3).toFixed(0) + 'K');

let DATA = null;
const charts = {};          // live Chart.js instances
const builtCharts = {};     // which tab charts have been built (lazy)

async function api(path, opts) {
  const res = await fetch('/api' + path, opts);
  if (!res.ok) throw new Error('API ' + res.status);
  return res.json();
}

async function loadData() {
  DATA = await api('/analytics');
  document.getElementById('cafeName').textContent = DATA.cafe;
  renderKPIs();
  renderMenuTable();
  renderWasteTable();
  renderRecs();
  populateSelects();
  buildDashboardCharts();
  // rebuild any already-built lazy charts (after a data change)
  if (builtCharts.sales) buildSalesChart();
  if (builtCharts.waste) buildWasteCharts();
}

// ---- KPIs ----
function renderKPIs() {
  const k = DATA.kpis;
  const cards = [
    { label: '30-day revenue', value: fmtSom(k.totalRevenue) },
    { label: 'Gross profit', value: fmtSom(k.grossProfitSold), cls: 'good' },
    { label: 'Gross margin', value: fmtPct(k.grossMarginPct), cls: 'good' },
    { label: 'Food waste cost', value: fmtSom(k.totalWasteCost), cls: 'warn' },
    { label: 'Waste ratio', value: fmtPct(k.wasteRatioPct), cls: k.wasteRatioPct >= 0.1 ? 'bad' : 'warn' },
    { label: 'Dishes on menu', value: k.dishCount },
  ];
  document.getElementById('kpis').innerHTML = cards.map((c) =>
    `<div class="kpi ${c.cls || ''}"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`
  ).join('');
}

// ---- Menu table ----
function renderMenuTable() {
  const rows = [...DATA.dishes].sort((a, b) => b.unitsSold - a.unitsSold).map((d) => `
    <tr>
      <td>${d.name}</td>
      <td><span class="badge cat">${d.category}</span></td>
      <td class="num">${fmtSom(d.menuPrice)}</td>
      <td class="num">${fmtSom(d.foodCost)}</td>
      <td class="num">${fmtPct(d.foodCostPct)}</td>
      <td class="num">${fmtPct(d.marginPct)}</td>
      <td class="num">${d.unitsSold}</td>
      <td><span class="badge ${d.category}">${d.category}</span></td>
    </tr>`).join('');
  document.querySelector('#menuTable tbody').innerHTML = rows;
}

// ---- Waste table ----
function renderWasteTable() {
  // Render from the dedicated /api/waste list for full per-entry detail.
  api('/waste').then((logs) => {
    document.querySelector('#wasteTable tbody').innerHTML = logs.slice(0, 25).map((w) => `
      <tr>
        <td>${w.loggedOn}</td><td>${w.name}</td>
        <td class="num">${w.quantity} ${w.unit}</td><td>${w.reason || ''}</td>
        <td class="num">${fmtSom(w.quantity * w.costPerUnit)}</td>
      </tr>`).join('');
  });
}

// ---- Recommendations ----
function renderRecs() {
  const order = { critical: 0, warning: 1, info: 2, positive: 3 };
  const recs = [...DATA.recommendations].sort((a, b) => order[a.severity] - order[b.severity]);
  document.getElementById('recs').innerHTML = recs.map((r) => `
    <div class="rec ${r.severity}">
      <div class="sev">${r.severity}${r.type ? ' · ' + r.type : ''}</div>
      <div class="msg">${r.message}</div>
      ${r.evidence ? `<div class="ev">${r.evidence}</div>` : ''}
    </div>`).join('');
}

// ---- Charts ----
function buildDashboardCharts() {
  // Matrix scatter: x = popularity share, y = margin %, colored by category.
  const points = DATA.dishes.map((d) => ({
    x: d.menuMixShare * 100, y: d.marginPct * 100, label: d.name, category: d.category,
  }));
  const datasets = ['Star', 'Plowhorse', 'Puzzle', 'Dog'].map((cat) => ({
    label: cat,
    data: points.filter((p) => p.category === cat),
    backgroundColor: CAT_COLOR[cat], pointRadius: 7, pointHoverRadius: 9,
  }));
  charts.matrix && charts.matrix.destroy();
  charts.matrix = new Chart(document.getElementById('matrixChart'), {
    type: 'scatter',
    data: { datasets },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8' } },
        tooltip: { callbacks: { label: (c) => `${c.raw.label}: ${c.raw.y.toFixed(0)}% margin, ${c.raw.x.toFixed(1)}% share` } },
      },
      scales: {
        x: { title: { display: true, text: 'Popularity (menu-mix share %)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: '#2e3a4f' } },
        y: { title: { display: true, text: 'Profit margin %', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: '#2e3a4f' } },
      },
    },
  });

  // Revenue vs waste dual line.
  const days = DATA.salesByDay.map((s) => s.day.slice(5));
  const rev = DATA.salesByDay.map((s) => s.revenue);
  const wasteMap = Object.fromEntries(DATA.wasteByDay.map((w) => [w.day, w.cost]));
  const waste = DATA.salesByDay.map((s) => wasteMap[s.day] || 0);
  charts.trend && charts.trend.destroy();
  charts.trend = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: { labels: days, datasets: [
      { label: 'Revenue', data: rev, borderColor: '#4f9cf9', backgroundColor: 'rgba(79,156,249,.1)', fill: true, tension: .3, yAxisID: 'y' },
      { label: 'Waste cost', data: waste, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.1)', fill: true, tension: .3, yAxisID: 'y1' },
    ] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#94a3b8', maxTicksLimit: 10 }, grid: { display: false } },
        y: { position: 'left', ticks: { color: '#4f9cf9', callback: fmtShort }, grid: { color: '#2e3a4f' } },
        y1: { position: 'right', ticks: { color: '#ef4444', callback: fmtShort }, grid: { display: false } },
      },
    },
  });
}

function buildSalesChart() {
  const sorted = [...DATA.dishes].sort((a, b) => b.unitsSold - a.unitsSold);
  charts.sales && charts.sales.destroy();
  charts.sales = new Chart(document.getElementById('salesChart'), {
    type: 'bar',
    data: { labels: sorted.map((d) => d.name), datasets: [{ label: 'Units sold', data: sorted.map((d) => d.unitsSold), backgroundColor: sorted.map((d) => CAT_COLOR[d.category]) }] },
    options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: '#2e3a4f' } }, y: { ticks: { color: '#94a3b8' }, grid: { display: false } } } },
  });
  builtCharts.sales = true;
}

function buildWasteCharts() {
  const top = DATA.waste.byIngredient.slice(0, 8);
  charts.waste && charts.waste.destroy();
  charts.waste = new Chart(document.getElementById('wasteChart'), {
    type: 'bar',
    data: { labels: top.map((x) => x.name), datasets: [{ label: 'Waste cost', data: top.map((x) => x.totalCost), backgroundColor: '#f59e0b' }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#94a3b8' }, grid: { display: false } }, y: { ticks: { color: '#94a3b8', callback: fmtShort }, grid: { color: '#2e3a4f' } } } },
  });
  const days = DATA.wasteByDay.map((w) => w.day.slice(5));
  charts.wasteTrend && charts.wasteTrend.destroy();
  charts.wasteTrend = new Chart(document.getElementById('wasteTrendChart'), {
    type: 'line',
    data: { labels: days, datasets: [{ label: 'Daily waste', data: DATA.wasteByDay.map((w) => w.cost), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.12)', fill: true, tension: .3 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 10 }, grid: { display: false } }, y: { ticks: { color: '#94a3b8', callback: fmtShort }, grid: { color: '#2e3a4f' } } } },
  });
  builtCharts.waste = true;
}

// ---- Selects ----
function populateSelects() {
  api('/dishes').then((dishes) => {
    document.getElementById('saleDish').innerHTML = dishes.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
  });
  api('/ingredients').then((ings) => {
    document.getElementById('wasteIng').innerHTML = ings.map((i) => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('');
  });
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('saleDate').value = today;
  document.getElementById('wasteDate').value = today;
}

// ---- Forms ----
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'salesForm') {
    await api('/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dishId: +document.getElementById('saleDish').value, quantity: +document.getElementById('saleQty').value, soldOn: document.getElementById('saleDate').value }) });
    toast('Sale recorded'); await loadData();
  } else if (e.target.id === 'wasteForm') {
    await api('/waste', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredientId: +document.getElementById('wasteIng').value, quantity: +document.getElementById('wasteQty').value, reason: document.getElementById('wasteReason').value, loggedOn: document.getElementById('wasteDate').value }) });
    toast('Waste logged'); await loadData();
  }
});

// ---- Tabs ----
document.getElementById('tabs').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  const view = e.target.dataset.view;
  document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('active', b === e.target));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  // Lazy-build charts the first time a tab is opened (canvas must be visible).
  if (view === 'sales' && !builtCharts.sales) buildSalesChart();
  if (view === 'waste' && !builtCharts.waste) buildWasteCharts();
});

window.addEventListener('DOMContentLoaded', () => {
  if (typeof Chart === 'undefined') {
    // Chart.js loads with defer; wait for it.
    window.addEventListener('load', loadData);
  } else {
    loadData();
  }
});
