from datetime import timedelta

import pytest
import responses
from django.utils import timezone

from tests.mocks import OPEN_METEO_URL, mock_forecast, native

URL = "/api/heatmaps"


def body(**overrides):
    route = native()["routes"][0]["geometry"]["coordinates"]
    return {
        "routes": [route],
        "departure": (timezone.now() + timedelta(hours=2)).isoformat(),
        "load_lb": 35_000,
    } | overrides


def post(client, payload):
    return client.post(URL, payload, content_type="application/json")


@responses.activate
def test_returns_cells_in_the_documented_shape(client):
    mock_forecast()

    response = post(client, body())

    assert response.status_code == 200
    data = response.json()
    assert set(data) == {"start", "hours", "cell_deg", "warnings", "cells"}
    assert data["hours"] == 49
    cell = data["cells"][0]
    assert set(cell) == {"lon", "lat", "risk", "wind_mph", "rain_in_hr", "snow_in_hr"}
    assert len(cell["risk"]) == len(cell["wind_mph"]) == 49
    assert cell["wind_mph"][0] == 7.0


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"routes": []}, "routes"),
        ({"routes": [[[-96.8, 32.8]]]}, "routes"),  # one point is not a line
        ({"routes": [[[-96.8, 32.8, 1.0], [-95.4, 29.8, 1.0]]]}, "routes"),
        ({"routes": [[[-96.8, 95.0], [-95.4, 29.8]]]}, "routes"),
        ({"routes": [[[0.0, 0.0], [1.0, 1.0]]] * 4}, "routes"),
        ({"routes": "Dallas"}, "routes"),
        ({"load_lb": 90_000}, "load_lb"),
        ({"departure": (timezone.now() - timedelta(hours=3)).isoformat()}, "departure"),
    ],
)
def test_rejects_invalid_input(client, overrides, field):
    response = post(client, body(**overrides))

    assert response.status_code == 400
    assert field in response.json()["extra"]["fields"]


def test_rejects_too_many_points(client):
    huge = [[-100 + i * 1e-4, 35.0] for i in range(10_001)]

    response = post(client, body(routes=[huge]))

    assert response.status_code == 400


def test_departure_past_the_forecast_is_a_422(client):
    response = post(client, body(departure=(timezone.now() + timedelta(days=14)).isoformat()))

    assert response.status_code == 422


@responses.activate
def test_weather_rate_limit_is_a_503_with_retry_after(client):
    responses.get(
        OPEN_METEO_URL, status=429, json={"reason": "Minutely API request limit exceeded."}
    )

    response = post(client, body())

    assert response.status_code == 503
    assert response.json()["extra"] == {"provider": "open-meteo", "status": 429, "retry_after": 60}
