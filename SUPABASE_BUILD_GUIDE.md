# MenuMetrics on Supabase + Next.js — build & deploy guide

A deployable, multi-restaurant platform with logins, POS sales ingestion and
analytics. Stack: **Next.js** (React) + **Supabase** (Postgres, Auth, Row-Level
Security) + **Vercel** (hosting). Built with **Claude Code inside VS Code**.

Bonus: this uses Supabase's hosted database, so you **no longer need Node 22** —
your current Node 20 is fine for Next.js.

> Keep a backup for the viva (a screen recording or the old local app) — a cloud
> app needs working internet on demo day.

---

## STEP 0 — Accounts & tools (once)

1. Create free accounts: **Supabase** (supabase.com), **GitHub** (github.com), **Vercel** (vercel.com — sign in with GitHub).
2. In **VS Code**: File → Open Folder → select the `Sadulloh project` (or a new subfolder `menumetrics-cloud`).
3. Open the integrated terminal (**Ctrl+`**) and run `claude` to start Claude Code there. Approve changes as it works. Run `git init` early.
4. In Supabase, create a new project. From Project Settings → API, copy your **Project URL**, **anon public key**, and **service_role key** (keep the service_role key secret).

## How to work each step
Paste the prompt → approve edits → test (`npm run dev`, open http://localhost:3000)
→ tell Claude Code to commit. SQL steps: paste the SQL into Supabase → SQL Editor → Run.

---

## STEP 1 — Scaffold the app
```
Create a new Next.js app (App Router, JavaScript, in this folder) that uses
@supabase/supabase-js. Install dependencies. Add a .env.local with
NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY placeholders, and create
a Supabase client helper. Add a simple home page that confirms the Supabase client
connects. Tell me exactly where to paste my Supabase URL and anon key.
```

## STEP 2 — Database schema (paste this SQL into Supabase → SQL Editor → Run)
```sql
create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null, city text,
  api_key uuid not null default gen_random_uuid(),
  created_at timestamptz default now()
);
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  restaurant_id uuid references restaurants on delete cascade,
  role text not null default 'manager',
  created_at timestamptz default now()
);
create table ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  name text not null, unit text not null, cost_per_unit numeric not null
);
create table dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  name text not null, category text, menu_price numeric not null
);
create table recipe_items (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references dishes on delete cascade,
  ingredient_id uuid not null references ingredients on delete cascade,
  quantity numeric not null
);
create table sales (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  dish_id uuid not null references dishes on delete cascade,
  quantity int not null, sold_on date not null
);
create table waste_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  ingredient_id uuid not null references ingredients on delete cascade,
  quantity numeric not null, reason text, logged_on date not null
);
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants on delete cascade,
  user_email text, action text, entity text, detail text,
  created_at timestamptz default now()
);
create table settings (
  restaurant_id uuid primary key references restaurants on delete cascade,
  currency text default 'so''m', popularity_threshold numeric default 0.70,
  target_waste_pct numeric default 5
);
```

## STEP 3 — Row-Level Security (multi-tenancy)
```
Generate the SQL to enable Row-Level Security on ingredients, dishes, recipe_items,
sales, waste_logs, activity_logs and settings, with policies so a logged-in user
can only SELECT/INSERT/UPDATE/DELETE rows where restaurant_id equals their own
restaurant (looked up via: select restaurant_id from profiles where id = auth.uid()).
For recipe_items (which has no restaurant_id) scope it via its parent dish. Give me
the full SQL to paste into Supabase, and explain how RLS enforces tenant isolation
— I need to defend this in my viva.
```

## STEP 4 — Authentication
```
Add email/password authentication using Supabase Auth: a sign-up page that also
creates a restaurant and a profile row linking the new user to it (role manager),
a login page, logout, and route protection so only logged-in users reach the
dashboard. After login, store the user's restaurant_id from their profile.
```

## STEP 5 — Menu & ingredient management
```
Build pages for the logged-in restaurant to add/edit/delete ingredients and dishes,
with a recipe builder (pick ingredients + quantities) writing to recipe_items.
Validate inputs. All reads/writes go through the Supabase client so RLS keeps data
per-restaurant. Add a "load demo data" button that seeds a sample Tashkent menu.
```

## STEP 6 — POS / sales ingestion
```
Add sales ingestion, scoped to the restaurant: (1) a CSV upload page (columns:
date, dish_name, quantity) that matches dish_name to dishes and inserts sales,
showing a preview and unmatched-row errors; (2) a Next.js API route
POST /api/pos/sales authenticated by the restaurant's api_key that accepts JSON
sales — document the format; (3) a "Simulate POS feed" button generating one
realistic day of sales. Explain how a real POS (Poster, iiko) would call the API.
```

## STEP 7 — Analytics dashboard
```
Port the menu-engineering and waste logic into the app (TypeScript/JS): food cost
from recipes, Kasavana-Smith classification (profitability vs popularity using the
70% rule), waste cost by ingredient, waste ratio, and the rule-based advisor.
Build a dashboard with KPI cards, the menu matrix (scatter chart), revenue-vs-waste
trend, and a recommendations panel. Use Recharts for charts.
```

## STEP 8 — Audit logs & settings
```
Write an activity_logs row on every create/edit/delete and every sales import, and
add a Logs page (latest 200 for this restaurant). Add a Settings page editing the
settings table (currency, popularity threshold, target waste %) and make the
analytics use those values.
```

## STEP 9 — Deploy to Vercel
```
Help me deploy. Steps: push this repo to a new private GitHub repo; then in Vercel
import the repo; add the environment variables NEXT_PUBLIC_SUPABASE_URL and
NEXT_PUBLIC_SUPABASE_ANON_KEY; deploy. Walk me through each click and confirm the
live URL works with login and data.
```

## STEP 10 — Finish up
```
Add a README explaining the architecture (Next.js + Supabase + RLS + Vercel), the
roles, the POS ingestion options, and the live URL. Add basic tests for the
analytics logic. Run /init to refresh CLAUDE.md.
```

---

### Viva talking points this unlocks
- **Multi-tenancy via Postgres Row-Level Security** — strong, modern data-isolation story.
- **Systems integration** — POS ingestion via CSV + authenticated push API.
- **Cloud deployment** — a live, hosted product, not just a localhost demo.
- **Scalability** — managed Postgres + serverless hosting.
