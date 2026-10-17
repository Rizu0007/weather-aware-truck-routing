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
| Frontend | **Next.js 16.4.2, React 19.3.1, TypeScript 6.0.3** | Requested stack; TS 6 for typescript-eslint compatibility (C1) |
| Map | **maplibre-gl 6.14.0**, used directly | WebGL; imperative `setPaintProperty` keeps the slider smooth (40 % of grade) |
| Basemap | OpenFreeMap vector tiles | Keyless — **probe at C9** |
| Styling | Tailwind CSS 4.3.3 (create-next-app default) | Pending your answer (RESEARCH Q3) |
| Tests | pytest 9.1.1 + pytest-django 4.14.0 + responses 0.26.3; Vitest 5.0.5 + React Testing Library 16.3.3 + jsdom 30.1.3 | §6 of RESEARCH |
| Quality | Ruff 0.17.1; ESLint 9.39.5 + eslint-config-next 16.4.2 + Prettier 3.9.10; pre-commit 4.7.0; GitHub Actions | §7 of RESEARCH |
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
└── frontend/
    ├── package.json  next.config.ts  eslint.config.mjs  .prettierrc.json  vitest.config.mts  .env.example
    └── src/
        ├── app/                        layout.tsx, page.tsx, error.tsx, globals.css
        ├── components/                 trip-planner/, routes/, map/, heatmap/
        ├── hooks/                      use-trip-plan.ts, use-heatmap.ts, use-place-search.ts, use-backend-health.ts
        ├── lib/                        api/client.ts, api/endpoints.ts, risk.ts, format.ts
        ├── types/api.ts
        └── test/fixtures/              our own API responses captured from backend tests
```

## 3. Data flow **[changed]**

```text
 Browser                Next.js (Vercel)          Django (Render)                        Third-party
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
   {departure, load_lb, points}                     services.heatmap.build_heatmap (grid ≤ ~200 cells)
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
- Retries: network errors, 429 and 5xx, up to 3× with backoff. Errors are mapped by status code,
  never by parsing provider bodies.
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
- Frontend: `BACKEND_URL` only, server-side. **No `NEXT_PUBLIC_*` variables.**
- Both sides ship `.env.example`; `.env*` is git-ignored.

## 5. Build order (checkpoints) **[changed]**

Each checkpoint ends with: run it, confirm it works, commit, report to you.

| # | Checkpoint | How it's tested on its own | Covers |
|---|---|---|---|
| **C0** **[new]** | Tooling: `backend/pyproject.toml` (uv), Ruff config, pytest config; `.pre-commit-config.yaml`; CI workflow with the backend job | `uv run ruff check`, `uv run pytest` (0 tests) green locally; `pre-commit run --all-files` | R13, R16 |
| **C1** | Django skeleton: env settings, DRF, exception handler, `GET /api/health` | pytest API test + `curl /api/health` | — |
| **C2** | `domain/risk.py` | Parametrised tests for every band edge and each load rule (30,000 vs 30,001 lb, etc.) | R7, R8 |
| **C3** | `domain/geo.py` + `domain/checkpoints.py` | Tests on the Dallas–Houston sample: counts at 10/25/50 mi, coverage sums to length, ETA at destination = route duration | R5, R6 |
| **C4** | `integrations/http.py` + `open_meteo.py` | `responses` tests: object vs list, `hourly_units` conversion, null handling, 400/414/timeout, retry, cache hit | R6 |
| **C5** | `integrations/osrm.py`, `photon.py` + alternative-route logic + `GET /api/places` | `responses` tests with samples: duplicate/detour rejected, < 3 routes path; manual Dallas–Houston + Seattle–Portland | R1, R4 |
| **C6** | `domain/ranking.py` + `services/trip_planning.py` + `POST /api/trip-plans` | Ranking tests (no-travel → severe → high → avg → time, ties, explanation); API test with providers mocked; one real call | R2, R3, R9 |
| **C7** | `services/heatmap.py` + `POST /api/heatmaps` | Grid bounded for a 1,000 mi route; levels match `risk.py`; real call timing | R11 |
| **C8** **[changed]** | Next.js scaffold (`create-next-app` with the RESEARCH §3.1 flags), pin TS 6.0.3 / ESLint 9.39.5, Prettier, Vitest; rewrites to Django; typed API client; health hook; TripForm + autocomplete; CI frontend job | Vitest for `format.ts` and `client.ts`; manual: form submits through the rewrite and shows the raw result | R1–R3 |
| **C9** | Map: probe OpenFreeMap; MapLibre v6 worker under Turbopack; routes (risk-coloured segments), checkpoints + popups, route cards + recommendation, selection sync, attribution footer | Manual on 3 trips; component tests for route card; `next build` succeeds | R10 |
| **C10** | Heatmap layer + 0–48 h slider + play + legend | Scrub on Chicago–Denver with DevTools Performance (no long frames); no network while scrubbing | R11, R12 |
| **C11** | Error / empty / loading / waking states end-to-end | Manual: backend stopped, invalid place, too-far departure, one-route corridor, cold start | R12, R16 |
| **C12** **[changed]** | Deploy: Render web service (root `backend/`, `uv sync --locked`, gunicorn, `UV_VERSION`), Vercel project (root `frontend/`, `BACKEND_URL`) | Open the Vercel URL after Render has slept; plan a trip | R13, R14 |
| **C13** | Docs: README (setup, architecture, decisions, limitations), Loom talking points | Fresh clone following README only | R15, R16 |

Backend first (C0–C7), so the 40 % logic is tested before any UI exists.

## 6. Risks and open questions

**Need your decision** (details in RESEARCH.md §11)
1. **Hosting [changed]:** Vercel + Render (two free accounts, recommended) or Render for both?
2. **Django version [new]:** 5.2 LTS (recommended) or 6.1?
3. **Styling [new]:** Tailwind (recommended) or CSS Modules?
4. **E2E [new]:** one local Playwright smoke test, or skip?
5. **Attribution footer [new]:** OK?
6. Single-corridor trips: show fewer routes with an explanation (recommended) or add a relaxed second pass?
7. Heatmap metric toggle (Risk / Wind / Rain / Snow): include or keep risk-only?
8. ETA time zone: browser's zone OK?

**Known risks**
9. **Proxy timeout vs cold start [new]:** Vercel's rewrite timeout is undocumented; a ~1 min Render
   wake-up may fail the first proxied request. Mitigated by the health-check waking state.
10. **MapLibre v6 worker under Turbopack [new]:** documented, untested; checked first in C9.
11. **Pinned-behind versions [new]:** TS 6, ESLint 9, Django 5.2 are deliberate (C1–C3); revisit
    when typescript-eslint / plugins / pytest-django declare support for the newer versions.
12. Public demo servers (OSRM, Photon) have no SLA; Photon's `osm_tag` is marked deprecated **[new]**.
13. Open-Meteo rate limit and multi-location counting are unverified; free tier is non-commercial **[new]**.
14. No truck profile (height/weight restrictions), no Hours-of-Service breaks; sustained wind, not gusts;
    forecast hour nearest each ETA.

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
