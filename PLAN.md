# Build Plan

Inputs: [ASSESSMENT.md](ASSESSMENT.md) (brief + agreed interpretations), [API_NOTES.md](API_NOTES.md)
(observed API behaviour) and [RESEARCH.md](RESEARCH.md) (stack research with sources).
Requirement IDs (R1–R16) are listed at the bottom.

## 0. What changed after the research phase

Items marked **[changed]** below differ from the first version of this plan.

| # | Before | After | Why (RESEARCH.md section) |
|---|---|---|---|
| 1 | React + **Vite** SPA served by Django | **Next.js 16** App Router on **Vercel** | Requested stack; React is still the UI layer (brief says React) |
| 2 | One container (Django + WhiteNoise serves the SPA) | **Two deployables:** Vercel (Next.js) + Render (Django); Next.js **rewrites** `/api/*` to Django | Same-origin browser calls with no CORS; backend URL stays server-side; static export can't rewrite (§3.3, C6) |
| 3 | `django-cors-headers`, `whitenoise` | **Dropped** | Same-origin via rewrites; Django serves no static files (§2.3, §8) |
| 4 | Plain `os.environ` settings | **`django-environ`** + `.env.example`, still one settings file | Typed env casting, missing-secret errors (§2.2, C4) |
| 5 | `trips/services/*` held everything | Split into `api/`, `services/`, `domain/`, `integrations/` | Thin views, pure testable domain, isolated HTTP clients (§2.1) |
| 6 | Django test runner + `unittest.mock` | **pytest + pytest-django + responses** | Parametrised band-edge tables, HTTP mocking fed by samples (§6.1) |
| 7 | No lint/format/CI | **Ruff**, **ESLint 9 + Prettier**, **pre-commit**, **GitHub Actions** | §7 |
| 8 | `requirements.txt` | **uv** (`pyproject.toml` + `uv.lock`) | Locked installs; Render supports uv via `uv.lock` (§7.2) |
| 9 | Dockerfile + render.yaml | **No Docker**; native builds on Vercel and Render | Nothing to compose (§7.5) |
| 10 | Endpoints `/api/plan`, `/api/heatmap`, `/api/geocode` | `/api/trip-plans`, `/api/heatmaps`, `/api/places`, `/api/health` | Naming conventions (§5) |
| 11 | Versions unpinned | Pinned from registries: Django **5.2.18 LTS**, TS **6.0.3**, ESLint **9.39.5** (not the newest) | Compatibility conflicts C1–C3 |
| 12 | — | Health-check "waking server" state | Render free tier sleeps; proxy timeout unverified (§11) |
| 13 | — | Attribution footer (Open-Meteo CC BY 4.0, © OpenStreetMap) | Open-Meteo terms; OSM data in tiles/routing/geocoding (§10) |
| 14 | — | **C0 tooling checkpoint** added; C8/C12 rewritten for Next.js and two hosts | Build order (§5 below) |

## 0b. Frontend re-plan (2026-10-18, after C7) **[frontend]**

Items marked **[frontend]** changed in this pass. The backend (C0–C7) is unchanged.

| # | Before | After | Why |
|---|---|---|---|
| F1 | Next.js 16 App Router | **React 19 + Vite 8 SPA** (`create-vite` `react-ts`) | Your direction: React, not Next.js. Nothing needs SSR: every request is user-triggered (§7.1) |
| F2 | Next.js `rewrites()` proxy | **Vite `server.proxy`** in dev, **`vercel.json` rewrite** in prod | Keeps same-origin `/api` calls: still no CORS, no backend URL in the bundle (§7.2) |
| F3 | No router (one page) | **React Router 8, data mode** (`createBrowserRouter`) | Nested layout, route error boundaries, lazy routes (§7.6) |
| F4 | Plain hooks, "React Query is overkill" | **TanStack Query 5** | Trip state moves to the URL, so the plan becomes a query keyed by URL params; cache, dedupe and cancellation for 4 queries (§7.8) |
| F5 | Tailwind only | **Tailwind 4 + shadcn/ui** (copied-in components on Radix) | Accessible slider and primitives without writing them; we own the code (§7.5) |
| F6 | ESLint 9 (pinned for Next plugins) | **ESLint 10** + typescript-eslint + react-hooks 7 + react-refresh + TanStack Query plugin | No Next.js plugins any more; all of these declare ESLint 10 support (§7.10) |
| F7 | — | **Design tokens** (CSS variables), WCAG AA checked, light theme only | §7.3 |
| F8 | — | Trip inputs, selected route and heatmap hour in **URL search params** | Survive refresh, shareable (§7.6) |
| F10 | Light theme, Positron basemap, system font | **Dark Spotter-style theme** (navy + turquoise), OpenFreeMap **dark** basemap, **DM Sans** | Your choice (Option D); risk colours and heatmap read better on a dark map (§7.3) |
| F9 | C8–C13 | **C8–C15**, in your order: setup + tokens → ui → layout + router → API + hooks → screens → deploy → docs | §5 |

## 1. Tech stack **[changed]**

