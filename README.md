# MenuMetrics

**Multi-restaurant menu-profitability & food-waste intelligence — a cloud SaaS for small cafés.**
Final-Year Business Information Systems Project — WIUT.

A restaurant manager signs up, builds their menu (ingredients → recipes → dishes),
feeds in sales (manually, by CSV, by a simulated POS feed, or via an authenticated
POS push API), and gets a live analytics dashboard: **menu engineering**
(Kasavana–Smith) and **food-waste analysis**, plus a rule-based advisor that
explains what to do and why. All money is in Uzbek **so'm**.

> This is the cloud version. It supersedes the earlier single-machine prototype
> (vanilla Node + SQLite — see `server.js`, `db.js`, `logic.js`, `public/`), which
> is kept in the repo for history.

---

## Stack & architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router, JavaScript, React 19)              │  Presentation +
│  • Tailwind CSS v4 + lucide-react; Fraunces + Inter fonts   │  application logic
│  • Client pages (dashboard, menu, sales, waste, logs, …)    │
│  • Recharts for charts                                       │
│  • Route handlers:  /api/pos/sales  (POS push, service_role) │
│                     /api/analyze    (AI review, server LLM)  │
│                     /api/health     (connectivity probe)     │
└───────────────┬─────────────────────────────────────────────┘
                │  @supabase/supabase-js  (HTTPS / PostgREST + Auth)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase                                                    │  Data + auth
│  • Postgres (the 9 tables below)                             │
│  • Auth (email + password)                                   │
│  • Row-Level Security  ← multi-tenant isolation              │
└─────────────────────────────────────────────────────────────┘
                │  deployed on
                ▼
        Vercel (serverless hosting)
