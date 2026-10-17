# Weather-Aware Truck Routing

Next.js (React) + Django app that helps a truck driver pick the safest route based on forecast weather,
load weight and travel time. See [ASSESSMENT.md](ASSESSMENT.md) for the brief and the agreed
interpretations of ambiguous rules.

> Status: planning. API findings are in [API_NOTES.md](API_NOTES.md), stack research in [RESEARCH.md](RESEARCH.md), the build plan in [PLAN.md](PLAN.md). Building checkpoint by checkpoint (see PLAN.md §5).

## Setup

Requirements: Python 3.12, [uv](https://docs.astral.sh/uv/), Node.js 24 (frontend, added later).

### Backend

```bash
cd backend
uv sync                 # creates .venv and installs locked dependencies
uv run ruff check       # lint
uv run ruff format      # format
uv run pytest           # tests
```

### Git hooks

```bash
backend/.venv/bin/pre-commit install   # runs Ruff on staged backend files before each commit
```

CI (`.github/workflows/ci.yml`) runs the same lint, format and test steps on every push and PR.

## External APIs (all keyless)

| Purpose | Provider |
|---|---|
| Routing | OSRM public demo server |
| Weather | Open-Meteo forecast API |
| Geocoding | Photon (komoot) |

Optional URL overrides are listed in [.env.example](.env.example).

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
