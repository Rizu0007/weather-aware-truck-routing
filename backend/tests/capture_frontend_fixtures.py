"""Write real API responses (providers mocked) for the frontend's tests.

Run from backend/: uv run python -m tests.capture_frontend_fixtures
"""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest import mock

import django
import responses

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "test" / "fixtures"


def storm_on_i45(lon, lat, hour):
    from tests.mocks import calm

    if -96.3 < lon < -95.7 and 30.9 < lat < 31.6:
        return {"wind": 50.0, "rain": 0.3, "showers": 0.0, "snow": 0.0}
    return calm(lon, lat, hour)


@responses.activate
def main():
    django.setup()
    from django.conf import settings
    from django.test import Client

    from tests.conftest import load_sample
    from tests.mocks import (
        DALLAS,
        HOUSTON,
        mock_forecast,
        mock_osrm,
        mock_towns,
        native,
        no_town,
        town,
        via_route,
    )

    mock_osrm((200, native()), [(200, via_route())])
    mock_towns([town("Franklin", -96.48, 31.03), no_town(), no_town(), no_town()])
    mock_forecast(storm_on_i45)
    responses.get(f"{settings.PHOTON_URL}/api/", json=load_sample("photon_search_bbox"))

    # A fixed clock keeps the fixtures stable between runs.
    now = datetime(2026, 10, 18, 12, tzinfo=UTC)
    departure = (now + timedelta(hours=2)).isoformat()
    client = Client(HTTP_HOST="localhost")  # outside pytest, "testserver" is not an allowed host
    with mock.patch("django.utils.timezone.now", return_value=now):
        plan = client.post(
            "/api/trip-plans",
            {
                "origin": {"lon": DALLAS[0], "lat": DALLAS[1]},
                "destination": {"lon": HOUSTON[0], "lat": HOUSTON[1]},
                "departure": departure,
                "load_lb": 35_000,
                "interval_mi": 25,
            },
            content_type="application/json",
        ).json()
        heatmap = client.post(
            "/api/heatmaps",
            {
                "routes": [r["geometry"] for r in plan["routes"]],
                "departure": departure,
                "load_lb": 35_000,
            },
            content_type="application/json",
        ).json()
        places = client.get("/api/places", {"q": "Paris"}).json()
        invalid = client.post("/api/trip-plans", {}, content_type="application/json").json()

    OUT.mkdir(parents=True, exist_ok=True)
    for name, body in {
        "trip-plan": plan,
        "heatmap": heatmap,
        "places": places,
        "error-invalid-input": invalid,
    }.items():
        (OUT / f"{name}.json").write_text(json.dumps(body, indent=1) + "\n")
        print(f"wrote {name}.json")


if __name__ == "__main__":
    import os

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    main()
