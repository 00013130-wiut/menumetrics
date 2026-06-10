'use client';

// settings/page.js — edit the values that drive the analytics.
//   • currency label, popularity threshold (the Kasavana–Smith factor), and
//     target waste % → saved to the settings table; the dashboard reads these
//     live, so saving here changes the classification/flags immediately.
//   • restaurant name/city, and a read-only view of the POS api_key + your role.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useApp } from '@/lib/AppContext';
import { logActivity } from '@/lib/activity';
import { useToast } from '@/components/Toast';

export default function SettingsPage() {
  const { profile, restaurant, user, settings, refresh, refreshSettings } = useApp();
  const toast = useToast();
  const restaurantId = profile?.restaurant_id;

  const [currency, setCurrency] = useState("so'm");
  const [popThreshold, setPopThreshold] = useState('0.70');
  const [targetWaste, setTargetWaste] = useState('5');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency || "so'm");
      setPopThreshold(String(settings.popularity_threshold ?? 0.7));
      setTargetWaste(String(settings.target_waste_pct ?? 5));
    }
  }, [settings]);

  useEffect(() => {
    if (restaurant) {
      setName(restaurant.name || '');
      setCity(restaurant.city || '');
    }
  }, [restaurant]);

  async function saveSettings() {
    const pt = Number(popThreshold);
    const tw = Number(targetWaste);
    if (!currency.trim()) return toast.error('Currency label is required.');
    if (Number.isNaN(pt) || pt <= 0 || pt > 2)
      return toast.error('Popularity threshold should be a factor between 0 and 2 (default 0.70).');
    if (Number.isNaN(tw) || tw < 0 || tw > 100)
      return toast.error('Target waste % should be between 0 and 100.');

    setBusy(true);
    const { error: err } = await supabase.from('settings').upsert(
      {
        restaurant_id: restaurantId,
        currency: currency.trim(),
        popularity_threshold: pt,
        target_waste_pct: tw,
      },
      { onConflict: 'restaurant_id' }
    );
    setBusy(false);
    if (err) return toast.error(err.message);
    await logActivity({
      restaurant_id: restaurantId,
      user_email: user?.email,
      action: 'update',
      entity: 'settings',
      detail: `currency ${currency.trim()}, popularity ${pt}, target waste ${tw}%`,
    });
    await refreshSettings();
    toast.success('Settings saved. Analytics will use these values.');
  }

  async function saveRestaurant() {
    if (!name.trim()) return toast.error('Restaurant name is required.');
    setBusy(true);
    const { error: err } = await supabase
      .from('restaurants')
      .update({ name: name.trim(), city: city.trim() || null })
      .eq('id', restaurantId);
    setBusy(false);
    if (err) return toast.error(err.message);
    await logActivity({
      restaurant_id: restaurantId,
      user_email: user?.email,
      action: 'update',
      entity: 'restaurant',
      detail: name.trim(),
    });
    await refresh();
    toast.success('Restaurant details updated.');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="subtitle">Currency, analytics thresholds and restaurant details</div>
        </div>
      </div>


      <div className="card">
        <h2>Analytics settings</h2>
        <p className="faint" style={{ fontSize: '0.85rem', marginTop: -4 }}>
          These drive the dashboard. Popularity threshold is the Kasavana-Smith
          factor: a dish is &ldquo;popular&rdquo; if its menu-mix share ≥ threshold ×
          (1 / number of dishes). Target waste % flags the waste ratio.
        </p>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>Currency label</label>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Popularity threshold (factor)</label>
            <input
              type="number"
              step="0.05"
              min="0"
              max="2"
              value={popThreshold}
              onChange={(e) => setPopThreshold(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Target waste %</label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={targetWaste}
              onChange={(e) => setTargetWaste(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary" onClick={saveSettings} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <div className="card">
        <h2>Restaurant</h2>
        <div className="field-row">
          <div className="field" style={{ flex: 2 }}>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>API key (for POS push integration — keep secret)</label>
          <input readOnly value={restaurant?.api_key || ''} className="mono" />
        </div>
        <div className="field">
          <label>Your role</label>
          <input readOnly value={profile?.role || ''} />
        </div>
        <button className="btn btn-primary" onClick={saveRestaurant} disabled={busy}>
          {busy ? 'Saving…' : 'Save restaurant'}
        </button>
      </div>
    </>
  );
}
