# Build Plan

Inputs: [ASSESSMENT.md](ASSESSMENT.md) (brief + agreed interpretations) and [API_NOTES.md](API_NOTES.md)
(observed API behaviour). Requirement IDs (R1–R16) are listed at the bottom.

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Django 5.2 + Django REST Framework** | Required by the brief; DRF serializers give clean input validation and error bodies |
| HTTP client | `requests` | Simple, synchronous; concurrency via a small thread pool where batching needs it |
| Cache | Django **LocMemCache** | No infra; enough for weather/geocode/route reuse within a process |
| Database | **none** | The app is stateless: nothing to persist |
| Frontend | **React 18 + TypeScript + Vite** | Required React; TS catches API-shape bugs; Vite is fast and minimal |
| Map | **MapLibre GL JS** | WebGL rendering keeps the heatmap and many route/checkpoint features smooth (40 % of the grade). Largest dependency (~220 KB gzipped) — justified by GPU rendering; Leaflet's DOM/canvas layers stutter when restyling hundreds of cells per slider tick |
| Basemap | OpenFreeMap vector tiles | Keyless. **Not probed yet** — verified at the start of C9 |
| Styling | Plain CSS (variables) | No UI kit needed for a handful of components |
| Tests | Django test runner (`unittest`) + `unittest.mock`; **Vitest** for a few frontend pure functions | Standard, no extra frameworks; mocks use the saved API samples |
| Serving | Django + **WhiteNoise** serves the built React app; **gunicorn** | One deployable, one URL, no CORS in production |
| Hosting | Docker image on Render (or similar) | Single container; free tier works. Needs your account — see open questions |

No heavy installs beyond these. The draft code moved to scratchpad in Phase 0 is **not** reused wholesale;
pieces (risk rules, geometry helpers) will be rewritten checkpoint by checkpoint against API_NOTES.md.

## 2. Folder structure

```text
my-app/
├── ASSESSMENT.md  API_NOTES.md  PLAN.md  README.md
├── Dockerfile  render.yaml  .env.example
├── scripts/                     probe + tuning scripts, samples/ (Phase 1)
├── backend/
│   ├── manage.py  requirements.txt
│   ├── config/                  settings.py, urls.py, wsgi.py
│   └── trips/
│       ├── api/                 serializers.py, views.py, urls.py   (HTTP only, no business logic)
│       ├── services/
│       │   ├── geo.py           haversine, cumulative miles, interpolation, slicing, simplification
│       │   ├── risk.py          threshold table + load rules (pure functions)
│       │   ├── checkpoints.py   sampling every N miles + ETA per checkpoint
│       │   ├── routing.py       OSRM client + town-snapped via-point alternatives
│       │   ├── geocoding.py     Photon search + reverse (town lookup)
│       │   ├── weather.py       Open-Meteo client: batching, normalisation, retry, cache
│       │   ├── recommend.py     route summaries, ranking, explanation
│       │   ├── heatmap.py       corridor grid + 0–48 h risk per cell
│       │   └── planner.py       orchestrates a plan (routes → checkpoints → weather → risk → ranking)
│       └── tests/
│           ├── fixtures/        trimmed copies of scripts/samples used as mocks
│           └── test_*.py
└── frontend/
    ├── index.html  package.json  vite.config.ts
    └── src/
        ├── api/                 client.ts (fetch + error mapping), types.ts (response types)
        ├── components/          TripForm, PlaceInput, RouteList, RouteCard, MapView,
        │                        CheckpointPopup, HeatmapControls, Legend, StatusBanner
        ├── map/                 layers.ts (route/checkpoint layers), heatmap.ts (grid layer + paint)
        ├── lib/                 risk.ts (labels/colours), format.ts (miles, durations, times)
        ├── App.tsx  main.tsx  styles.css
```

## 3. Data flow

