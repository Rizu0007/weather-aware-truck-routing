from datetime import timedelta

import pytest
import responses
from django.utils import timezone

from tests.mocks import OPEN_METEO_URL, calm, mock_forecast, native, via_route
from trips.domain.risk import RiskLevel
from trips.exceptions import ForecastHorizonError, ProviderBusyError
from trips.services.heatmap import build_heatmap


def routes():
    return [
        [tuple(c) for c in body["routes"][0]["geometry"]["coordinates"]]
        for body in (native(), via_route())
    ]


def departure(hours_from_now=2):
    return (timezone.now() + timedelta(hours=hours_from_now)).replace(minute=40)


@responses.activate
def test_returns_49_hourly_levels_per_cell_from_departure_hour():
    mock_forecast()
    start = departure()

    heatmap = build_heatmap(routes=routes(), departure=start, load_lb=35_000)

    assert heatmap.start == start.replace(minute=0, second=0, microsecond=0)
    assert heatmap.hours == 49
    assert all(len(c.risk) == 49 for c in heatmap.cells)
    assert {level for c in heatmap.cells for level in c.risk} == {RiskLevel.LOW}
    assert {c.request.params["start_hour"] for c in responses.calls} == {
        heatmap.start.strftime("%Y-%m-%dT%H:00")
    }


@responses.activate
def test_levels_follow_the_risk_table_and_load_rules_per_hour():
    # Hour 10 brings 50 mph wind: Severe, and No Travel above 30,000 lb.
    def gust_at_hour_10(lon, lat, hour):
        return calm(lon, lat, hour) | ({"wind": 50.0} if hour == 10 else {})

    mock_forecast(gust_at_hour_10)
    light = build_heatmap(routes=routes(), departure=departure(), load_lb=20_000)
    heavy = build_heatmap(routes=routes(), departure=departure(), load_lb=35_000)

    assert light.cells[0].risk[10] == RiskLevel.SEVERE
    assert heavy.cells[0].risk[10] == RiskLevel.NO_TRAVEL
    assert heavy.cells[0].risk[9] == heavy.cells[0].risk[11] == RiskLevel.LOW


@responses.activate
def test_missing_values_count_as_calm_with_a_warning():
    mock_forecast(lambda lon, lat, hour: calm(lon, lat, hour) | {"wind": None})

    heatmap = build_heatmap(routes=routes(), departure=departure(), load_lb=35_000)

    assert heatmap.cells[0].risk[0] == RiskLevel.LOW
    assert heatmap.warnings[0].startswith("Forecast data was incomplete for")


def test_departure_must_leave_48_hours_of_forecast():
    with pytest.raises(ForecastHorizonError):
        build_heatmap(routes=routes(), departure=departure(14 * 24), load_lb=35_000)


@responses.activate
def test_weather_rate_limit_is_a_busy_error():
    responses.get(
        OPEN_METEO_URL, status=429, json={"reason": "Minutely API request limit exceeded."}
    )

    with pytest.raises(ProviderBusyError):
        build_heatmap(routes=routes(), departure=departure(), load_lb=35_000)
