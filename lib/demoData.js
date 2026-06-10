'use client';

import { supabase } from '@/lib/supabaseClient';
import { logActivity } from '@/lib/activity';

// ---------------------------------------------------------------------------
// Sample Tashkent café dataset. Prices/costs in Uzbek so'm.
// ---------------------------------------------------------------------------

const INGREDIENTS = [
  { name: 'Rice (devzira)', unit: 'kg', cost_per_unit: 18000 },
  { name: 'Beef', unit: 'kg', cost_per_unit: 75000 },
  { name: 'Lamb', unit: 'kg', cost_per_unit: 85000 },
  { name: 'Chicken', unit: 'kg', cost_per_unit: 38000 },
  { name: 'Carrot', unit: 'kg', cost_per_unit: 6000 },
  { name: 'Onion', unit: 'kg', cost_per_unit: 4000 },
  { name: 'Potato', unit: 'kg', cost_per_unit: 5000 },
  { name: 'Tomato', unit: 'kg', cost_per_unit: 12000 },
  { name: 'Cucumber', unit: 'kg', cost_per_unit: 10000 },
  { name: 'Bell pepper', unit: 'kg', cost_per_unit: 18000 },
  { name: 'Garlic', unit: 'kg', cost_per_unit: 30000 },
  { name: 'Flour', unit: 'kg', cost_per_unit: 9000 },
  { name: 'Egg', unit: 'pcs', cost_per_unit: 1500 },
  { name: 'Mozzarella cheese', unit: 'kg', cost_per_unit: 65000 },
  { name: 'Milk', unit: 'l', cost_per_unit: 12000 },
  { name: 'Vegetable oil', unit: 'l', cost_per_unit: 22000 },
  { name: 'Coffee beans', unit: 'kg', cost_per_unit: 180000 },
  { name: 'Sugar', unit: 'kg', cost_per_unit: 11000 },
  { name: 'Salt', unit: 'kg', cost_per_unit: 3000 },
  { name: 'Cumin (zira)', unit: 'kg', cost_per_unit: 90000 },
  { name: 'Fresh herbs', unit: 'kg', cost_per_unit: 15000 },
  { name: 'Tomato paste', unit: 'kg', cost_per_unit: 28000 },
  { name: 'Green tea leaves', unit: 'kg', cost_per_unit: 60000 },
  { name: 'Lemon', unit: 'kg', cost_per_unit: 16000 },
];

// Each dish: name, category, price, recipe [ingredientName, qty], and a
// popularity weight used to generate realistic sales volumes.
const DISHES = [
  {
    name: 'Osh (Plov)',
    category: 'Main',
    menu_price: 45000,
    weight: 10,
    recipe: [
      ['Rice (devzira)', 0.2],
      ['Beef', 0.12],
      ['Carrot', 0.1],
      ['Onion', 0.05],
      ['Vegetable oil', 0.05],
      ['Cumin (zira)', 0.005],
      ['Salt', 0.005],
    ],
  },
  {
    name: 'Lagman',
    category: 'Main',
    menu_price: 40000,
    weight: 8,
    recipe: [
      ['Flour', 0.15],
      ['Beef', 0.1],
      ['Onion', 0.05],
      ['Bell pepper', 0.05],
      ['Carrot', 0.05],
      ['Tomato paste', 0.03],
      ['Vegetable oil', 0.03],
      ['Garlic', 0.01],
    ],
  },
  {
    name: 'Manti',
    category: 'Main',
    menu_price: 38000,
    weight: 6,
    recipe: [
      ['Flour', 0.12],
      ['Lamb', 0.1],
      ['Onion', 0.06],
      ['Vegetable oil', 0.01],
      ['Salt', 0.003],
    ],
  },
  {
    name: 'Shashlik (lamb)',
    category: 'Grill',
    menu_price: 50000,
    weight: 7,
    recipe: [
      ['Lamb', 0.2],
      ['Onion', 0.05],
      ['Vegetable oil', 0.01],
      ['Cumin (zira)', 0.003],
      ['Salt', 0.003],
    ],
  },
  {
    name: 'Margherita Pizza',
    category: 'Pizza',
    menu_price: 65000,
    weight: 5,
    recipe: [
      ['Flour', 0.25],
      ['Mozzarella cheese', 0.15],
      ['Tomato', 0.1],
      ['Tomato paste', 0.03],
      ['Vegetable oil', 0.02],
      ['Fresh herbs', 0.01],
    ],
  },
  {
    name: 'Pepperoni Pizza',
    category: 'Pizza',
    menu_price: 75000,
    weight: 4,
    recipe: [
      ['Flour', 0.25],
      ['Mozzarella cheese', 0.15],
      ['Chicken', 0.1],
      ['Tomato paste', 0.04],
      ['Vegetable oil', 0.02],
    ],
  },
  {
    name: 'Achichuk Salad',
    category: 'Salad',
    menu_price: 18000,
    weight: 6,
    recipe: [
      ['Tomato', 0.15],
      ['Cucumber', 0.1],
      ['Onion', 0.03],
      ['Fresh herbs', 0.01],
      ['Salt', 0.002],
    ],
  },
  {
    name: 'Olivier Salad',
    category: 'Salad',
    menu_price: 25000,
    weight: 4,
    recipe: [
      ['Potato', 0.1],
      ['Egg', 1],
      ['Chicken', 0.05],
      ['Cucumber', 0.05],
      ['Onion', 0.02],
      ['Vegetable oil', 0.02],
    ],
  },
  {
    name: 'Cappuccino',
    category: 'Drinks',
    menu_price: 22000,
    weight: 9,
    recipe: [
      ['Coffee beans', 0.018],
      ['Milk', 0.15],
      ['Sugar', 0.01],
    ],
  },
  {
    name: 'Green Tea',
    category: 'Drinks',
    menu_price: 8000,
    weight: 7,
    recipe: [
      ['Green tea leaves', 0.005],
      ['Sugar', 0.01],
      ['Lemon', 0.02],
    ],
  },
];

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