| Layer | Choice | Why |
|---|---|---|
| Backend | **Django 5.2.18 LTS + DRF 3.18.3** | Required by the brief; 5.2 is the series every dependency supports (RESEARCH C3) |
| Settings | **django-environ 0.14.0**, one `settings.py` | 12-factor env config; no environment-specific code (C4) |
| HTTP client | `requests` 2.34.2 | Simple; thread pool for parallel weather batches |
| Cache | Django **LocMemCache** | Per-process, enough for an assessment; Redis noted as upgrade |
| Database | **none** | Stateless |
| App server | gunicorn 26.2.0 | Render start command |
| Python tooling | **uv 0.13.1**, Python 3.12 | Locked, fast installs; Render-native |
| Frontend **[frontend]** | **React 19.3.0 + Vite 8.3.2 + TypeScript 6.0.3**, React Router 8.4.0, TanStack Query 5.104.1 | §7 (full package list in §7.11) |
| Map | **maplibre-gl 6.12.0**, used directly | WebGL; imperative `setPaintProperty` keeps the slider smooth (40 % of grade) |
| Basemap | OpenFreeMap **dark** style (background `#0c0c0c`) **[frontend]** | Keyless; style JSON fetched OK on 2026-10-18 (§7.3) |
| Styling **[frontend]** | Tailwind CSS 4.3.3 (`@tailwindcss/vite`) + shadcn/ui components | §7.5 |
| Tests | pytest 9.1.1 + pytest-django 4.14.0 + responses 0.26.3; Vitest 5.0.3 + React Testing Library 16.3.3 + jsdom 30.1.1 | §6 of RESEARCH, §7.11 |
| Quality | Ruff 0.17.1; **ESLint 10.12.0** + typescript-eslint 8.71.0 + Prettier 3.9.9; pre-commit 4.7.0; GitHub Actions | §7.10 |
| Hosting | **Vercel** (frontend) + **Render** free web service (backend) | Pending your answer (RESEARCH Q1) |

The draft code moved to scratchpad in Phase 0 is not reused wholesale; pieces are rewritten per checkpoint.

## 2. Folder structure **[changed]**

```text
my-app/
├── ASSESSMENT.md  API_NOTES.md  RESEARCH.md  PLAN.md  README.md
├── .pre-commit-config.yaml
├── .github/workflows/ci.yml            backend job + frontend job
├── scripts/                            probes, tuning, samples/ (Phases 1–2)
├── backend/
│   ├── pyproject.toml  uv.lock  .python-version  .env.example  manage.py
│   ├── config/                         settings.py, urls.py, wsgi.py
│   ├── trips/
│   │   ├── api/                        serializers.py, views.py, exception_handler.py, urls.py
│   │   ├── services/                   trip_planning.py, heatmap.py
│   │   ├── domain/                     risk.py, geo.py, checkpoints.py, ranking.py
│   │   ├── integrations/               http.py, osrm.py, open_meteo.py, photon.py
│   │   └── exceptions.py
│   └── tests/                          conftest.py, fixtures/, domain/, integrations/, services/, api/
└── frontend/                           React + Vite SPA; full tree in §7.7 [frontend]
```

## 3. Data flow **[changed]**

```text
 Browser (React SPA)    Vercel rewrite **[frontend]**  Django (Render)                   Third-party
 ───────                ────────────────          ───────────────                        ───────────
 page load ──GET /api/health──▶ rewrite ──▶ HealthApi  (wakes a sleeping Render instance)

 PlaceInput ──GET /api/places?q=──▶ rewrite ──▶ PlaceSearchApi
                                                  → integrations.photon.search ─────────▶ Photon /api (bbox)

 TripForm ──POST /api/trip-plans──▶ rewrite ──▶ TripPlanCreateApi
   {origin, destination,                          input serializer validates
    departure (UTC ISO),                          services.trip_planning.plan_trip
    load_lb, interval_mi}                           1. integrations.osrm.routes ────────▶ OSRM alternatives=3
                                                       if < 3: photon.nearest_town ─────▶ Photon /reverse
                                                               osrm.route_via ──────────▶ OSRM alternatives=false
                                                       domain filters: overlap > 0.8, detour > 1.5×
                                                    2. domain.checkpoints: every N mi, ETA per checkpoint
                                                    3. integrations.open_meteo.hourly ──▶ Open-Meteo (≤200/batch, 4 parallel, cached)
                                                    4. domain.risk.assess at ETA hour + load rules
                                                    5. domain.ranking: rank + explanation
                                                    6. domain.geo: simplify, split into risk segments
            ◀── routes[], checkpoints[], summaries, recommendation, warnings

 HeatmapControls ──POST /api/heatmaps──▶ rewrite ──▶ HeatmapCreateApi
   {departure, load_lb, routes}                     services.heatmap.build_heatmap (grid ≤ 120 cells)
                                                    integrations.open_meteo.hourly (49 h) ─▶ Open-Meteo
            ◀── {start, cell_deg, cells: [{lon, lat, risk[49], wind[49], rain[49], snow[49]}]}

 Slider 0–48 h → MapLibre setPaintProperty only (no request, no React re-render of the map)
```

### API contract (draft) **[changed: paths only]**

`POST /api/trip-plans` → `200`

```text
{
  departure, load_lb, interval_mi,
  recommended_route_id: "A",
  recommendation: { reason: "Fewest Severe miles (0 vs 20 on B)", ranking: ["A","C","B"] },
  warnings: ["Only 2 distinct routes found for this corridor"],
  routes: [{
    id, label, via_town, distance_mi, duration_s, arrival,
    summary: { miles_by_level: {low, moderate, high, severe, no_travel}, avg_risk, max_level },
    geometry: [[lon, lat], …],
    segments: [{ level, coordinates }],
    checkpoints: [{ mile, lon, lat, eta, covers: [start_mi, end_mi],
                    wind_mph, rain_in_hr, snow_in_hr,
                    level, wind_level, rain_level, snow_level, reasons }]
  }]
}
```

`GET /api/places?q=dal` → `[{ label, lat, lon }]` · `GET /api/health` → `{ "status": "ok" }`

Error body (all endpoints): `{ "message": str, "extra": {...} }` **[changed]** (HackSoft shape; field
errors under `extra.fields`).