```text
 Browser (React)                       Django                                  Third-party
 ───────────────                       ──────                                  ───────────
 PlaceInput ──GET /api/geocode?q=──▶ geocoding.search ──────────────────────▶ Photon /api (bbox N. America)
            ◀── [{label, lat, lon}] ◀─ normalise optional fields, cache 24 h

 TripForm ──POST /api/plan─────────▶ serializer validates input
   {origin, destination,               planner.plan_trip
    departure (UTC ISO), load_lb,        1. routing.get_routes ──────────────▶ OSRM alternatives=3
    interval_mi: 10|25|50}                  if < 3: offset via-points ──────▶ Photon /reverse (town)
                                                     route through town ────▶ OSRM alternatives=false
                                            drop dup (>0.8 overlap) / detour (>1.5×)
                                         2. checkpoints.build: every N mi, ETA = departure
                                            + cumulative (capped) segment time
                                         3. weather.fetch_hourly(all checkpoints) ─▶ Open-Meteo
                                            batches ≤200, 4 parallel, snapped coords, cached
                                         4. risk.assess(value at hour nearest ETA, load)
                                         5. recommend.rank + explain
                                         6. simplify geometry, split into risk segments
            ◀── routes[], checkpoints[], summaries, recommendation, warnings

 MapView draws routes + checkpoints; RouteList shows summaries and the recommendation.

 (in parallel, after the plan arrives)
 HeatmapControls ──POST /api/heatmap─▶ heatmap.build_grid(checkpoint coords)
   {departure, load_lb,                  cell size scaled so grid ≤ ~200 cells
    points: checkpoint coords}           weather.fetch_hourly(cells, 49 h) ──▶ Open-Meteo
            ◀── {start, cell_deg, cells:[{lon, lat, risk[49], wind[49], rain[49], snow[49]}]}

 Slider (0–48 h) changes only a MapLibre paint expression → no refetch, no React re-render of the map.
```

### API contract (draft)

`POST /api/plan` → `200`

```text
{
  departure: ISO string, load_lb: number, interval_mi: number,
  recommended_route_id: "A",
  recommendation: { reason: "Fewest Severe miles (0 vs 20 on B)", ranking: ["A","C","B"] },
  warnings: ["Only 2 distinct routes found for this corridor"],
  routes: [{
    id: "A", label: "Fastest", via_town: null | "Franklin",
    distance_mi, duration_s, arrival: ISO,
    summary: { miles_by_level: {low, moderate, high, severe, no_travel}, avg_risk: number, max_level },
    geometry: [[lon, lat], …],                                  simplified
    segments: [{ level: 0-4, coordinates: [[lon, lat], …] }],   coloured line pieces
    checkpoints: [{ mile, lon, lat, eta, covers: [start_mi, end_mi],
                    wind_mph, rain_in_hr, snow_in_hr,
                    level, wind_level, rain_level, snow_level, reasons: [string] }]
  }]
}
```

`GET /api/geocode?q=dal` → `[{ label: "Dallas, Texas, US", lat, lon }]`

## 4. Errors, loading, caching, missing keys

### Errors
- **Input validation** (DRF serializer) → `400 { errors: { field: [msg] } }`, shown next to the field.
  Checks: both places present, distinct (≥ 1 mi apart), load 1–80,000 lb, interval ∈ {10, 25, 50},
  departure not more than 1 h in the past.
- **Forecast horizon** → after routing, if `departure + longest trip` or `departure + 48 h` passes the
  ~15-day horizon → `422` with a message telling the user the latest allowed departure.
- **No route** (OSRM `NoRoute` / `InvalidValue`) → `422 "No drivable route between these places"`.
- **Provider failures** (timeouts, 5xx, 414, 429, unexpected shapes) → `502 { error, provider }`,
  plain-English message ("Weather service is unavailable, try again shortly"). We map by **status code**,
  never by parsing provider error bodies (they are inconsistent, see API_NOTES).
- **Retries:** network errors, 429 and 5xx retried up to 3× with backoff (a TLS timeout was observed once).
- **Weather is all-or-nothing for a plan:** a route without weather can't be risk-scored, so a partial
  failure fails the plan rather than showing misleading "Low" risk.
- **Heatmap failure does not fail the plan:** routes stay visible; the heatmap panel shows a retry button.
- **Fewer than 3 routes:** not an error. Shown as a warning banner explaining the corridor has no
  distinct reasonable alternative.

### Loading states
- Plan request takes ~4–12 s (API_NOTES). The form disables, the button shows a spinner, and a status
  line explains what's happening ("Finding routes and forecasts — this takes a few seconds").
- Heatmap loads after the routes are drawn, with its own spinner on the slider panel.
- Geocode autocomplete: 300 ms debounce, min 3 characters, stale responses discarded.

### Caching (server, LocMemCache)
| What | Key | TTL |
|---|---|---|
| Weather series | snapped coord (0.05°) + window start hour + length | 15 min |
| Geocode search | normalised query | 24 h |
| Town lookup | rounded via-point (0.05°) | 24 h |
| Route set | rounded origin/destination (4 dp) | 1 h |

The browser keeps the current plan in memory only; no local storage.

### Missing keys
All providers are keyless, so nothing is required. `OPEN_METEO_API_KEY` is optional: when set, the
client switches to the paid host. Startup logs which hosts are in use. Provider URLs are configurable
in `.env` (see `.env.example`), e.g. to point at a self-hosted OSRM.

## 5. Build order (checkpoints)

Each checkpoint ends with: run it, confirm it works, commit, report to you.