// Insert the full demo dataset for one restaurant. Returns a summary count.
export async function loadDemoData({ restaurantId, userEmail }) {
  if (!restaurantId) throw new Error('No restaurant id');

  // 1) Ingredients -------------------------------------------------------
  const { data: ingRows, error: ingErr } = await supabase
    .from('ingredients')
    .insert(
      INGREDIENTS.map((i) => ({ ...i, restaurant_id: restaurantId }))
    )
    .select('id, name');
  if (ingErr) throw new Error('ingredients: ' + ingErr.message);
  const ingByName = Object.fromEntries(ingRows.map((r) => [r.name, r.id]));

  // 2) Dishes ------------------------------------------------------------
  const { data: dishRows, error: dishErr } = await supabase
    .from('dishes')
    .insert(
      DISHES.map((d) => ({
        restaurant_id: restaurantId,
        name: d.name,
        category: d.category,
        menu_price: d.menu_price,
      }))
    )
    .select('id, name');
  if (dishErr) throw new Error('dishes: ' + dishErr.message);
  const dishByName = Object.fromEntries(dishRows.map((r) => [r.name, r.id]));

  // 3) Recipe items ------------------------------------------------------
  const recipeRows = [];
  for (const d of DISHES) {
    for (const [ingName, qty] of d.recipe) {
      recipeRows.push({
        dish_id: dishByName[d.name],
        ingredient_id: ingByName[ingName],
        quantity: qty,
      });
    }
  }
  const { error: recErr } = await supabase
    .from('recipe_items')
    .insert(recipeRows);
  if (recErr) throw new Error('recipe_items: ' + recErr.message);

  // 4) Sales — ~30 days, volume driven by each dish's popularity weight --
  const salesRows = [];
  const today = new Date();
  for (let dayBack = 29; dayBack >= 0; dayBack--) {
    const day = new Date(today);
    day.setDate(today.getDate() - dayBack);
    const dow = day.getDay(); // weekend uplift
    const weekendBoost = dow === 5 || dow === 6 ? 1.4 : 1;
    for (const d of DISHES) {
      const base = d.weight * weekendBoost;
      const qty = Math.max(
        0,
        Math.round(base * (0.6 + Math.random() * 0.9))
      );
      if (qty > 0) {
        salesRows.push({
          restaurant_id: restaurantId,
          dish_id: dishByName[d.name],
          quantity: qty,
          sold_on: ymd(day),
        });
      }
    }
  }
  // Insert sales in chunks to keep requests reasonable.
  for (let i = 0; i < salesRows.length; i += 200) {
    const { error: salesErr } = await supabase
      .from('sales')
      .insert(salesRows.slice(i, i + 200));
    if (salesErr) throw new Error('sales: ' + salesErr.message);
  }

  // 5) Waste — a handful of realistic entries over the period ------------
  const wasteSpec = [
    ['Tomato', 3.5, 'Spoiled in storage'],
    ['Lamb', 1.2, 'Trim / over-portioning'],
    ['Milk', 4, 'Expired'],
    ['Fresh herbs', 0.9, 'Wilted'],
    ['Mozzarella cheese', 0.6, 'Mould'],
    ['Cucumber', 1.5, 'Spoiled'],
    ['Beef', 0.8, 'Over-prep'],
  ];
  const wasteRows = wasteSpec.map(([ingName, qty, reason], idx) => {
    const day = new Date(today);
    day.setDate(today.getDate() - idx * 4);
    return {
      restaurant_id: restaurantId,
      ingredient_id: ingByName[ingName],
      quantity: qty,
      reason,
      logged_on: ymd(day),
    };
  });
  const { error: wasteErr } = await supabase
    .from('waste_logs')
    .insert(wasteRows);
  if (wasteErr) throw new Error('waste_logs: ' + wasteErr.message);

  await logActivity({
    restaurant_id: restaurantId,
    user_email: userEmail,
    action: 'seed',
    entity: 'demo_data',
    detail: `Loaded demo menu: ${DISHES.length} dishes, ${INGREDIENTS.length} ingredients, ${salesRows.length} sales rows, ${wasteRows.length} waste entries`,
  });

  return {
    ingredients: INGREDIENTS.length,
    dishes: DISHES.length,
    recipeItems: recipeRows.length,
    sales: salesRows.length,
    waste: wasteRows.length,
  };
}