```

**Why this design.** The browser talks to Supabase directly using the public
*anon* key, and **Row-Level Security (RLS)** — not application code — is the
security boundary. Every tenant-scoped table only exposes rows belonging to the
caller's own restaurant, enforced inside Postgres. This is a strong, modern
multi-tenancy story: even if the client is tampered with, a manager can never
read or write another restaurant's data.

### Key files

| Path | Purpose |
|------|---------|
| `lib/supabaseClient.js` | Browser Supabase client (anon key, RLS-enforced) |
| `lib/provision.js` | Creates restaurant + profile + settings on first session |
| `lib/analytics.js` | **Pure** costing / Kasavana–Smith / waste / advisor logic |
| `lib/humanize.js` | Plain-English helpers (summary sentence, KPI meanings, dish blurbs) |
| `lib/demoData.js` | Seeds a sample Tashkent café (menu, recipes, ~30 days sales, waste) |
| `lib/activity.js` | Audit-log helper |
| `lib/csv.js` | CSV parser + sales-row validation |
| `lib/aiFallback.js` | Templated performance review (used when no LLM key) |
| `components/charts.js` | Recharts: menu matrix, revenue/waste area, bar, donut |
| `components/AiAnalysis.js` | AI analysis card (generate, cache, render) |
| `components/Toast.js` | Toast notifications |
| `app/(app)/layout.js` | Auth guard + loads profile/restaurant/settings into context |
| `app/(app)/*` | Dashboard, Menu, Sales, Waste, Logs, Settings pages |
| `app/api/pos/sales/route.js` | Authenticated POS push endpoint |

---

## Data model (existing Supabase schema, RLS enabled)

`restaurants`, `profiles`, `ingredients`, `dishes`, `recipe_items`, `sales`,
`waste_logs`, `activity_logs`, `settings`.

RLS uses a helper `current_restaurant_id()` =
`select restaurant_id from profiles where id = auth.uid()`. Tenant tables have a
policy `restaurant_id = current_restaurant_id()`; `recipe_items` (which has no
`restaurant_id`) is scoped through its parent dish. `restaurants` allows any
authenticated user to `INSERT` (so a new manager can create their own), and
`SELECT`/`UPDATE` only their own.

### Roles

- **manager** — the default; full control of their own restaurant's data.
- **platform_admin** — reserved for a future cross-restaurant operator view.

The role lives in `profiles.role`. Sign-up always creates a `manager`.

---

## Features

1. **Auth** — email/password sign-up & login. Sign-up stores the restaurant name
   in user metadata; the restaurant + profile + settings rows are provisioned on
   the first authenticated session (works whether or not email confirmation is on).
2. **Menu** — CRUD for ingredients and dishes, with an inline **recipe builder**
   and a live food-cost/margin preview. One-click **Load demo data**.
3. **Sales ingestion** — four ways in:
   - manual add-sale form,
   - **CSV upload** (`date, dish_name, quantity`) with preview + unmatched-name
     report,
   - **Simulate POS feed** (one realistic day),
   - **`POST /api/pos/sales`** authenticated POS push API (see below).
4. **Dashboard** — a plain-English summary sentence, KPI cards each with a
   "what this means" line and (i) tooltips, the Kasavana–Smith **scatter matrix**
   (shaded quadrants, human legend), **revenue-vs-waste** area chart, a category
   donut, a most-ordered bar chart, the rule-based **advisor**, and an
   **AI analysis** card (see below). Jargon is renamed for non-technical owners
   ("share of sales", "profit per dish").
5. **Waste** — log spoilage, see top waste by cost, full waste log.
6. **Logs** — audit trail of every create/edit/delete/import (latest 200).
7. **Settings** — currency, popularity threshold, target waste % (the dashboard
   reads these live), plus restaurant details and the POS API key.

### Analytics methodology

- **Food cost / dish** = Σ (recipe quantity × ingredient `cost_per_unit`).
- **Gross profit** = `menu_price` − food cost; **margin %** = gross profit ÷ price.
- **Menu engineering (Kasavana–Smith).** A dish is *high profit* if its gross
  profit ≥ the menu average gross profit; *high popularity* if its share of total
  units sold ≥ `popularity_threshold × (1 / number_of_dishes)` (default factor
  0.70 — the "70% rule"). → **Star** (high/high), **Plowhorse** (low profit/high
  pop), **Puzzle** (high profit/low pop), **Dog** (low/low).
- **Waste.** Cost per entry = quantity × `cost_per_unit`; **waste ratio** =
  waste cost ÷ (waste cost + ingredient cost of sold dishes); ingredients ranked
  by waste cost.
- **Advisor.** Transparent rules — protect Stars, re-cost/reprice Plowhorses,
  promote Puzzles, cut/rework Dogs, and flag high-waste ingredients or a waste
  ratio above target. Every recommendation carries the **evidence** that
  triggered it.

### AI analysis

The dashboard's **AI analysis** card turns the computed numbers into a short,
owner-friendly performance review: a headline, what's going well, the single
biggest problem, and three concrete actions for the week. `POST /api/analyze`
receives the already-computed analytics and calls Claude
(`@anthropic-ai/sdk`, model `LLM_MODEL`, default `claude-opus-4-8`) using the
**server-only** `LLM_API_KEY` — the key is never exposed to the browser. If the
key is missing or the call fails, it falls back to a fluent **templated** summary
built from the same numbers, so the feature always works. The latest review is
cached per restaurant in the browser.

---

## POS ingestion options

| Option | Where | Auth | Use case |
|--------|-------|------|----------|
| Manual add | Sales page | logged-in user (RLS) | one-off corrections |
| CSV upload | Sales page | logged-in user (RLS) | end-of-day export from a till |
| Simulate feed | Sales page | logged-in user (RLS) | demos / testing |
| **Push API** | `POST /api/pos/sales` | restaurant `api_key` | real POS integration |

### `POST /api/pos/sales`

```http
POST /api/pos/sales
x-api-key: <your restaurant api_key>
Content-Type: application/json

{
  "sales": [
    { "date": "2026-06-09", "dish_name": "Osh (Plov)", "quantity": 12 },
    { "date": "2026-06-09", "dish_id": "<uuid>",        "quantity": 5  }
  ]
}
```

Response: `{ "inserted": N, "unmatched": [names], "errors": [strings] }`.
A real POS (Poster, iiko, r_keeper) would call this on each sale or in nightly
batches. Because it runs server-side with no user session, it uses the Supabase
**service_role** key to bypass RLS as a trusted backend — set
`SUPABASE_SERVICE_ROLE_KEY` to enable it (the endpoint returns a clear 503 until
then). The other three ingestion paths need no extra secret.

---

## File map

Every file in the Next.js app and what it's for. (The repo root also holds an
older vanilla-Node + SQLite prototype — `server.js`, `db.js`, `logic.js`,
`public/`, `smoke.js`, `test_logic.js` — kept for history; it is not part of the
running app.)

### `lib/` — data & logic helpers (no UI)
| File | Purpose |
|------|---------|
| `supabaseClient.js` | Single browser Supabase client (anon key); all data access goes through it, RLS-enforced |
| `provision.js` | Creates a new user's restaurant + profile + settings on first authenticated session |
| `AppContext.js` | React context (`useApp()`) holding session, profile, restaurant, settings |
| `analytics.js` | **Pure** maths: food cost, Kasavana–Smith classification, waste analysis, advisor |
| `humanize.js` | Turns numbers into plain-English copy; category display labels + meanings |
| `format.js` | Money (so'm), percent, number and date formatting |
| `csv.js` | CSV parser + sales-row validation for the upload page |
| `demoData.js` | Seeds the sample Tashkent café (ingredients, recipes, ~30 days sales, waste) |
| `activity.js` | `logActivity()` — writes an audit row on every change |
| `aiFallback.js` | Templated performance review used when no LLM key is configured |

### `components/` — reusable UI
| File | Purpose |
|------|---------|
| `Sidebar.js` | Responsive left nav (desktop sidebar / mobile drawer) + sign-out |
| `charts.js` | The four dashboard charts (matrix, revenue-vs-waste, units bar, donut) |
| `AiAnalysis.js` | "AI analysis" dashboard card (calls `/api/analyze`, caches result) |
| `Toast.js` | Toast notifications (`useToast()`) |
| `InfoTooltip.js` | The little (i) explainer used to demystify jargon |
| `Modal.js` | Reusable dialog (used by the menu add/edit forms) |

### `app/` — routes & pages (App Router)
| Path | Purpose |
|------|---------|
| `layout.js` | Root layout: loads fonts (Fraunces/Inter) + global CSS |
| `globals.css` | Tailwind v4 theme tokens + reskinned component classes |
| `page.js` | "/" — connectivity check, then redirect to dashboard or login |
| `login/page.js`, `signup/page.js` | Auth screens |
| `(app)/layout.js` | Protected shell: auth guard, loads context, renders sidebar + toasts |
| `(app)/dashboard/page.js` | The analytics dashboard (summary, KPIs, AI card, charts, advisor, table) |
| `(app)/menu/page.js` | Ingredients + dishes CRUD with the recipe builder & demo data |
| `(app)/sales/page.js` | Manual add / CSV import / simulate feed / recent sales / API docs |
| `(app)/waste/page.js` | Log spoilage and see top waste by cost |
| `(app)/logs/page.js` | Activity audit trail (latest 200) |
| `(app)/settings/page.js` | Currency, thresholds, restaurant details, api_key |
| `api/pos/sales/route.js` | External POS push endpoint (api_key auth, service_role) |
| `api/analyze/route.js` | AI performance review (LLM + templated fallback) |
| `api/health/route.js` | Supabase connectivity probe |

### Other
| Path | Purpose |
|------|---------|
| `tests/analytics.test.mjs` | Unit tests for the analytics logic (`npm test`) |
| `public/sample-sales.csv` | Example CSV for the sales import page |

---

## Local development

### Prerequisites
- Node.js 18.17+ (developed on Node 22).

### Environment — `.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
# Optional — only needed to enable POST /api/pos/sales:
SUPABASE_SERVICE_ROLE_KEY=<service_role secret key>
# Optional — enables AI-written reviews (otherwise a templated summary is used):
LLM_API_KEY=<anthropic api key>
LLM_MODEL=claude-opus-4-8
```

### Run
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

### First run
Sign up with a restaurant name → log in → **Menu → Load demo data** → open the
**Dashboard**.

> **Tip for instant demos:** in Supabase → Authentication → Sign In / Providers →
> Email, turning **Confirm email** *off* makes sign-up log you straight in. With
> it on, confirm the email once, then log in — the restaurant is provisioned on
> first login either way.

---

## Deployment (Vercel)

1. Push this repo to GitHub.
2. In Vercel, **Import** the repo (root = this folder).
3. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (and `SUPABASE_SERVICE_ROLE_KEY` if you want the POS push API).
4. Deploy → open the live URL → sign up and load demo data.

In Supabase → Authentication → URL Configuration, add the Vercel URL to the
allowed redirect/site URLs

