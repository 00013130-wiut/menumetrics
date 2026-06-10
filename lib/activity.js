'use client';

// activity.js — one tiny helper, logActivity(), that appends a row to the
// activity_logs table. Called from every create / edit / delete / import across
// the app so the Logs page has a complete audit trail. Best-effort: a logging
// failure is swallowed so it can never break the action the user actually did.
import { supabase } from '@/lib/supabaseClient';

// Append an audit-trail row. Best-effort: a logging failure must never break
// the primary action, so errors are swallowed (and surfaced to the console).
// RLS requires restaurant_id == the caller's own restaurant.
export async function logActivity({
  restaurant_id,
  user_email,
  action,
  entity,
  detail,
}) {
  if (!restaurant_id) return;
  try {
    const { error } = await supabase.from('activity_logs').insert({
      restaurant_id,
      user_email: user_email || null,
      action: action || null,
      entity: entity || null,
      detail: detail || null,
    });
    if (error) console.warn('activity log failed:', error.message);
  } catch (e) {
    console.warn('activity log failed:', e);
  }
}
