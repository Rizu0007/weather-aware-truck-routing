from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest
import responses
from django.utils import timezone

from tests.conftest import load_sample
from tests.mocks import (
    DALLAS,
    HOUSTON,
    OPEN_METEO_URL,
    mock_forecast,
    mock_osrm,
    mock_towns,
    native,
    no_town,
    town,
    via_route,
)

URL = "/api/trip-plans"


def body(**overrides):
    departure = timezone.now() + timedelta(hours=2)
    return {
        "origin": {"lon": DALLAS[0], "lat": DALLAS[1]},
        "destination": {"lon": HOUSTON[0], "lat": HOUSTON[1]},
        "departure": departure.isoformat(),
        "load_lb": 35_000,
        "interval_mi": 25,
    } | overrides


def post(client, payload):
    return client.post(URL, payload, content_type="application/json")


@responses.activate
def test_returns_ranked_routes_in_the_documented_shape(client):
    mock_osrm((200, native()), [(200, via_route())])
    mock_towns([town("Franklin", -96.48, 31.03), no_town(), no_town(), no_town()])
    mock_forecast()

    response = post(client, body())

    assert response.status_code == 200
    data = response.json()
    assert data["recommended_route_id"] == "A"
    assert data["recommendation"]["ranking"] == ["A", "B"]
    assert data["interval_mi"] == 25
    assert len(data["warnings"]) == 1

    route = data["routes"][0]
    assert set(route) == {
        "id", "label", "via_town", "distance_mi", "duration_s", "arrival",
        "summary", "geometry", "segments", "checkpoints",
    }  # fmt: skip
    assert route["summary"]["miles_by_level"] == {
        "low": route["distance_mi"], "moderate": 0, "high": 0, "severe": 0, "no_travel": 0,
    }  # fmt: skip
    assert route["summary"]["max_level"] == "low"
    assert data["routes"][1]["via_town"] == "Franklin, Texas"

    checkpoint = route["checkpoints"][1]
    assert checkpoint["mile"] == 25
    assert checkpoint["covers"] == [12.5, 37.5]
    assert checkpoint["level"] == "low"
    assert checkpoint["reasons"] == []
    assert "." not in checkpoint["eta"]  # whole seconds
    assert route["segments"][0]["level"] == "low"
    assert len(route["geometry"]) < 2364 / 3  # simplified for the browser


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"load_lb": 0}, "load_lb"),
        ({"load_lb": 80_001}, "load_lb"),
        ({"interval_mi": 15}, "interval_mi"),
        ({"origin": {"lon": -96.8, "lat": 95}}, "origin"),
        ({"departure": "tomorrow"}, "departure"),
        ({"departure": (timezone.now() - timedelta(hours=2)).isoformat()}, "departure"),
        ({"destination": {"lon": DALLAS[0] + 0.001, "lat": DALLAS[1]}}, "destination"),
    ],
)
def test_rejects_invalid_input(client, overrides, field):
    response = post(client, body(**overrides))

    assert response.status_code == 400
    assert response.json()["message"] == "Invalid input."
    assert field in response.json()["extra"]["fields"]


@responses.activate
def test_interval_defaults_to_ten_miles(client):
    mock_osrm((200, native()), [(200, via_route())])
    mock_towns([town("Franklin", -96.48, 31.03), no_town(), no_town(), no_town()])
    mock_forecast()
    payload = body()
    del payload["interval_mi"]

    data = post(client, payload).json()

    assert data["interval_mi"] == 10
    assert data["routes"][0]["checkpoints"][1]["mile"] == 10


@responses.activate
def test_unconnected_places_are_a_422(client):
    mock_osrm((400, load_sample("osrm_error_no_route")))

    response = post(client, body(origin={"lon": -157.8583, "lat": 21.3069}))

    assert response.status_code == 422
    assert response.json()["message"] == "No drivable route was found between these places."


@responses.activate
def test_departure_past_the_forecast_is_a_422(client):
    mock_osrm((200, native()), [(200, via_route())])
    mock_towns([town("Franklin", -96.48, 31.03), no_town(), no_town(), no_town()])

    response = post(client, body(departure=(timezone.now() + timedelta(days=14)).isoformat()))

    assert response.status_code == 422
    assert "latest_departure" in response.json()["extra"]


@responses.activate
def test_weather_outage_is_a_502(client):
    mock_osrm((200, native()), [(200, via_route())])
    mock_towns([town("Franklin", -96.48, 31.03), no_town(), no_town(), no_town()])
    responses.get(OPEN_METEO_URL, status=503)

    response = post(client, body())

    assert response.status_code == 502
    assert response.json()["extra"]["provider"] == "open-meteo"


def test_malformed_json_is_a_400(client):
    response = client.post(URL, "{not json", content_type="application/json")

    assert response.status_code == 400
    assert set(response.json()) == {"message", "extra"}


def test_wrong_method_is_a_405(client):
    response = client.get(URL)

    assert response.status_code == 405
    assert response.json()["message"] == 'Method "GET" not allowed.'


@responses.activate
def test_the_same_instant_in_any_time_zone_gives_the_same_plan(client):
    # 14:00 UTC, written the way browsers in different zones might send it.
    start = (timezone.now() + timedelta(hours=3)).replace(minute=0, second=0, microsecond=0)
    instants = [
        start.astimezone(ZoneInfo(zone)).isoformat()
        for zone in (
            "UTC",
            "America/New_York",
            "America/Los_Angeles",
            "Europe/London",
            "Asia/Karachi",
        )
    ]
    mock_osrm((200, native()), [(200, via_route())] * len(instants))
    mock_towns([town("Franklin", -96.48, 31.03), no_town(), no_town(), no_town()])
    mock_forecast()

    plans = [post(client, body(departure=instant)).json() for instant in instants]

    assert len({plan["departure"] for plan in plans}) == 1
    assert plans[0]["departure"].endswith("+00:00")  # always answered in UTC
    etas = [[c["eta"] for c in plan["routes"][0]["checkpoints"]] for plan in plans]
    assert all(route_etas == etas[0] for route_etas in etas)
