"""Route options with OSRM and Photon mocked from the saved Dallas-Houston samples."""

import copy
import json
import re

import pytest
import responses
from django.conf import settings

from tests.conftest import load_sample
from trips.exceptions import NoRouteError
from trips.services.route_options import find_route_options

OSRM_URL = re.compile(re.escape(settings.OSRM_URL) + r"/route/v1/driving/.*")
REVERSE_URL = f"{settings.PHOTON_URL}/reverse"
DALLAS = (-96.797, 32.7767)
HOUSTON = (-95.3698, 29.7604)


def native():
    """OSRM's answer to the direct request: one route (API_NOTES.md, OSRM surprise 1)."""
    return load_sample("osrm_route_short_alternatives")


def via_route(shift_lon=0.0, duration_factor=1.0):
    """The saved via-point route (x1.29 the fastest, 4 % overlap), optionally moved or slowed."""
    body = load_sample("osrm_route_via_point")
    route = body["routes"][0]
    route["geometry"]["coordinates"] = [
        [lon + shift_lon, lat] for lon, lat in route["geometry"]["coordinates"]
    ]
    route["duration"] *= duration_factor
    return body


def duplicate_of_native():
    """A via-point route that is really the fastest route again."""
    return native() | {"routes": native()["routes"][:1]}


def town(name, lon, lat):
    body = load_sample("photon_reverse_town")
    feature = copy.deepcopy(body["features"][0])
    feature["properties"]["name"] = name
    feature["geometry"]["coordinates"] = [lon, lat]
    return {"type": "FeatureCollection", "features": [feature]}


def mock_osrm(direct, via_answers):
    """Direct requests (2 points) get `direct`; via requests (3 points) get the next answer."""
    queue = list(via_answers)

    def callback(request):
        is_via = request.url.split("?")[0].count(";") == 2
        status, body = queue.pop(0) if is_via else direct
        return status, {}, json.dumps(body)

    responses.add_callback(responses.GET, OSRM_URL, callback=callback)


def mock_towns(answers):
    queue = list(answers)
    responses.add_callback(
        responses.GET, REVERSE_URL, callback=lambda _: (200, {}, json.dumps(queue.pop(0)))
    )


def via_calls():
    return [c for c in responses.calls if c.request.url.split("?")[0].count(";") == 2]


@responses.activate
def test_fills_up_to_three_routes_skipping_duplicates_and_detours():
    mock_osrm(
        (200, native()),
        [
            (200, via_route()),  # distinct: kept
            (200, duplicate_of_native()),  # near-duplicate: rejected
            (200, via_route(shift_lon=0.5, duration_factor=1.6)),  # detour: rejected
            (200, via_route(shift_lon=0.5)),  # distinct: kept
        ],
    )
    mock_towns(
        [
            town("Franklin", -96.48, 31.03),
            town("Corsicana", -96.47, 32.09),
            town("Hearne", -96.6, 30.88),
            town("Cameron", -96.98, 30.85),
        ]
    )

    result = find_route_options(DALLAS, HOUSTON)

    assert [o.id for o in result.options] == ["A", "B", "C"]
    assert [o.via_town for o in result.options] == [None, "Franklin, Texas", "Cameron, Texas"]
    assert result.warnings == []
    assert len(via_calls()) == 4


@responses.activate
def test_stops_once_three_routes_are_found():
    two_routes = native()
    two_routes["routes"].append(via_route(shift_lon=-0.5)["routes"][0])
    mock_osrm((200, two_routes), [(200, via_route())])
    mock_towns([town("Franklin", -96.48, 31.03)])

    result = find_route_options(DALLAS, HOUSTON)

    assert len(result.options) == 3
    assert result.options[1].via_town is None  # OSRM's own alternative
    assert len(via_calls()) == 1


@responses.activate
def test_single_corridor_returns_fewer_routes_with_a_warning():
    mock_osrm((200, native()), [])
    mock_towns([load_sample("photon_reverse_no_town")] * 4)

    result = find_route_options(DALLAS, HOUSTON)

    assert len(result.options) == 1
    assert result.warnings == [
        "Only 1 distinct route found for this corridor: "
        "other roads were near-duplicates or long detours."
    ]
    assert via_calls() == []


@responses.activate
def test_same_town_is_tried_once_and_unroutable_towns_are_skipped():
    mock_osrm(
        (200, native()),
        [(400, load_sample("osrm_error_no_route")), (200, via_route())],
    )
    mock_towns(
        [
            town("Franklin", -96.48, 31.03),
            town("Franklin", -96.48, 31.03),
            town("Cameron", -96.98, 30.85),
            load_sample("photon_reverse_no_town"),
        ]
    )

    result = find_route_options(DALLAS, HOUSTON)

    assert [o.via_town for o in result.options] == [None, "Cameron, Texas"]
    assert len(via_calls()) == 2
    assert "Only 2 distinct routes" in result.warnings[0]


@responses.activate
def test_unconnected_places_raise_no_route():
    mock_osrm((400, load_sample("osrm_error_no_route")), [])

    with pytest.raises(NoRouteError):
        find_route_options((-157.8583, 21.3069), (-118.2437, 34.0522))


@responses.activate
def test_route_options_are_cached():
    mock_osrm((200, native()), [])
    mock_towns([load_sample("photon_reverse_no_town")] * 4)

    find_route_options(DALLAS, HOUSTON)
    calls = len(responses.calls)
    find_route_options(DALLAS, HOUSTON)

    assert len(responses.calls) == calls
