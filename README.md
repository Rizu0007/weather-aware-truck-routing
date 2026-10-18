# Weather-Aware Truck Routing

React (Vite) + Django app that helps a truck driver pick the safest route based on forecast weather,
load weight and travel time. See [ASSESSMENT.md](ASSESSMENT.md) for the brief and the agreed
interpretations of ambiguous rules.

> Status: planning. API findings are in [API_NOTES.md](API_NOTES.md), stack research in [RESEARCH.md](RESEARCH.md), the build plan in [PLAN.md](PLAN.md). Building checkpoint by checkpoint (see PLAN.md §5).

## Setup

Requirements: Python 3.12, [uv](https://docs.astral.sh/uv/), Node.js 24 (22.22+ works).

### Backend

```bash
cd backend
cp .env.example .env    # local settings; DJANGO_SECRET_KEY is required
uv sync                 # creates .venv and installs locked dependencies
uv run python manage.py runserver   # API on http://127.0.0.1:8000/api/health
uv run ruff check       # lint
uv run ruff format      # format
uv run pytest           # tests
```

Tests mock every external API with [`responses`](https://github.com/getsentry/responses), built
from the saved samples in `backend/tests/fixtures/`, so they run offline.

### Frontend

```bash
cd frontend
cp .env.example .env.local   # optional: DEV_BACKEND_URL if Django isn't on 127.0.0.1:8000
npm ci
npm run dev                  # http://localhost:5173, /api proxied to Django
npm run lint                 # ESLint
npm run format:check         # Prettier
npm run typecheck            # tsc
npm test                     # Vitest (includes a WCAG contrast check of the design tokens)
npm run build                # production build into dist/
```

Frontend tests use real API responses captured from the backend (providers mocked, fixed clock) in
`frontend/src/test/fixtures/`; a test fails if they stop matching `src/types/api.ts`. Regenerate them
after changing a serializer: `cd backend && uv run python -m tests.capture_frontend_fixtures`.

The browser only ever calls `/api/...` on its own origin: Vite proxies it in development, nginx in
Docker and a `vercel.json` rewrite in production, so Django needs no CORS and no API URL or key is
bundled.

### Docker

```bash
docker compose --profile test run --rm backend-tests    # backend lint + tests
docker compose --profile test run --rm frontend-tests   # frontend lint + types + tests
docker compose up -d --build                            # app on http://localhost:8080, API on :8000
```

### Git hooks

```bash
backend/.venv/bin/pre-commit install   # runs Ruff on staged backend files before each commit
```

CI (`.github/workflows/ci.yml`) runs the same lint, format and test steps on every push and PR.

## Backend API

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `{"status": "ok"}` |
| `GET /api/places?q=Hous` | Up to 5 North American places: `[{label, lat, lon}]` |
| `POST /api/trip-plans` | Up to 3 routes with checkpoints, weather at each ETA, risk summaries and the recommended route |
| `POST /api/heatmaps` | Risk per grid cell along the routes, hourly for 0–48 h after departure (≤ 120 cells) |

```bash
curl -X POST localhost:8000/api/trip-plans -H 'Content-Type: application/json' -d '{
  "origin": {"lat": 32.7767, "lon": -96.797}, "destination": {"lat": 29.7604, "lon": -95.3698},
  "departure": "2026-10-20T14:00:00Z", "load_lb": 35000, "interval_mi": 10}'
```

Routes are ranked by fewest No Travel miles, then Severe miles, then High miles, then mile-weighted
average risk (Low = 0 … No Travel = 4), then travel time. Mile differences under 0.1 mi and average-risk
differences under 0.01 count as ties.

Errors are always `{"message": str, "extra": {...}}`: 400 invalid input (field errors in
`extra.fields`), 422 no route / beyond the forecast, 429 too many requests, 502 an external service
failed, 503 an external service is rate-limited (`extra.retry_after` seconds).

## External APIs (all keyless)

| Purpose | Provider |
|---|---|
| Routing | OSRM public demo server |
| Weather | Open-Meteo forecast API |
| Geocoding | Photon (komoot) |

Optional URL overrides are listed in [backend/.env.example](backend/.env.example).

## API probes

Standalone scripts (Python 3 standard library only) that call every endpoint the app needs,
plus failure cases, and save raw responses to `scripts/samples/`:

```bash
python3 scripts/probe_osrm.py
python3 scripts/probe_open_meteo.py
python3 scripts/probe_photon.py
```

Responses over 300 KB are saved as `*.trimmed.json` with long arrays shortened.

Tuning experiments (alternative-route generation, weather batching, grid sizes) live alongside them:

```bash
python3 scripts/tune_routes.py        # caches OSRM responses in scripts/.cache/
python3 scripts/tune_alternatives.py
python3 scripts/tune_weather.py       # takes ~3 min: pauses to respect rate limits
```
