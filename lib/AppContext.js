'use client';

// AppContext.js — the shared "who am I / which restaurant" state.
// app/(app)/layout.js loads the session, profile, restaurant and settings once,
// then provides them here so every page can read them with useApp() instead of
// re-fetching. Also exports DEFAULT_SETTINGS used until a settings row exists.
import { createContext, useContext } from 'react';

// Shared per-session app state: the auth user, their profile (restaurant_id +
// role), their restaurant row (incl. api_key) and the restaurant's settings.
// Populated by the protected (app) layout and consumed by every inner page.
export const AppContext = createContext({
  loading: true,
  user: null,
  profile: null,
  restaurant: null,
  settings: null,
  refresh: async () => {},
  refreshSettings: async () => {},
});

export function useApp() {
  return useContext(AppContext);
}

// Default settings used when a restaurant has no settings row yet.
export const DEFAULT_SETTINGS = {
  currency: "so'm",
  popularity_threshold: 0.7,
  target_waste_pct: 5,
};