## 4. Errors, loading, caching, missing keys

### Errors **[changed: mechanism]**
- One `ApplicationError` hierarchy in `trips/exceptions.py`, mapped by a custom DRF exception handler:
  validation → **400**, `NoRouteError` / `ForecastHorizonError` → **422**, `ProviderError` → **502**.
- Validation checks: both places present and ≥ 1 mi apart, load 1–80,000 lb, interval ∈ {10, 25, 50},
  departure no more than 1 h in the past; after routing, `departure + longest trip` and
  `departure + 48 h` must fit the ~15-day horizon.
- Retries: network errors and 5xx, up to 3× with backoff. A provider 429 is not retried: it becomes
  **503** with `retry_after` (C7). Our own per-IP limit returns **429**. Errors are mapped by status
  code; OSRM's documented `code` field is the one exception (C5).
- Weather is all-or-nothing for a plan. A heatmap failure never fails the plan.
- Fewer than 3 routes is a warning, not an error.

### Loading states **[changed: + health]**
- **Waking state:** `use-backend-health` calls `/api/health` on page load. While it hasn't answered,
  the form shows "Waking the server (free hosting sleeps after 15 min)…" and retries. The submit
  button stays disabled until it answers.
- Plan request (~4–12 s): disabled form, spinner, status line.
- Heatmap: loads after routes are drawn, own spinner.
- Autocomplete: 300 ms debounce, ≥ 3 characters, `AbortController` cancels stale requests.

### Caching
| What | Key | TTL |
|---|---|---|
| Weather series | snapped coord (0.05°) + window start hour + length | 15 min |
| Place search | normalised query | 24 h |
| Town lookup | rounded via-point (0.05°) | 24 h |
| Route set | rounded origin/destination (4 dp) | 1 h |

### Missing keys / env **[changed]**
- Backend: `DJANGO_SECRET_KEY` is required in production (django-environ raises
  `ImproperlyConfigured` when missing). Provider URLs and `OPEN_METEO_API_KEY` are optional.
- Frontend **[frontend]**: no secrets, ever. `VITE_API_BASE_URL` (optional, default `/api`) is the only
  `VITE_` variable. Dev proxy target comes from `DEV_BACKEND_URL` (read in `vite.config.ts`, never bundled).
- Both sides ship `.env.example`; `.env*` is git-ignored.

## 5. Build order (checkpoints) **[changed]**

Each checkpoint ends with: run it, confirm it works, commit, report to you.

| # | Checkpoint | How it's tested on its own | Covers |
|---|---|---|---|
| **C0** **[new]** | Tooling: `backend/pyproject.toml` (uv), Ruff config, pytest config; `.pre-commit-config.yaml`; CI workflow with the backend job | `uv sync`, `uv run ruff check`, `uv run ruff format --check` green; `pre-commit run --all-files`; pytest needs the Django project, so its first green run is in C1 | R13, R16 |
| **C1** | Django skeleton: env settings, DRF, exception handler, `GET /api/health` | pytest API test + `curl /api/health` | — |
| **C2** | `domain/risk.py` | Parametrised tests for every band edge and each load rule (30,000 vs 30,001 lb, etc.) | R7, R8 |
| **C3** | `domain/geo.py` + `domain/checkpoints.py` | Tests on the Dallas–Houston sample: counts at 10/25/50 mi, coverage sums to length, ETA at destination = route duration | R5, R6 |
| **C4** | `integrations/http.py` + `open_meteo.py` | `responses` tests: object vs list, `hourly_units` conversion, null handling, 400/414/timeout, retry, cache hit | R6 |
| **C5** | `integrations/osrm.py`, `photon.py` + alternative-route logic + `GET /api/places` | `responses` tests with samples: duplicate/detour rejected, < 3 routes path; manual Dallas–Houston + Seattle–Portland | R1, R4 |
| **C6** | `domain/ranking.py` + `services/trip_planning.py` + `POST /api/trip-plans` | Ranking tests (no-travel → severe → high → avg → time, ties, explanation); API test with providers mocked; one real call | R2, R3, R9 |
| **C7** | `services/heatmap.py` + `POST /api/heatmaps` | Grid bounded for a 1,000 mi route; levels match `risk.py`; real call timing | R11 |
| **C8** **[frontend]** | Setup + design tokens: `create-vite` react-ts, pins (§7.11), ESLint/Prettier/Vitest, `@/` alias, Vite proxy, `tokens.css`, CI frontend job, Docker service | `lint`, `typecheck`, `test`, `build` green; a token swatch test page renders in dev only | R12 |
| **C9** **[frontend]** | `components/ui/` (§7.5 list) | RTL tests: variants, disabled/loading, labels wired to errors, combobox keyboard (APG) | R12 |
| **C10** **[frontend]** | Layout + router: `AppLayout`, route map (§7.6), lazy routes, error boundary, 404 | Tests: unknown path → 404 page, thrown error → error page, nav links | R12 |
| **C11** **[frontend]** | API client + hooks (§7.8, §7.9), fixtures captured from backend tests | Vitest: client error mapping for every status, hooks with mocked `fetch` | R1–R3 |
| **C12** **[frontend]** | Screens one at a time: (a) trip form + URL state, (b) results: recommendation + route cards + checkpoint table, (c) map: routes, checkpoints, popups, selection sync, (d) heatmap layer + slider + play + legend, (e) "How risk is scored" info panel | RTL per screen for every state in §7.4; manual on 3 trips; Performance trace while scrubbing (no long frames, no network) | R1–R12 |
| **C13** | Error / empty / loading / waking states end-to-end | Manual: backend stopped, invalid place, too-far departure, one-route corridor, cold start, 503 busy | R12, R16 |
| **C14** **[changed]** | Deploy: Render web service (root `backend/`, `uv sync --locked`, gunicorn), Vercel project (root `frontend/`, `vercel.json` rewrite to the Render URL), `NUM_PROXIES=2` | Open the Vercel URL after Render has slept; plan a trip; Lighthouse run | R13, R14 |
| **C15** | Docs: README (setup, architecture, decisions, limitations), Loom talking points | Fresh clone following README only | R15, R16 |

