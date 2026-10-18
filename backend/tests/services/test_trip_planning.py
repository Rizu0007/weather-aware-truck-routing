"""Trip planning end to end, with every provider mocked from the saved samples.

Dallas-Houston: route A is I-45 (fastest); route B goes west via the saved
via-point route. A storm box sits on I-45 around Centerville, which route B
passes ~50 miles to the west.
"""

from datetime import timedelta
from itertools import pairwise

import pytest
import responses
from django.utils import timezone

from tests.mocks import (
    DALLAS,
    HOUSTON,
    calm,
    mock_forecast,
    mock_osrm,
    mock_towns,
    native,
    no_town,
    town,
    via_route,
)
from trips.domain.risk import RiskLevel
from trips.exceptions import ForecastHorizonError
from trips.services.trip_planning import plan_trip

LOAD_LB = 35_000


def departure(hours_from_now=2):
    return (timezone.now() + timedelta(hours=hours_from_now)).replace(
        minute=20, second=0, microsecond=0
    )


def storm_on_i45(wind_mph):
    def weather(lon, lat, hour):
        if -96.3 < lon < -95.7 and 30.9 < lat < 31.6:
            return {"wind": wind_mph, "rain": 0.0, "showers": 0.0, "snow": 0.0}
        return calm(lon, lat, hour)

    return weather


def mock_two_routes(weather=calm):
    mock_osrm((200, native()), [(200, via_route())])
    mock_towns([town("Franklin", -96.48, 31.03), no_town(), no_town(), no_town()])
    mock_forecast(weather)


def plan(**overrides):
    args = {
        "origin": DALLAS,
        "destination": HOUSTON,
        "departure": departure(),
        "load_lb": LOAD_LB,
        "interval_mi": 10,
    }
    return plan_trip(**(args | overrides))


@responses.activate
def test_calm_weather_recommends_the_fastest_route():
    mock_two_routes()

    result = plan()

    assert result.ranking.order == ["A", "B"]
    assert result.ranking.reason.startswith("Shortest travel time")
    assert [r.option.id for r in result.routes] == ["A", "B"]
    assert result.warnings == [
        "Only 2 distinct routes found for this corridor: "
        "other roads were near-duplicates or long detours."
    ]


@responses.activate
def test_storm_on_the_fastest_route_recommends_the_detour():
    # 50 mph is Severe; with more than 30,000 lb the load rule makes it No Travel.
    mock_two_routes(storm_on_i45(wind_mph=50))

    result = plan()
    fastest, detour = (next(r for r in result.routes if r.option.id == i) for i in "AB")

    assert result.ranking.order == ["B", "A"]
    assert result.ranking.reason.startswith("Fewest No Travel miles")
    assert fastest.summary.miles_by_level[RiskLevel.NO_TRAVEL] > 0
    assert fastest.summary.max_level == RiskLevel.NO_TRAVEL
    assert detour.summary.max_level == RiskLevel.LOW
    stormy = [c for c in fastest.checkpoints if c.assessment.level == RiskLevel.NO_TRAVEL]
    assert stormy[0].assessment.reasons == ("Wind 50 mph with a 35,000 lb load",)


@responses.activate
def test_lighter_load_keeps_the_storm_severe():
    mock_two_routes(storm_on_i45(wind_mph=50))

    result = plan(load_lb=20_000)
    fastest = next(r for r in result.routes if r.option.id == "A")

    assert fastest.summary.max_level == RiskLevel.SEVERE
    assert result.ranking.reason.startswith("Fewest Severe miles")


@responses.activate
def test_weather_is_read_at_the_hour_nearest_each_eta():
    # Wind equals the hour index, so each checkpoint reveals which hour it read.
    mock_two_routes(lambda lon, lat, hour: calm(lon, lat, hour) | {"wind": float(hour)})
    start = departure()

    result = plan(departure=start)

    window_start = start.replace(minute=0)
    for route in result.routes:
        for c in route.checkpoints:
            expected = round((c.checkpoint.eta - window_start) / timedelta(hours=1))
            assert c.wind_mph == expected
    # Departure at :20 reads the departure hour; the 4.2 h arrival (4:32 later) reads hour 5.
    fastest = next(r for r in result.routes if r.option.id == "A")
    assert fastest.checkpoints[0].wind_mph == 0
    assert fastest.checkpoints[-1].wind_mph == 5


@responses.activate
def test_requests_one_window_covering_the_longest_trip():
    mock_two_routes()
    start = departure()

    plan(departure=start)

    [weather_call] = [c for c in responses.calls if "open-meteo" in c.request.url]
    params = weather_call.request.params
    assert params["start_hour"] == start.strftime("%Y-%m-%dT%H:00")
    # Longest route is ~5.5 h: ceil + 2 = 8 hours, so end_hour is start + 7 h.
    assert params["end_hour"] == (start + timedelta(hours=7)).strftime("%Y-%m-%dT%H:00")


@responses.activate
def test_risk_segments_follow_checkpoint_levels():
    mock_two_routes(storm_on_i45(wind_mph=50))

    result = plan()
    fastest = next(r for r in result.routes if r.option.id == "A")

    levels = [s.level for s in fastest.segments]
    assert levels == [RiskLevel.LOW, RiskLevel.NO_TRAVEL, RiskLevel.LOW]
    # Segments join end to start, so the drawn route has no gaps.
    for previous, current in pairwise(fastest.segments):
        assert previous.coordinates[-1] == pytest.approx(current.coordinates[0])


@responses.activate
def test_checkpoints_cover_the_whole_route():
    mock_two_routes()

    result = plan(interval_mi=25)

    for route in result.routes:
        covered = sum(c.checkpoint.miles_covered for c in route.checkpoints)
        assert covered == pytest.approx(route.distance_mi)
        assert sum(route.summary.miles_by_level.values()) == pytest.approx(route.distance_mi)


@responses.activate
def test_missing_forecast_values_are_scored_as_calm_with_a_warning():
    def gaps(lon, lat, hour):
        values = calm(lon, lat, hour)
        return values | {"wind": None} if lat < 30.5 else values

    mock_two_routes(gaps)

    result = plan()

    assert any(w.startswith("Forecast data was incomplete at") for w in result.warnings)
    gap = next(c for r in result.routes for c in r.checkpoints if c.wind_mph is None)
    assert gap.assessment.level == RiskLevel.LOW


@responses.activate
def test_departure_beyond_the_forecast_horizon_is_rejected():
    mock_two_routes()

    with pytest.raises(ForecastHorizonError) as info:
        plan(departure=departure(hours_from_now=14 * 24))

    assert "latest_departure" in info.value.extra
    assert not [c for c in responses.calls if "open-meteo" in c.request.url]
