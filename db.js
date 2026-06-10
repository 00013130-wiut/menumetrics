// =============================================================================
// MenuMetrics - Data Access Layer (SQLite via Node's built-in node:sqlite)
// -----------------------------------------------------------------------------
// Schema (3rd normal form):
//   ingredients(id, name, unit, cost_per_unit)
//   dishes(id, name, category, menu_price)
//   recipe_items(id, dish_id -> dishes, ingredient_id -> ingredients, quantity)
//   sales(id, dish_id -> dishes, quantity, sold_on)
//   waste_logs(id, ingredient_id -> ingredients, quantity, reason, logged_on)
//
// Case study: "Lazzat Cafe", a fictional small cafe in Tashkent serving a mix
// of Uzbek classics and European dishes. All money values are in Uzbek so'm.
// =============================================================================

'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

function openDb(dbPath = process.env.MENUMETRICS_DB || path.join(__dirname, 'data', 'menumetrics.db')) {
  const fs = require('fs');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      unit          TEXT NOT NULL,
      cost_per_unit REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dishes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      category   TEXT NOT NULL,
      menu_price REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recipe_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      dish_id       INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      quantity      REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sales (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      dish_id  INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      sold_on  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS waste_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      quantity      REAL NOT NULL,
      reason        TEXT,
      logged_on     TEXT NOT NULL
    );
  `);
}

// ---------------------------------------------------------------------------
// Seed data (deterministic, so the demo is reproducible for the viva).
// ---------------------------------------------------------------------------

const INGREDIENTS = [
  ['Rice', 'kg', 12000], ['Lamb', 'kg', 95000], ['Beef', 'kg', 78000],
  ['Chicken', 'kg', 45000], ['Carrot', 'kg', 6000], ['Onion', 'kg', 5000],
  ['Tomato', 'kg', 9000], ['Cucumber', 'kg', 8000], ['Potato', 'kg', 5000],
  ['Flour', 'kg', 7000], ['Egg', 'piece', 1500], ['Vegetable Oil', 'litre', 22000],
  ['Cheese', 'kg', 72000], ['Non (bread)', 'piece', 3000], ['Milk', 'litre', 12000],
  ['Coffee Beans', 'kg', 130000], ['Sugar', 'kg', 11000], ['Lettuce', 'kg', 16000],
  ['Mushroom', 'kg', 38000], ['Cream', 'litre', 30000], ['Mozzarella', 'kg', 80000],
  ['Tomato Sauce', 'litre', 18000],
];

// name, category, menu_price, recipe: [[ingredientName, quantity], ...]
const DISHES = [
  ['Osh (Plov)', 'Uzbek main', 35000, [['Rice', 0.2], ['Lamb', 0.15], ['Carrot', 0.1], ['Onion', 0.05], ['Vegetable Oil', 0.05]]],
  ['Lagman', 'Uzbek main', 28000, [['Flour', 0.15], ['Beef', 0.1], ['Carrot', 0.05], ['Onion', 0.05], ['Tomato', 0.05]]],
  ['Manti', 'Uzbek main', 30000, [['Flour', 0.15], ['Beef', 0.12], ['Onion', 0.06]]],
  ['Beef Shashlik', 'Grill', 42000, [['Beef', 0.25], ['Onion', 0.05]]],
  ['Chicken Caesar Salad', 'European', 38000, [['Chicken', 0.12], ['Lettuce', 0.1], ['Cheese', 0.03], ['Egg', 1], ['Non (bread)', 0.5]]],
  ['Margherita Pizza', 'European', 45000, [['Flour', 0.2], ['Mozzarella', 0.12], ['Tomato Sauce', 0.08]]],
  ['Beef Steak', 'European', 78000, [['Beef', 0.3], ['Potato', 0.15], ['Vegetable Oil', 0.03]]],
  ['Greek Salad', 'European', 32000, [['Tomato', 0.1], ['Cucumber', 0.1], ['Cheese', 0.05], ['Lettuce', 0.05]]],
  ['Mushroom Cream Soup', 'European', 26000, [['Mushroom', 0.12], ['Cream', 0.08], ['Onion', 0.03]]],
  ['Cappuccino', 'Drinks', 22000, [['Coffee Beans', 0.012], ['Milk', 0.15], ['Sugar', 0.01]]],
];

// Relative daily popularity weights (higher = sells more). Tuned so the menu
// engineering matrix shows a realistic spread of Stars/Plowhorses/Puzzles/Dogs.
const POPULARITY = {
  'Osh (Plov)': 18, 'Lagman': 16, 'Manti': 10, 'Beef Shashlik': 8,
  'Chicken Caesar Salad': 6, 'Margherita Pizza': 9, 'Beef Steak': 3,
  'Greek Salad': 4, 'Mushroom Cream Soup': 5, 'Cappuccino': 22,
};

// Deterministic pseudo-random generator (mulberry32) for reproducible seed.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seed(db, days = 30) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM ingredients').get().c;
  if (count > 0) return false; // already seeded

  const insIng = db.prepare('INSERT INTO ingredients(name, unit, cost_per_unit) VALUES (?,?,?)');
  const ingId = {};
  for (const [name, unit, cost] of INGREDIENTS) {
    const info = insIng.run(name, unit, cost);
    ingId[name] = info.lastInsertRowid;
  }

  const insDish = db.prepare('INSERT INTO dishes(name, category, menu_price) VALUES (?,?,?)');
  const insRecipe = db.prepare('INSERT INTO recipe_items(dish_id, ingredient_id, quantity) VALUES (?,?,?)');
  const dishId = {};
  for (const [name, category, price, recipe] of DISHES) {
    const info = insDish.run(name, category, price);
    dishId[name] = info.lastInsertRowid;
    for (const [ingName, qty] of recipe) {
      insRecipe.run(info.lastInsertRowid, ingId[ingName], qty);
    }
  }

  // Sales across `days` days.
  const rng = makeRng(42);
  const insSale = db.prepare('INSERT INTO sales(dish_id, quantity, sold_on) VALUES (?,?,?)');
  const today = new Date('2026-06-01T00:00:00Z');
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
    const weekendBoost = [0, 6].includes(new Date(date).getUTCDay()) ? 1.3 : 1.0;
    for (const [name, weight] of Object.entries(POPULARITY)) {
      const base = weight * weekendBoost;
      const qty = Math.max(0, Math.round(base * (0.7 + rng() * 0.6)));
      if (qty > 0) insSale.run(dishId[name], qty, date);
    }
  }

  // Waste logs — Tomato, Lettuce, Cream and Non are the worst (perishables).
  const wasteProfile = [
    ['Tomato', 2.0, 'spoiled'], ['Lettuce', 1.5, 'wilted'], ['Cream', 1.2, 'expired'],
    ['Non (bread)', 10, 'stale'], ['Mushroom', 0.8, 'spoiled'], ['Milk', 1.0, 'expired'],
    ['Cucumber', 1.0, 'spoiled'], ['Chicken', 0.5, 'over-prep'],
  ];
  const insWaste = db.prepare('INSERT INTO waste_logs(ingredient_id, quantity, reason, logged_on) VALUES (?,?,?,?)');
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
    for (const [name, qtyBase, reason] of wasteProfile) {
      if (rng() < 0.6) { // not every item every day
        const qty = +(qtyBase * (0.5 + rng())).toFixed(2);
        insWaste.run(ingId[name], qty, reason, date);
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Repository / query helpers used by the API layer.
// ---------------------------------------------------------------------------

const Repo = {
  listIngredients(db) {
    return db.prepare('SELECT id, name, unit, cost_per_unit AS costPerUnit FROM ingredients ORDER BY name').all();
  },
  addIngredient(db, { name, unit, costPerUnit }) {
    const info = db.prepare('INSERT INTO ingredients(name, unit, cost_per_unit) VALUES (?,?,?)').run(name, unit, costPerUnit);
    return { id: info.lastInsertRowid, name, unit, costPerUnit };
  },

  // Dishes with computed food cost + units sold (joins recipe, ingredients, sales).
  listDishes(db) {
    const dishes = db.prepare('SELECT id, name, category, menu_price AS menuPrice FROM dishes ORDER BY name').all();
    const costStmt = db.prepare(`
      SELECT COALESCE(SUM(ri.quantity * i.cost_per_unit), 0) AS foodCost
      FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.dish_id = ?`);
    const soldStmt = db.prepare('SELECT COALESCE(SUM(quantity),0) AS unitsSold FROM sales WHERE dish_id = ?');
    return dishes.map((d) => ({
      ...d,
      foodCost: costStmt.get(d.id).foodCost,
      unitsSold: soldStmt.get(d.id).unitsSold,
    }));
  },

  getDishRecipe(db, dishId) {
    return db.prepare(`
      SELECT ri.id, i.name, i.unit, ri.quantity, i.cost_per_unit AS costPerUnit,
             (ri.quantity * i.cost_per_unit) AS lineCost
      FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.dish_id = ? ORDER BY i.name`).all(dishId);
  },

  addDish(db, { name, category, menuPrice, recipe = [] }) {
    const info = db.prepare('INSERT INTO dishes(name, category, menu_price) VALUES (?,?,?)').run(name, category, menuPrice);
    const insR = db.prepare('INSERT INTO recipe_items(dish_id, ingredient_id, quantity) VALUES (?,?,?)');
    for (const r of recipe) insR.run(info.lastInsertRowid, r.ingredientId, r.quantity);
    return { id: info.lastInsertRowid, name, category, menuPrice };
  },

  addSale(db, { dishId, quantity, soldOn }) {
    const date = soldOn || new Date().toISOString().slice(0, 10);
    const info = db.prepare('INSERT INTO sales(dish_id, quantity, sold_on) VALUES (?,?,?)').run(dishId, quantity, date);
    return { id: info.lastInsertRowid, dishId, quantity, soldOn: date };
  },

  salesByDay(db) {
    return db.prepare(`
      SELECT s.sold_on AS day, COALESCE(SUM(s.quantity * d.menu_price),0) AS revenue, SUM(s.quantity) AS units
      FROM sales s JOIN dishes d ON d.id = s.dish_id
      GROUP BY s.sold_on ORDER BY s.sold_on`).all();
  },

  listWaste(db) {
    return db.prepare(`
      SELECT w.id, w.ingredient_id AS ingredientId, i.name, i.unit, w.quantity,
             i.cost_per_unit AS costPerUnit, w.reason, w.logged_on AS loggedOn
      FROM waste_logs w JOIN ingredients i ON i.id = w.ingredient_id
      ORDER BY w.logged_on DESC, w.id DESC`).all();
  },

  addWaste(db, { ingredientId, quantity, reason, loggedOn }) {
    const date = loggedOn || new Date().toISOString().slice(0, 10);
    const info = db.prepare('INSERT INTO waste_logs(ingredient_id, quantity, reason, logged_on) VALUES (?,?,?,?)').run(ingredientId, quantity, reason || '', date);
    return { id: info.lastInsertRowid, ingredientId, quantity, reason, loggedOn: date };
  },

  wasteByDay(db) {
    return db.prepare(`
      SELECT w.logged_on AS day, COALESCE(SUM(w.quantity * i.cost_per_unit),0) AS cost
      FROM waste_logs w JOIN ingredients i ON i.id = w.ingredient_id
      GROUP BY w.logged_on ORDER BY w.logged_on`).all();
  },

  // Total ingredient cost embedded in everything that was actually sold.
  totalFoodCostSold(db) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(s.quantity * dc.food_cost), 0) AS total FROM sales s
      JOIN (
        SELECT ri.dish_id AS did, SUM(ri.quantity * i.cost_per_unit) AS food_cost
        FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredient_id
        GROUP BY ri.dish_id
      ) dc ON dc.did = s.dish_id`).get();
    return row.total;
  },
};


module.exports = { openDb, initSchema, seed, Repo, INGREDIENTS, DISHES };