Backend first (C0–C7), so the 40 % logic is tested before any UI exists.

## 6. Risks and decisions

**Decisions (approved 2026-10-18)**
1. **Hosting:** Vercel (frontend) + Render (backend).
2. **Django:** 5.2 LTS.
3. **Styling:** Tailwind.
4. **E2E:** no Playwright; manual end-to-end checks per checkpoint.
5. **Attribution footer:** yes (Open-Meteo CC BY 4.0, © OpenStreetMap contributors).
6. **Single-corridor trips:** show fewer than 3 routes with an explanation; no relaxed second pass.
7. **Heatmap:** risk-only (no metric toggle).
8. **ETA time zone:** the browser's zone, with its abbreviation.

**Known risks**
9. **Proxy timeout vs cold start:** Vercel's CDN now waits up to **120 s** for an external origin
   ([changelog](https://vercel.com/changelog/cdn-origin-timeout-increased-to-two-minutes)) **[frontend]**,
   longer than a Render cold start (~1 min) and our worst plan (~40 s). The waking state stays.
10. **Dark basemap legibility [frontend]:** town and road labels are dimmer on `dark`; check in C12c,
    and fall back to Option E (light) if labels are too hard to read.
11. **MapLibre worker under Vite [frontend]:** documented (`?worker&url` import), untested; checked first in C12c.
12. **Pinned-behind versions:** TS 6 and Django 5.2 are deliberate (C1–C3); ESLint moves to 10 with the Vite frontend **[frontend]**; revisit
    when typescript-eslint / plugins / pytest-django declare support for the newer versions.
13. Public demo servers (OSRM, Photon) have no SLA; Photon's `osm_tag` is marked deprecated **[new]**.
14. Open-Meteo allows ~600 locations/min for all users together (measured in C7); free tier is non-commercial.
15. No truck profile (height/weight restrictions), no Hours-of-Service breaks; sustained wind, not gusts;
    forecast hour nearest each ETA.

## 7. Frontend plan (React + Vite) **[frontend]**

Sources are linked inline. **UNVERIFIED** marks things not confirmed in docs or by a test yet.

### 7.1 Screens, data and actions

The app is one working screen plus a 404 page. There is no auth, so there are no protected routes.

| Screen | Shows (API data) | Main actions |
|---|---|---|
| **Planner** `/` | Form; recommendation + reason; warnings; route cards A–C (distance, time, arrival, miles by level, worst level); map with risk-coloured segments + checkpoint markers; checkpoint popup/table (ETA, wind/rain/snow, levels, reasons); heatmap overlay with 0–48 h slider and legend | Search and pick origin/destination; set departure, load, interval; plan; select a route (card or map); inspect a checkpoint; scrub or play the heatmap; retry; share the URL |
| ~~About~~ (dropped 2026-10-18) | The risk table, load rules and ranking order live in a "How risk is scored" info panel on the planner | Open/close the panel |
| **Not found** `*` | Message | Link to planner |
| **Route error** (boundary) | Friendly message | Reload / go to planner |

Flow: open app → health check (waking banner if Render is asleep) → fill form → submit writes the
trip to the URL → plan query runs (skeletons) → results + map → heatmap query runs on its own (own
loading/error) → user selects routes, inspects checkpoints, scrubs hours.

What the plan already decided and keeps: same-origin `/api` proxy, waking state, browser time zone
for ETAs, risk-only heatmap, attribution footer, fewer than 3 routes is a warning, MapLibre used
directly with `setPaintProperty` for the slider.

### 7.2 Project setup

- **Scaffold:** `npm create vite@latest frontend -- --template react-ts`, as both
  [react.dev](https://react.dev/learn/build-a-react-app-from-scratch) and the
  [Vite guide](https://vite.dev/guide/) give it. Vite needs Node 20.19+/22.12+; React Router 8 needs
  **Node 22.22+** ([v8 upgrade](https://reactrouter.com/upgrading/v7)). We use Node 24 LTS locally and in CI.
- **Lint:** the template now ships **oxlint**, not ESLint (`create-vite@9.2.1` template). We replace
  it with ESLint as you asked, because `eslint-plugin-react-hooks` 7 carries the Rules of Hooks and the
  React Compiler checks ([docs](https://react.dev/reference/eslint-plugin-react-hooks)).
- **Alias `@/` → `src/`:** `tsconfig` `paths` plus Vite's native `resolve.tsconfigPaths: true`
  ([Vite shared options](https://vite.dev/config/shared-options)), so the alias is declared once.
- **Env:** only `VITE_*` reaches the browser, and Vite warns that it "should not contain sensitive
  information such as API keys" ([Vite env](https://vite.dev/guide/env-and-mode)). We have one:
  `VITE_API_BASE_URL` (default `/api`). Provider keys stay in Django. Typed in `src/vite-env.d.ts`.
- **API proxy:** dev uses `server.proxy['/api'] → DEV_BACKEND_URL` ([Vite server
  options](https://vite.dev/config/server-options)); production uses a `vercel.json` external rewrite
  `/api/:path*` → Render, plus the SPA fallback `/(.*)` → `/index.html`
  ([Vercel rewrites](https://vercel.com/docs/rewrites), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)).
  The `/api` rule comes first. Vercel caches external rewrites only if the origin sends cache
  headers, and Django sends none, so nothing is cached.

### 7.3 Design system

**Palette options** (chrome colours must stay clear of the risk scale's green/yellow/orange/red/magenta):

| Option | Look | Why | Verdict |
|---|---|---|---|
| A. Signal Blue | Light; primary `#1d4ed8` | Calm and neutral, but risk lines are tight on a light map (3.2–4.5:1) and the heatmap looks washed out | Superseded |
| B. Graphite | Light; primary `#18181b` | Very neutral; heavy black buttons | Rejected |
| **D. Spotter-style dark** | Navy `#0d1a2e` / `#1a2332`, turquoise `#40e0d0`→`#20b2aa`, DM Sans | Matches spotter.ai (styles read from their CSS/JS bundles on 2026-10-18); bright risk colours and the heatmap stand out on a dark map; less glare in a cab at night | **Chosen (2026-10-18)** |
| E. Light + Spotter teal | Navy header, white body, teal `#0f766e` | Safer for map labels; less on-brand | Fallback |

Spotter's own values that fail AA, and what we use instead:
- Turquoise text on white: 1.6:1, so turquoise is used only on navy.
- White on `#14b8a6`: 2.5:1, so buttons get dark text on turquoise (10.6:1).
- Muted `#718096` on `#1a2332`: 3.9:1 ❌, replaced by `#94a3b8` (6.2:1).

**Tokens (Option D, dark only)**, as CSS variables in `src/styles/tokens.css` mapped through Tailwind
`@theme inline` (the shadcn v4 pattern, [docs](https://ui.shadcn.com/docs/tailwind-v4)). Components use
only token classes (`bg-surface`, `text-muted-foreground`), never hex. Contrast was computed with the
WCAG formula; AA thresholds: text 4.5:1, large text and UI/graphics 3:1
([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).

| Token | Hex | Checked against | Ratio |
|---|---|---|---|
| `--background` (page) | `#0d1a2e` | — | — |
| `--surface` (cards, panels) | `#1a2332` | — | — |
| `--surface-raised` (popovers, menus) | `#223047` | — | — |
| `--foreground` | `#e2e8f0` | background / surface / raised | 14.1 / 12.8 / 10.8 ✅ |
| `--muted-foreground` | `#94a3b8` | background / surface / raised | 6.8 / 6.2 / 5.2 ✅ |
| `--border` (dividers, decorative) | `#2d3748` | — | n/a |
| `--input` (field borders) | `#64748b` | surface / background | 3.3 / 3.7 ✅ (≥ 3) |
| `--ring` (focus) | `#40e0d0` | surface / background | 9.6 / 10.6 ✅ |
| `--primary` (+ gradient to `#20b2aa`) | `#40e0d0` | `--primary-foreground` `#0d1a2e` | 10.6 (6.7 at the gradient end) ✅ |
| `--primary-hover` | `#5eead4` | dark text | 11.8 ✅ |
| `--primary` as link text | `#40e0d0` | surface | 9.6 ✅ |
| `--secondary` / `--secondary-foreground` | `#12343b` / `#99f6e4` | each other | 10.5 ✅ |
| `--success` (text on `#0f2e26`) | `#34d399` | tint | 7.6 ✅ |
| `--warning` (text on `#33270a`) | `#fbbf24` | tint | 8.8 ✅ |
| `--destructive` (text on `#3a1620`; inline errors `#f87171` on surface) | `#fca5a5` | tint / surface | 8.4 / 5.7 ✅ |
| `--info` (text on `#172a46`) | `#93c5fd` | tint | 8.0 ✅ |

**Risk scale** on the OpenFreeMap **dark** basemap (background `#0c0c0c`). Badges use dark text `#0d1a2e` on the risk colour:

| Level | Line / fill / badge | vs dark map (≥ 3) | vs surface | Badge text ratio |
|---|---|---|---|---|
| Low | `#22c55e` | 8.6 ✅ | 6.9 | 7.7 ✅ |
| Moderate | `#facc15` | 12.8 ✅ | 10.3 | 11.4 ✅ |
| High | `#fb923c` | 8.6 ✅ | 7.0 | 7.7 ✅ |
| Severe | `#ef4444` | 5.2 ✅ | 4.2 | 4.6 ✅ |
| No Travel | `#e879f9` | 8.0 ✅ | 6.4 | 7.1 ✅ |

The darker light-map set fails here (No Travel `#581c87`: 1.8:1), so it's not used.

- **Colour is never the only signal.** Badges, popups, the checkpoint table and the legend always show the level
  name. Route lines get a dark `#0d1a2e` casing so adjacent levels stay separable for colour-blind users.
- **Turquoise vs Low green:** they're close in hue, so turquoise is **never used on the map**. The selected
  route is shown by line width + a white halo, not by colour.
- **Theme:** **dark only** (one theme, same effort as light-only). No theme toggle: **overkill** here.
- **Panels over the map:** solid `rgba(13, 26, 46, 0.92)`, **no `backdrop-filter`**. Spotter uses
  `blur(20px)`, but blurring over a moving WebGL canvas costs GPU time on every frame (**UNVERIFIED**
  magnitude; avoided rather than measured).
- **Type:** **DM Sans** variable (OFL-1.1, Spotter's open fallback; their primary "Matter" is commercial),
  self-hosted with `@fontsource-variable/dm-sans`, latin subset only, `font-display: swap`, preloaded.
  Scale: 12 / 14 / 16 / 18 / 20 / 24 / 32 px; weights 400/500/600/700 (Spotter uses 600 for headings and buttons).
  `tabular-nums` for distances, times and ETAs.
- **Spacing:** Tailwind's 4 px scale. **Radius:** 8 px controls, 12 px cards, 20 px pills/badges
  (Spotter's values). Buttons: 600 weight, `py-3.5 px-7` for the primary call to action.
- **Shadows:** `0 8px 24px rgb(0 0 0 / 0.25)` cards; a turquoise glow `0 8px 32px rgb(64 224 208 / 0.15)`
  for the primary button hover only.
- **Motion:** 150–300 ms ease transitions (Spotter: 0.3 s); heatmap playback and transitions respect
  `prefers-reduced-motion`.

### 7.4 Layout and UX

- **Breakpoints:** Tailwind defaults, mobile-first (`sm` 640, `md` 768, `lg` 1024, `xl` 1280).
  - **< 1024 px:** one column: form → recommendation + route cards → map (60 svh) → heatmap
    controls → checkpoint table. After a plan, focus and scroll move to the results heading.
  - **≥ 1024 px:** a 400 px left panel (form collapses to a "Dallas → Houston · Edit" summary once
    results exist; results scroll) and a full-height map with floating heatmap controls and legend.
- **States per area:**

| Area | Loading | Empty | Error | Success / partial |
|---|---|---|---|---|
| App | "Waking the server…" banner; submit disabled | — | Health keeps retrying every 3 s | Banner hidden |
| Autocomplete | "Searching…" row | "No places found" | Inline error row | Options list |
| Plan | 3 route-card skeletons, map dims with a status line | Intro + "Try Dallas → Houston" example | Alert mapped from `ApiError` (below) + Retry | Results; warnings shown as info alerts |
| Heatmap | Skeleton bar on the slider | — | Inline alert in the controls; the plan stays usable | Layer + legend |
| Checkpoint table | Row skeletons | — | — | Table |

- **Error mapping** (from the Django error format `{message, extra}`):

| Status | Meaning | UI |
|---|---|---|
| 400 | `extra.fields` | Inline errors on the matching fields |
| 422 + `extra.latest_departure` | Beyond the forecast | Alert + "Use latest possible departure (…)" button |
| 422 | No road connection | Alert: try different places |
| 429 / 503 | Rate-limited (`extra.retry_after`) | Alert with a countdown; Retry enables when it ends |
| 502 | Provider failed | Alert + Retry |
| 0 | Network / timeout | "Can't reach the server" + Retry |

- **Forms:** controlled inputs + one `validateTrip()` with the same rules as the backend serializer
  (places picked from the list, not equal, load 1–80,000, departure −1 h … +12 days, interval 10/25/50).
  Errors show on submit, then live per field. `aria-invalid` + `aria-describedby`. The submit button
  shows a spinner and is disabled while loading or while the backend is waking.
- **Accessibility:**
  - Landmarks: `header`, `nav`, `main`, `aside`, `footer`; skip link to results.
  - Combobox follows the [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):
    `role=combobox`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, arrows/Enter/Escape.
  - Route cards are a radio group. The slider is Radix (keyboard + ARIA built in).
  - The map is supplementary: everything on it is also in the cards and the checkpoint table.
  - `aria-live="polite"` status for loading and results; visible `--ring` focus on every control.

### 7.5 Components and UI approach

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Tailwind + shadcn/ui** | Code is copied into the repo ("not a component library", [docs](https://ui.shadcn.com/docs)); Radix gives accessible slider, popover and dialog; `cva` variants; uses our CSS-variable tokens | Adds radix-ui, cva, clsx, tailwind-merge, lucide | **Pick**: only the components we use get added |
| Plain Tailwind | Zero deps | We'd hand-build an accessible slider, plus focus management | More risk, no gain |
| MUI / Mantine / Chakra | Fast to start | Heavier bundles, its own theming that fights Tailwind | **Overkill** |

Reusable `components/ui/` (built in C9, before any screen):
- **Controls:** `Button` (variants primary/secondary/ghost/destructive, sizes sm/md, `loading`),
  `Input`, `Label`, `FormField` (label + control + hint + error ids), `Select` (native `<select>`:
  accessible and mobile-friendly), `Combobox` (APG listbox pattern, async-friendly; not shadcn's
  cmdk one, which is built for client-side filtering).
- **Display:** `Card`, `Badge` (variant per risk level), `Alert` (info/success/warning/error, optional action).
- **Feedback:** `Skeleton`, `Spinner`, `Slider` (shadcn/Radix).

Feature components only render props and call hooks; UI components never call the API.

### 7.6 Routing (React Router 8, data mode)

- **Data mode** (`createBrowserRouter` + `RouterProvider`): it gives route `ErrorBoundary` and `lazy`,
  which declarative mode lacks, without framework mode's file conventions
  ([modes](https://reactrouter.com/start/modes)). In v8, `RouterProvider` is imported from
  `react-router/dom` and `react-router-dom` is gone ([v8 upgrade](https://reactrouter.com/upgrading/v7)).
- **Lazy loading:** route-level `lazy` for `*` ([route object](https://reactrouter.com/start/data/route-object)).
  It loads before render, so there's no Suspense flash, and it is the data-router equivalent of
  `React.lazy`. **`React.lazy` + `Suspense`** is used for the heavy `MapView` (MapLibre) inside the
  planner, so the form paints before the map chunk arrives. The planner itself is eager (it's the LCP route).
- **Errors:** `ErrorBoundary` on the root (full page) and on a pathless layout child, so the header
  and footer survive a page error; read with `useRouteError` / `isRouteErrorResponse`
  ([error boundaries](https://reactrouter.com/how-to/error-boundary)).
- **Navigation:** `<Link>` only (one page, so the header has no nav menu and no `<NavLink>`).
  `useNavigate` is not needed: submit updates search params through `useSearchParams`.
- **Route config** (C10): `createRoutes(pages)` builds root layout → pathless error boundary → pages,
  so tests can mount the real tree with an extra page.

| Path | Page | Layout | Loaded |
|---|---|---|---|
| `/` (index) | `PlannerPage` | `AppLayout` | eager; `MapView` via `React.lazy` |
| `*` | `NotFoundPage` | `AppLayout` | `lazy` |
| (error) | `RouteErrorPage` | root + layout child | eager |

**Search params** (parsed and validated in `utils/trip-params.ts`; invalid or missing → no trip, form defaults):

| Param | Example | Meaning |
|---|---|---|
| `from`, `to` | `32.7763,-96.7969` | lat,lon |
| `fromName`, `toName` | `Dallas, Texas` | labels for the inputs |
| `depart` | `2026-10-20T14:00:00.000Z` | ISO UTC |
| `load`, `every` | `35000`, `10` | lb, interval mi |
| `route` | `B` | selected route (default: recommended) |
| `hour` | `6` | heatmap hour 0–48; written on slider release, not while dragging |

Refreshing re-runs the plan (Django caches routes 1 h and weather 15 min, so it's fast and cheap).

### 7.7 Folder tree

```text
frontend/
├── index.html  vite.config.ts  vercel.json  eslint.config.js  .prettierrc.json  .env.example
├── tsconfig.json  tsconfig.app.json  tsconfig.node.json  components.json (shadcn)
└── src/
    ├── main.tsx                      QueryClientProvider + RouterProvider
    ├── vite-env.d.ts                 typed import.meta.env
    ├── styles/                       index.css (Tailwind + @theme), tokens.css
    ├── routes/router.tsx             route objects (§7.6)
    ├── pages/                        PlannerPage, NotFoundPage, RouteErrorPage
    ├── components/
    │   ├── ui/                       §7.5 list
    │   ├── layout/                   AppLayout, AppHeader, AppFooter, BackendStatusBanner
    │   └── features/
    │       ├── trip-form/            TripForm, PlaceCombobox, TripSummary
    │       ├── results/              Recommendation, RouteCardList, RouteCard, RiskStrip, CheckpointTable, PlanWarnings, PlanError, RiskInfoPanel
    │       ├── map/                  MapView, route-layers.ts, checkpoint-layer.ts, CheckpointPopup
    │       └── heatmap/              HeatmapControls, HeatmapLegend, heatmap-layer.ts
    ├── hooks/                        §7.9
    ├── api/                          client.ts, endpoints.ts, query-keys.ts, query-client.ts
    ├── types/api.ts                  mirrors Django output serializers
    ├── constants/                    risk.ts (levels, labels, token names), limits.ts
    ├── utils/                        format.ts, trip-params.ts, validate-trip.ts, cn.ts
    └── test/                         setup.ts, fixtures/ (captured from backend tests), render.tsx
```

### 7.8 Data and API

- **Client:** native `fetch` in `api/client.ts`: JSON, a 60 s timeout through `AbortSignal.timeout` +
  `AbortSignal.any`, and one `ApiError` (`status`, `message`, `fields`, `retryAfter`, `latestDeparture`).
  **axios is overkill** (no interceptors needed). There's no auth, so no token header and no 401 handling.
- **Server state: TanStack Query 5.** react.dev recommends a data library over fetching in effects
  ([react.dev](https://react.dev/learn/build-a-react-app-from-scratch)). It gives caching and dedupe
  ([overview](https://tanstack.com/query/latest/docs/framework/react/overview)) and passes an
  `AbortSignal` to `queryFn` ([cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)).
  With trip state in the URL, the plan is a query keyed by params: back/forward is instant and the
  heatmap is a dependent query.
  - Defaults: `refetchOnWindowFocus: false` and no automatic refetches, because every plan spends
    the shared Open-Meteo budget (~600 locations/min). `retry` only for status 0, once; Django already
    retries providers.
  - `staleTime`: plan and heatmap 15 min (the weather cache), places 24 h, health ∞ once OK.
- **Global state:** none. URL params hold the trip; component state holds UI-only things (popup open,
  playing). **Context/Zustand are not needed.**

### 7.9 Custom hooks

| Hook | Purpose | Input → returns | Used by |
|---|---|---|---|
| `useBackendHealth` | Wake Render and gate the form | `() → { status: 'checking' \| 'waking' \| 'ready' }` (query retries every 3 s) | `AppLayout`, `TripForm` |
| `useDebouncedValue` | Debounce typing | `(value, ms) → value` | `PlaceCombobox` |
| `usePlaceSearch` | Autocomplete | `(query) → { places, isFetching, error }`; enabled at ≥ 3 chars | `PlaceCombobox` |
| `useTripParams` | Typed URL state | `() → { trip \| null, routeId, hour, setTrip, setRouteId, setHour }` | `PlannerPage` |
| `useTripPlan` | Plan query | `(trip \| null) → { plan, status, error, refetch }` | `PlannerPage` |
| `useHeatmap` | Heatmap query, after the plan | `(plan \| undefined, loadLb) → { heatmap, status, error }` | `PlannerPage` |
| `useHeatmapPlayback` | Play/pause through hours | `(hours, onHour) → { playing, toggle }`; respects reduced motion | `HeatmapControls` |
| `useRetryCountdown` | 429/503 countdown | `(seconds \| undefined) → secondsLeft` | `PlanError` |

Built in C11: the first six (`useTripPlan` and `useHeatmap` share `use-trip-plan.ts`). `useHeatmapPlayback`
and `useRetryCountdown` arrive with their components in C12. Dropped: `useLocalStorage` (the URL covers
persistence) and `useAuth` (no auth). The MapLibre instance
lives in `MapView` refs, not a hook (one user). The ESLint `react-hooks` plugin enforces the Rules of Hooks.

### 7.10 Rendering and performance

- **Map stays out of React's render path:** one MapLibre instance per page, created once; data goes
  in through `setData`, and the slider changes `setPaintProperty` on the heatmap layer (one
  property per hour, `h0`…`h48`). Dragging the slider re-renders only `HeatmapControls`.
- **State placement:** selected route, hover and popup state live in `PlannerPage` / `MapView`, not
  above the router. `memo` is added only where a Profiler trace shows a cost (candidate: `RouteCard` list).
- **Keys:** `route.id`, `checkpoint.mile`, `cell lon,lat`; never array indexes.
- **Splitting:** the map chunk (MapLibre, the largest dependency) and the 404 page are lazy. The map
  chunk is prefetched after the health check succeeds, so it's ready by the time a plan returns.
- **Assets:** no images besides SVG icons (lucide, tree-shaken); one self-hosted variable font
  (DM Sans, latin subset, preloaded, `font-display: swap`).
- **Budgets (UNVERIFIED until C8 measures them):** initial JS ≤ 150 KB gzip without the map chunk;
  Lighthouse (desktop) Performance ≥ 90, Accessibility 100, Best Practices ≥ 95.
- **Lint:** ESLint 10 flat config: `@eslint/js`, `typescript-eslint` (type-aware), `react-hooks`
  (`recommended`), `react-refresh`, `@tanstack/eslint-plugin-query`, `eslint-config-prettier`.

### 7.11 Packages (npm, checked 2026-10-18)

Policy: the newest release that is **at least 14 days old**, so supply-chain or regression problems in
brand-new releases have time to show (e.g. React 19.3.1 is 4 days old → 19.3.0).

| Package | Version | Why |
|---|---|---|
| react, react-dom | 19.3.0 | UI (React Router 8 needs ≥ 19.2.7) |
| @fontsource-variable/dm-sans | 5.3.0 | Self-hosted DM Sans (OFL-1.1) |
| react-router | 8.4.0 | Routing, data mode |
| @tanstack/react-query | 5.104.1 | Server state |
| maplibre-gl | 6.12.0 | Map (Vite worker: `?worker&url`, [docs](https://maplibre.org/maplibre-gl-js/docs/)) |
| tailwindcss, @tailwindcss/vite | 4.3.3 | Styling ([Vite install](https://tailwindcss.com/docs/installation/using-vite)) |
| radix-ui · class-variance-authority · clsx · tailwind-merge · lucide-react | 1.6.7 · 0.7.1 · 2.1.1 · 3.7.0 · 1.51.0 | shadcn/ui runtime deps. **UNVERIFIED** that shadcn 4.21 components accept radix-ui 1.6.7; if not, use the version the CLI installs |
| shadcn (CLI, `npx` only) | 4.21.1 | Copies components in; not a dependency |
| vite · @vitejs/plugin-react | 8.3.2 · 6.1.1 | Build |
| typescript | 6.0.3 | typescript-eslint supports `<6.1` |
| eslint · @eslint/js · typescript-eslint | 10.12.0 · 10.0.1 · 8.71.0 | Lint |
| eslint-plugin-react-hooks · eslint-plugin-react-refresh · @tanstack/eslint-plugin-query · globals | 7.1.1 · 0.5.7 · 5.104.1 · 17.13.0 | Lint rules |
| prettier · prettier-plugin-tailwindcss · eslint-config-prettier | 3.9.9 · 0.8.1 · 10.1.8 | Format |
| vitest · jsdom · @testing-library/react · /dom · /jest-dom · /user-event | 5.0.3 · 30.1.1 · 16.3.3 · 10.4.2 · 7.0.1 · 14.6.7 | Tests |
| @types/node · @types/react · @types/react-dom | 24.19.1 · 19.3.0 · 19.3.0 | Types (Node 24 LTS) |

**Not adding (overkill here):** axios, Zustand/Redux, react-hook-form + zod (5 fields), MSW
(a `fetch` spy covers our tests), Storybook, framer-motion, i18n, PWA, dark mode, Playwright, TanStack Router.

### 7.12 Decisions (approved 2026-10-18)

1. Next.js draft discarded; frontend is React + Vite.
2. Palette **D** (Spotter-style dark).
3. No About page; the risk rules go in a "How risk is scored" panel on the planner.
4. Version policy: newest release at least 14 days old.
5. Lazy loading: route `lazy` for pages, `React.lazy` for the map.

## Requirement IDs

| ID | Requirement |
|---|---|
| R1 | Origin & destination input |
| R2 | Departure date/time input |
| R3 | Load weight input |
| R4 | 3 route options from a routing API |
| R5 | Sample weather every 10 / 25 / 50 mi |
| R6 | Use the truck's ETA at each checkpoint |
| R7 | Risk via threshold table |
| R8 | Load rules |
| R9 | Recommendation: severe miles → high miles → avg risk → time |
| R10 | Map with routes, checkpoints, risk, ETAs, summaries |
| R11 | Corridor weather heatmap with 0–48 h slider |
| R12 | Smooth, performant UI |
| R13 | GitHub repository |
| R14 | Hosted application |
| R15 | 5–10 min Loom walkthrough |
| R16 | Documentation |
