'use client';

// menu/page.js — manage the restaurant's ingredients, dishes and recipes.
// Two tabs: Ingredients (name, unit, cost-per-unit) and Dishes (name, category,
// price + a recipe builder that links ingredients & quantities → recipe_items).
// As you build a recipe it shows the live food cost and margin. Every insert
// sets restaurant_id to the logged-in restaurant (RLS also enforces this), and
// every change writes an activity-log row. "Load demo data" seeds a sample
// Tashkent café so the app can be demoed instantly.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useApp } from '@/lib/AppContext';
import { logActivity } from '@/lib/activity';
import { loadDemoData } from '@/lib/demoData';
import { dishFoodCost, dishProfitability } from '@/lib/analytics';
import { formatMoney, formatPct } from '@/lib/format';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';

export default function MenuPage() {
  const { profile, restaurant, user, settings } = useApp();
  const toast = useToast();
  const restaurantId = profile?.restaurant_id;
  const currency = settings?.currency || "so'm";

  const [tab, setTab] = useState('dishes');
  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [recipeItems, setRecipeItems] = useState([]);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);

  const [editIng, setEditIng] = useState(null); // ingredient object or {} for new
  const [editDish, setEditDish] = useState(null); // dish object or {} for new

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError('');
    const [ing, dsh, rec] = await Promise.all([
      supabase
        .from('ingredients')
        .select('id, name, unit, cost_per_unit')
        .order('name'),
      supabase
        .from('dishes')
        .select('id, name, category, menu_price')
        .order('name'),
      supabase.from('recipe_items').select('id, dish_id, ingredient_id, quantity'),
    ]);
    if (ing.error || dsh.error || rec.error) {
      setError(
        (ing.error || dsh.error || rec.error).message || 'Failed to load menu'
      );
    } else {
      setIngredients(ing.data || []);
      setDishes(dsh.data || []);
      setRecipeItems(rec.data || []);
    }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Cost map: ingredient_id -> cost_per_unit (and a name lookup).
  const ingById = useMemo(
    () => Object.fromEntries(ingredients.map((i) => [i.id, i])),
    [ingredients]
  );

  // Per-dish computed food cost + margin.
  const dishStats = useMemo(() => {
    const byDish = {};
    for (const r of recipeItems) {
      (byDish[r.dish_id] ||= []).push({
        quantity: r.quantity,
        cost_per_unit: ingById[r.ingredient_id]?.cost_per_unit || 0,
      });
    }
    const map = {};
    for (const d of dishes) {
      const fc = dishFoodCost(byDish[d.id] || []);
      const prof = dishProfitability(d.menu_price, fc);
      map[d.id] = {
        foodCost: fc,
        items: (byDish[d.id] || []).length,
        ...prof,
      };
    }
    return map;
  }, [dishes, recipeItems, ingById]);

  async function handleSeed() {
    if (dishes.length > 0 || ingredients.length > 0) {
      const ok = window.confirm(
        'Your menu already has data. Load the demo dataset on top of it anyway?'
      );
      if (!ok) return;
    }
    setSeeding(true);
    try {
      const summary = await loadDemoData({
        restaurantId,
        userEmail: user?.email,
      });
      toast.success(
        `Demo data loaded: ${summary.dishes} dishes, ${summary.ingredients} ingredients, ${summary.sales} sales.`
      );
      await load();
    } catch (e) {
      toast.error('Demo load failed: ' + e.message);
    }
    setSeeding(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Menu</h1>
          <div className="subtitle">
            Ingredients, dishes and recipes for {restaurant?.name}
          </div>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button
            className="btn"
            onClick={handleSeed}
            disabled={seeding}
            title="Insert a sample Tashkent café menu with sales & waste"
          >
            {seeding ? 'Loading…' : '✨ Load demo data'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="toolbar">
        <button
          className={'btn btn-sm' + (tab === 'dishes' ? ' btn-primary' : '')}
          onClick={() => setTab('dishes')}
        >
          Dishes ({dishes.length})
        </button>
        <button
          className={'btn btn-sm' + (tab === 'ingredients' ? ' btn-primary' : '')}
          onClick={() => setTab('ingredients')}
        >
          Ingredients ({ingredients.length})
        </button>
        <div className="spacer" />
        {tab === 'dishes' ? (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setEditDish({})}
          >
            + Add dish
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setEditIng({})}
          >
            + Add ingredient
          </button>
        )}
      </div>

      {loading ? (
        <div className="card">
          <div className="skeleton" style={{ height: 180 }} />
        </div>
      ) : tab === 'dishes' ? (
        <DishesTable
          dishes={dishes}
          dishStats={dishStats}
          currency={currency}
          onEdit={(d) => setEditDish(d)}
          onDelete={async (d) => {
            if (!window.confirm(`Delete dish "${d.name}"? Its recipe will be removed too.`))
              return;
            const { error } = await supabase.from('dishes').delete().eq('id', d.id);
            if (error) return toast.error(error.message);
            await logActivity({
              restaurant_id: restaurantId,
              user_email: user?.email,
              action: 'delete',
              entity: 'dish',
              detail: d.name,
            });
            await load();
            toast.success(`Deleted "${d.name}".`);
          }}
          onEmpty={() => setEditDish({})}
          onSeed={handleSeed}
        />
      ) : (
        <IngredientsTable
          ingredients={ingredients}
          currency={currency}
          onEdit={(i) => setEditIng(i)}
          onDelete={async (i) => {
            if (!window.confirm(`Delete ingredient "${i.name}"?`)) return;
            const { error } = await supabase
              .from('ingredients')
              .delete()
              .eq('id', i.id);
            if (error)
              return toast.error(
                error.message.includes('foreign key')
                  ? `"${i.name}" is used in a recipe or waste log; remove those first.`
                  : error.message
              );
            await logActivity({
              restaurant_id: restaurantId,
              user_email: user?.email,
              action: 'delete',
              entity: 'ingredient',
              detail: i.name,
            });
            await load();
            toast.success(`Deleted "${i.name}".`);
          }}
          onEmpty={() => setEditIng({})}
          onSeed={handleSeed}
        />
      )}

      {editIng && (
        <IngredientModal
          initial={editIng}
          restaurantId={restaurantId}
          userEmail={user?.email}
          onClose={() => setEditIng(null)}
          onSaved={async () => {
            setEditIng(null);
            await load();
            toast.success('Ingredient saved.');
          }}
          onError={toast.error}
        />
      )}

      {editDish && (
        <DishModal
          initial={editDish}
          ingredients={ingredients}
          recipeItems={recipeItems}
          restaurantId={restaurantId}
          userEmail={user?.email}
          currency={currency}
          onClose={() => setEditDish(null)}
          onSaved={async () => {
            setEditDish(null);
            await load();
            toast.success('Dish saved.');
          }}
          onError={toast.error}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function DishesTable({ dishes, dishStats, currency, onEdit, onDelete, onEmpty, onSeed }) {
  if (dishes.length === 0) {
    return (
      <div className="card empty">
        <div className="empty-icon">🍽️</div>
        <p>No dishes yet.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={onEmpty}>
            + Add your first dish
          </button>
          <button className="btn btn-sm" onClick={onSeed}>
            ✨ Load demo data
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Dish</th>
            <th>Category</th>
            <th className="num">Price</th>
            <th className="num">Food cost</th>
            <th className="num">Gross profit</th>
            <th className="num">Margin</th>
            <th className="num">Recipe</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {dishes.map((d) => {
            const s = dishStats[d.id] || {};
            return (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>
                  <span className="pill">{d.category || '—'}</span>
                </td>
                <td className="num">{formatMoney(d.menu_price, currency)}</td>
                <td className="num">{formatMoney(s.foodCost, currency)}</td>
                <td className="num">{formatMoney(s.grossProfit, currency)}</td>
                <td className="num">{formatPct(s.marginPct)}</td>
                <td className="num">
                  {s.items ? (
                    `${s.items} item${s.items === 1 ? '' : 's'}`
                  ) : (
                    <span className="faint">none</span>
                  )}
                </td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => onEdit(d)}>
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--red)' }}
                    onClick={() => onDelete(d)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IngredientsTable({ ingredients, currency, onEdit, onDelete, onEmpty, onSeed }) {
  if (ingredients.length === 0) {
    return (
      <div className="card empty">
        <div className="empty-icon">🧺</div>
        <p>No ingredients yet.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={onEmpty}>
            + Add your first ingredient
          </button>
          <button className="btn btn-sm" onClick={onSeed}>
            ✨ Load demo data
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Unit</th>
            <th className="num">Cost / unit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ingredients.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>
                <span className="pill">{i.unit}</span>
              </td>
              <td className="num">{formatMoney(i.cost_per_unit, currency)}</td>
              <td className="num" style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(i)}>
                  Edit
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--red)' }}
                  onClick={() => onDelete(i)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ingredient modal
// ---------------------------------------------------------------------------

function IngredientModal({ initial, restaurantId, userEmail, onClose, onSaved, onError }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || '');
  const [unit, setUnit] = useState(initial.unit || 'kg');
  const [cost, setCost] = useState(
    initial.cost_per_unit != null ? String(initial.cost_per_unit) : ''
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    if (!name.trim()) return setErr('Name is required.');
    if (!unit.trim()) return setErr('Unit is required.');
    const costNum = Number(cost);
    if (cost === '' || Number.isNaN(costNum) || costNum < 0)
      return setErr('Cost per unit must be a number ≥ 0.');

    setBusy(true);
    const payload = {
      name: name.trim(),
      unit: unit.trim(),
      cost_per_unit: costNum,
    };
    let error;
    if (isEdit) {
      ({ error } = await supabase
        .from('ingredients')
        .update(payload)
        .eq('id', initial.id));
    } else {
      ({ error } = await supabase
        .from('ingredients')
        .insert({ ...payload, restaurant_id: restaurantId }));
    }
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    await logActivity({
      restaurant_id: restaurantId,
      user_email: userEmail,
      action: isEdit ? 'edit' : 'create',
      entity: 'ingredient',
      detail: payload.name,
    });
    onSaved();
  }

  return (
    <Modal
      title={isEdit ? 'Edit ingredient' : 'New ingredient'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {err && <div className="alert alert-error">{err}</div>}
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: 1 }}>
          <label>Unit</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="l">l</option>
            <option value="ml">ml</option>
            <option value="pcs">pcs</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Cost per unit (so'm)</label>
          <input
            type="number"
            min="0"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Dish modal (with recipe builder)
// ---------------------------------------------------------------------------

function DishModal({
  initial,
  ingredients,
  recipeItems,
  restaurantId,
  userEmail,
  currency,
  onClose,
  onSaved,
  onError,
}) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || '');
  const [category, setCategory] = useState(initial.category || '');
  const [price, setPrice] = useState(
    initial.menu_price != null ? String(initial.menu_price) : ''
  );
  // Recipe rows: { ingredient_id, quantity }
  const [rows, setRows] = useState(() => {
    if (!isEdit) return [{ ingredient_id: '', quantity: '' }];
    const existing = recipeItems
      .filter((r) => r.dish_id === initial.id)
      .map((r) => ({ ingredient_id: r.ingredient_id, quantity: String(r.quantity) }));
    return existing.length ? existing : [{ ingredient_id: '', quantity: '' }];
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const ingById = useMemo(
    () => Object.fromEntries(ingredients.map((i) => [i.id, i])),
    [ingredients]
  );

  const liveFoodCost = useMemo(() => {
    return rows.reduce((sum, r) => {
      const ing = ingById[r.ingredient_id];
      const q = Number(r.quantity);
      if (!ing || Number.isNaN(q)) return sum;
      return sum + q * Number(ing.cost_per_unit);
    }, 0);
  }, [rows, ingById]);

  function updateRow(idx, key, val) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { ingredient_id: '', quantity: '' }]);
  }
  function removeRow(idx) {
    setRows((rs) => rs.filter((_, i) => i !== idx));
  }

  async function save() {
    setErr('');
    if (!name.trim()) return setErr('Dish name is required.');
    const priceNum = Number(price);
    if (price === '' || Number.isNaN(priceNum) || priceNum < 0)
      return setErr('Menu price must be a number ≥ 0.');

    // Validate recipe rows: keep only filled rows, validate them.
    const filled = rows.filter((r) => r.ingredient_id || r.quantity !== '');
    for (const r of filled) {
      if (!r.ingredient_id) return setErr('Every recipe row needs an ingredient.');
      const q = Number(r.quantity);
      if (Number.isNaN(q) || q <= 0)
        return setErr('Every recipe quantity must be a number > 0.');
    }
    const ids = filled.map((r) => r.ingredient_id);
    if (new Set(ids).size !== ids.length)
      return setErr('An ingredient appears twice in the recipe — combine them.');

    setBusy(true);
    let dishId = initial.id;
    const dishPayload = {
      name: name.trim(),
      category: category.trim() || null,
      menu_price: priceNum,
    };

    if (isEdit) {
      const { error } = await supabase
        .from('dishes')
        .update(dishPayload)
        .eq('id', dishId);
      if (error) {
        setBusy(false);
        return setErr(error.message);
      }
    } else {
      // Generate id client-side so we can insert recipe items without relying
      // on INSERT..RETURNING.
      dishId = crypto.randomUUID();
      const { error } = await supabase
        .from('dishes')
        .insert({ id: dishId, restaurant_id: restaurantId, ...dishPayload });
      if (error) {
        setBusy(false);
        return setErr(error.message);
      }
    }

    // Sync recipe: simplest correct approach — replace all rows for this dish.
    if (isEdit) {
      await supabase.from('recipe_items').delete().eq('dish_id', dishId);
    }
    if (filled.length) {
      const { error: recErr } = await supabase.from('recipe_items').insert(
        filled.map((r) => ({
          dish_id: dishId,
          ingredient_id: r.ingredient_id,
          quantity: Number(r.quantity),
        }))
      );
      if (recErr) {
        setBusy(false);
        return setErr('Recipe save failed: ' + recErr.message);
      }
    }

    setBusy(false);
    await logActivity({
      restaurant_id: restaurantId,
      user_email: userEmail,
      action: isEdit ? 'edit' : 'create',
      entity: 'dish',
      detail: `${dishPayload.name} (${filled.length} recipe items)`,
    });
    onSaved();
  }

  return (
    <Modal
      title={isEdit ? 'Edit dish' : 'New dish'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save dish'}
          </button>
        </>
      }
    >
      {err && <div className="alert alert-error">{err}</div>}
      <div className="field-row">
        <div className="field" style={{ flex: 2 }}>
          <label>Dish name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Main, Pizza…"
            list="cat-list"
          />
          <datalist id="cat-list">
            <option value="Main" />
            <option value="Grill" />
            <option value="Pizza" />
            <option value="Salad" />
            <option value="Drinks" />
            <option value="Dessert" />
          </datalist>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Price (so'm)</label>
          <input
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
      </div>

      <div className="row-between" style={{ marginTop: 8, marginBottom: 8 }}>
        <label style={{ margin: 0 }}>Recipe</label>
        <span className="faint" style={{ fontSize: '0.82rem' }}>
          Food cost: <strong>{formatMoney(liveFoodCost, currency)}</strong>
          {price && Number(price) > 0 && (
            <> · margin {formatPct((Number(price) - liveFoodCost) / Number(price))}</>
          )}
        </span>
      </div>

      {ingredients.length === 0 ? (
        <div className="alert alert-info">
          Add some ingredients first, then build the recipe here.
        </div>
      ) : (
        <>
          {rows.map((r, idx) => (
            <div className="field-row" key={idx} style={{ marginBottom: 8 }}>
              <div style={{ flex: 2 }}>
                <select
                  value={r.ingredient_id}
                  onChange={(e) => updateRow(idx, 'ingredient_id', e.target.value)}
                >
                  <option value="">Select ingredient…</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    r.ingredient_id
                      ? 'qty in ' + (ingById[r.ingredient_id]?.unit || '')
                      : 'quantity'
                  }
                  value={r.quantity}
                  onChange={(e) => updateRow(idx, 'quantity', e.target.value)}
                />
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ flex: '0 0 auto', color: 'var(--red)' }}
                onClick={() => removeRow(idx)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <button className="btn btn-sm" onClick={addRow} style={{ marginTop: 4 }}>
            + Add ingredient to recipe
          </button>
        </>
      )}
    </Modal>
  );
}
