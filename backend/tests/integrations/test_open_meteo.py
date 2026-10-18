import copy
import json
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
import responses
from django.conf import settings

from tests.conftest import load_sample
from trips.exceptions import ProviderError
from trips.integrations import open_meteo
from trips.integrations.open_meteo import hourly, snap

URL = settings.OPEN_METEO_URL
# The window of the saved samples: three hours from 2026-10-17 21:00 UTC.
SAMPLE_START = datetime(2026, 10, 17, 21, tzinfo=UTC)
DALLAS = (-96.797, 32.7767)
WACO = (-96.5009, 31.4952)
HOUSTON = (-95.3698, 29.7604)


def fake_forecast(wind=7.0, rain=0.0, showers=0.0, snow=0.0):
    """A callback answering any Open-Meteo request with the sample's shape.

    It returns as many locations and hours as were asked for: an object for one
    location, a list for several (API_NOTES.md, Open-Meteo surprise 1).
    """
    template = load_sample("open_meteo_single_location")

    def callback(request):
        query = parse_qs(urlparse(request.url).query)
        lats = query["latitude"][0].split(",")
        start = datetime.strptime(query["start_hour"][0], "%Y-%m-%dT%H:%M")
        end = datetime.strptime(query["end_hour"][0], "%Y-%m-%dT%H:%M")
        hours = int((end - start) / timedelta(hours=1)) + 1
        locations = []
        for i, _ in enumerate(lats):
            location = copy.deepcopy(template)
            location["hourly"] = {
                "time": [
                    (start + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(hours)
                ],
                "wind_speed_10m": [wind] * hours,
                "rain": [rain] * hours,
                "showers": [showers] * hours,
                "snowfall": [snow] * hours,
            }
            if i:
                location["location_id"] = i
            locations.append(location)
        body = locations[0] if len(locations) == 1 else locations
        return 200, {}, json.dumps(body)

    return callback


@responses.activate
def test_single_location_object_response():
    responses.get(URL, json=load_sample("open_meteo_single_location"))

    [series] = hourly([DALLAS], SAMPLE_START, 3)

    assert series.start == SAMPLE_START
    assert series.wind_mph == [6.2, 5.9, 2.4]
    assert series.rain_in_hr == [0.0, 0.0, 0.0]
    assert series.snow_in_hr == [0.0, 0.0, 0.0]


@responses.activate
def test_multi_location_list_response_keeps_request_order():
    responses.get(URL, json=load_sample("open_meteo_multi_location"))

    dallas, waco, houston = hourly([DALLAS, WACO, HOUSTON], SAMPLE_START, 3)

    assert dallas.wind_mph == [6.2, 5.9, 2.4]
    assert waco.wind_mph == [10.4, 9.8, 9.8]
    assert houston.wind_mph != dallas.wind_mph


@responses.activate
def test_request_asks_for_mph_inches_utc_and_an_inclusive_window():
    responses.get(URL, json=load_sample("open_meteo_single_location"))

    hourly([DALLAS], SAMPLE_START + timedelta(minutes=40), 3)

    params = responses.calls[0].request.params
    assert params["wind_speed_unit"] == "mph"
    assert params["precipitation_unit"] == "inch"
    assert params["timezone"] == "GMT"
    # Rounded down to the hour; end_hour is inclusive, so 3 hours end at 23:00.
    assert params["start_hour"] == "2026-10-17T21:00"
    assert params["end_hour"] == "2026-10-17T23:00"
    assert params["hourly"] == "wind_speed_10m,rain,showers,snowfall"
    assert "apikey" not in params


@responses.activate
def test_converts_default_metric_units():
    # km/h, mm and cm, as returned when no unit parameters are sent.
    body = load_sample("open_meteo_default_units")
    body["hourly"]["rain"] = [2.54, 0.0, 0.0]
    body["hourly"]["showers"] = [2.54, 0.0, 0.0]
    body["hourly"]["snowfall"] = [5.08, 0.0, 0.0]
    responses.get(URL, json=body)

    [series] = hourly([DALLAS], SAMPLE_START, 3)

    assert series.wind_mph == pytest.approx([6.21, 5.90, 2.36], abs=0.01)
    assert series.rain_in_hr[0] == pytest.approx(0.2)
    assert series.snow_in_hr[0] == pytest.approx(2.0)


@responses.activate
def test_rain_is_rain_plus_showers():
    responses.add_callback(responses.GET, URL, callback=fake_forecast(rain=0.10, showers=0.15))

    [series] = hourly([DALLAS], SAMPLE_START, 2)

    assert series.rain_in_hr == pytest.approx([0.25, 0.25])


@responses.activate
def test_nulls_become_missing_values():
    body = load_sample("open_meteo_single_location")
    body["hourly"]["wind_speed_10m"] = [None, 5.9, 2.4]
    body["hourly"]["rain"] = [None, None, 0.2]
    body["hourly"]["showers"] = [None, 0.1, None]
    responses.get(URL, json=body)

    [series] = hourly([DALLAS], SAMPLE_START, 3)

    assert series.wind_mph == [None, 5.9, 2.4]
    assert series.rain_in_hr == [None, 0.1, 0.2]


@responses.activate
def test_nearby_points_share_one_lookup():
    responses.add_callback(responses.GET, URL, callback=fake_forecast())
    nearby = (DALLAS[0] + 0.01, DALLAS[1] + 0.01)

    first, second, waco = hourly([DALLAS, nearby, WACO], SAMPLE_START, 3)

    assert first is second
    assert responses.calls[0].request.params["latitude"] == "32.80,31.50"


@responses.activate
def test_batches_large_requests(monkeypatch):
    monkeypatch.setattr(open_meteo, "BATCH_SIZE", 2)
    responses.add_callback(responses.GET, URL, callback=fake_forecast())
    points = [(-100 + i, 35.0) for i in range(5)]

    series = hourly(points, SAMPLE_START, 4)

    assert len(series) == 5
    batch_sizes = sorted(len(c.request.params["latitude"].split(",")) for c in responses.calls)
    assert batch_sizes == [1, 2, 2]


@responses.activate
def test_second_lookup_is_served_from_cache():
    responses.add_callback(responses.GET, URL, callback=fake_forecast())

    hourly([DALLAS, WACO], SAMPLE_START, 3)
    hourly([WACO, HOUSTON], SAMPLE_START, 3)

    assert len(responses.calls) == 2
    assert responses.calls[1].request.params["latitude"] == "29.75"


@responses.activate
def test_location_count_mismatch_is_a_provider_error():
    responses.get(URL, json=load_sample("open_meteo_single_location"))

    with pytest.raises(ProviderError):
        hourly([DALLAS, HOUSTON], SAMPLE_START, 3)


@responses.activate
def test_wrong_window_is_a_provider_error():
    responses.get(URL, json=load_sample("open_meteo_single_location"))

    with pytest.raises(ProviderError):
        hourly([DALLAS], SAMPLE_START + timedelta(hours=1), 3)


@responses.activate
def test_unknown_unit_is_a_provider_error():
    body = load_sample("open_meteo_single_location")
    body["hourly_units"]["wind_speed_10m"] = "bft"
    responses.get(URL, json=body)

    with pytest.raises(ProviderError):
        hourly([DALLAS], SAMPLE_START, 3)


@responses.activate
def test_bad_request_is_a_provider_error_without_retry():
    responses.get(URL, status=400, json=load_sample("open_meteo_error_invalid_latitude"))

    with pytest.raises(ProviderError) as info:
        hourly([DALLAS], SAMPLE_START, 3)

    assert info.value.extra == {"provider": "open-meteo", "status": 400}
    assert len(responses.calls) == 1


@responses.activate
def test_sends_api_key_when_configured(settings):
    settings.OPEN_METEO_API_KEY = "test-key"
    responses.get(URL, json=load_sample("open_meteo_single_location"))

    hourly([DALLAS], SAMPLE_START, 3)

    assert responses.calls[0].request.params["apikey"] == "test-key"


def test_snap_rounds_to_the_grid():
    assert snap((-96.797, 32.7767)) == (-96.8, 32.8)
    assert snap((-96.774, 32.724)) == (-96.75, 32.7)


def test_rejects_naive_start():
    with pytest.raises(ValueError, match="timezone-aware"):
        hourly([DALLAS], datetime(2026, 10, 17, 21), 3)