| # | Checkpoint | How it's tested on its own | Covers |
|---|---|---|---|
| **C1** | Backend skeleton: Django + DRF, settings from env, `GET /api/health` | `curl /api/health` → `{"status":"ok"}` | — |
| **C2** | `risk.py`: threshold table + load rules | Unit tests for every band edge (24.9/25/34.9/35…, 0.10/0.25/0.50/1.00/1.01, snow edges) and each load rule incl. 30,000 vs 30,001 lb | R7, R8 |
| **C3** | `geo.py` + `checkpoints.py`: sampling every N mi, coverage, ETA with speed cap | Unit tests on the saved Dallas–Houston OSRM sample: counts at 10/25/50 mi, coverage sums to route length, ETA at destination equals route duration | R5, R6 |
| **C4** | `weather.py`: batching (≤200), object-vs-array normalisation, null handling, retry, cache | Unit tests with fixtures: single + multi responses, 400/414/timeout mocks, cache hit avoids HTTP | R6 |
| **C5** | `geocoding.py` + `routing.py`: Photon search/reverse, OSRM + town-snapped alternatives + filters; `GET /api/geocode` | Unit tests with fixtures (dup and detour rejected, < 3 routes path); manual run on Dallas–Houston and Seattle–Portland | R1, R4 |
| **C6** | `recommend.py` + `planner.py` + `POST /api/plan` | Unit tests: lexicographic ranking (no-travel → severe → high → avg → time), ties, explanation text; API test with all providers mocked; one real `curl` | R2, R3, R9 |
| **C7** | `heatmap.py` + `POST /api/heatmap`: adaptive grid ≤ ~200 cells, 49 hourly risk levels | Unit tests: cell count bounded for a 1,000 mi route, levels match `risk.py`; real `curl` timing | R11 |
| **C8** | Frontend scaffold, typed API client, TripForm with autocomplete, datetime, load, interval | Vitest for formatters; manual: form submits and shows raw result | R1–R3 |
| **C9** | Map: probe basemap tiles, draw routes (risk-coloured segments), checkpoints with popups, route cards + recommendation, selection sync | Manual on 3 trips; check every checkpoint popup shows ETA + values + reason | R10 |
| **C10** | Heatmap layer + 0–48 h slider + play button + legend | Manual: scrub the slider on Chicago–Denver, confirm no dropped frames in DevTools Performance; no network calls while scrubbing | R11, R12 |
| **C11** | Error / empty / loading states end-to-end | Manual: offline, invalid place, too-far departure, one-route corridor | R12, R16 |
| **C12** | Dockerfile + render config; production build served by Django | `docker build && docker run`, open localhost; then deploy on your account | R13, R14 |
| **C13** | Docs: README (setup, architecture, decisions, limitations), Loom talking points | Fresh-clone setup following README only | R15, R16 |

Backend first (C1–C7) so the logic that carries 40 % of the grade is tested before any UI exists.

## 6. Risks and open questions

**Need your decision**
1. **Hosting account.** I can't create accounts or deploy for you. Render free tier sleeps after
   inactivity (30–60 s cold start on the reviewer's first visit). Is Render OK, or do you prefer another
   host (Railway, Fly.io, a VPS)?
2. **Single-corridor trips** (e.g. Seattle–Portland). Options:
   (a) show fewer than 3 routes with an explanation — *recommended, most honest*;
   (b) add a relaxed second pass (overlap ≤ 0.9) that may yield a near-duplicate third route.
3. **Heatmap metric toggle** (Risk / Wind / Rain / Snow). Cheap since the data is already fetched, but
   it's an extra. Include it in C10, or keep the heatmap risk-only?
4. **ETA display time zone.** Plan: show in the browser's time zone with its abbreviation. Alternative is
   each checkpoint's local zone, which needs another data source. OK with browser zone?

**Known risks**
5. **Public demo servers** (OSRM, Photon) have no SLA and may be slow or down while the reviewer tests.
   Mitigation: clear 502 message, caching, configurable URLs for a self-hosted fallback (documented).
6. **Open-Meteo rate limit** with several reviewers at once: mitigated by caching and the bounded grid.
   We never observed a 429, so the actual counting rule is unverified.
7. **Truck realism:** no truck profile (height/weight restrictions ignored), no Hours-of-Service rest
   breaks. Documented as a limitation; ETAs are driving time only.
8. **Sustained wind vs gusts:** using sustained `wind_speed_10m` as agreed; gusts would be stricter.
9. **Basemap tiles** (OpenFreeMap) not yet verified; if they fail I'll stop and propose an alternative.
10. **Hourly granularity:** weather is taken at the forecast hour nearest each ETA (up to 30 min off).

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
