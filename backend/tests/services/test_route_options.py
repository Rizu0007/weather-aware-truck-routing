"""Route options with OSRM and Photon mocked from the saved Dallas-Houston samples."""

import json
import time

import pytest
import responses

from tests.conftest import load_sample
from tests.mocks import (
    DALLAS,
    HOUSTON,
    OSRM_URL,
    REVERSE_URL,
    is_via_request,
    mock_osrm,
    mock_towns,
    native,
    no_town,
    town,
    via_route,
)
from trips.exceptions import NoRouteError
from trips.services import route_options
from trips.services.route_options import find_route_options


def duplicate_of_native():
    """A via-point route that is really the fastest route again."""
    return native()


def via_calls():
    return [c for c in responses.calls if is_via_request(c.request.url)]


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
    mock_osrm((200, native()))
    mock_towns([no_town()] * 4)

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
            no_town(),
        ]
    )

    result = find_route_options(DALLAS, HOUSTON)

    assert [o.via_town for o in result.options] == [None, "Cameron, Texas"]
    assert len(via_calls()) == 2
    assert "Only 2 distinct routes" in result.warnings[0]


@responses.activate
def test_unconnected_places_raise_no_route():
    mock_osrm((400, load_sample("osrm_error_no_route")))

    with pytest.raises(NoRouteError):
        find_route_options((-157.8583, 21.3069), (-118.2437, 34.0522))


@responses.activate
def test_route_options_are_cached():
    mock_osrm((200, native()))
    mock_towns([no_town()] * 4)

    find_route_options(DALLAS, HOUSTON)
    calls = len(responses.calls)
    find_route_options(DALLAS, HOUSTON)

    assert len(responses.calls) == calls


@responses.activate
def test_town_lookup_outage_keeps_the_direct_route_and_is_not_cached():
    mock_osrm((200, native()))
    responses.get(REVERSE_URL, status=503)

    result = find_route_options(DALLAS, HOUSTON)

    assert len(result.options) == 1
    assert result.warnings == ["Alternative routes are temporarily unavailable."]
    calls = len(responses.calls)
    find_route_options(DALLAS, HOUSTON)
    assert len(responses.calls) > calls


@responses.activate
def test_via_route_outage_keeps_routes_found_before_it():
    mock_osrm((200, native()), [(200, via_route())] + [(503, {})] * 3)  # 503 is retried
    mock_towns([town("Franklin", -96.48, 31.03), town("Cameron", -96.98, 30.85)])

    result = find_route_options(DALLAS, HOUSTON)

    assert [o.via_town for o in result.options] == [None, "Franklin, Texas"]
    assert result.warnings == ["Alternative routes are temporarily unavailable."]


def slow(answer, seconds):
    """A /reverse answer that arrives after `seconds`, like a stalled public server."""

    def callback(_):
        time.sleep(seconds)
        return answer

    return callback


@responses.activate
def test_town_lookups_run_in_parallel(monkeypatch):
    mock_osrm((200, native()))
    responses.add_callback(
        responses.GET,
        REVERSE_URL,
        callback=lambda _: (time.sleep(0.3), (200, {}, '{"features": []}'))[1],
    )

    started = time.monotonic()
    find_route_options(DALLAS, HOUSTON)

    assert len([c for c in responses.calls if "/reverse" in c.request.url]) == 4
    assert time.monotonic() - started < 0.9  # 4 x 0.3 s one after another would be 1.2 s


@responses.activate
def test_one_failed_lookup_doesnt_stop_the_others():
    mock_osrm((200, native()), [(200, via_route()), (200, via_route(shift_lon=0.5))])
    mock_towns(
        [(503, {}), town("Franklin", -96.48, 31.03), town("Cameron", -96.98, 30.85), no_town()]
    )

    result = find_route_options(DALLAS, HOUSTON)

    assert [o.via_town for o in result.options] == [None, "Franklin, Texas", "Cameron, Texas"]
    assert result.warnings == []  # three routes despite the failure: nothing missing


@responses.activate
def test_stalled_lookup_is_given_up_after_the_budget(monkeypatch):
    monkeypatch.setattr(route_options, "ALTERNATIVES_BUDGET_S", 0.5)
    mock_osrm((200, native()), [(200, via_route())])
    mock_towns([town("Franklin", -96.48, 31.03), slow(town("Cameron", -96.98, 30.85), 2)])

    started = time.monotonic()
    result = find_route_options(DALLAS, HOUSTON)

    assert time.monotonic() - started < 1.5  # didn't wait for the stalled lookup
    assert [o.via_town for o in result.options] == [None, "Franklin, Texas"]
    assert result.warnings == ["Alternative routes are temporarily unavailable."]


@responses.activate
def test_slow_routing_stops_the_search_at_the_budget(monkeypatch):
    monkeypatch.setattr(route_options, "ALTERNATIVES_BUDGET_S", 0.5)
    calls = []

    def osrm_answer(request):
        if is_via_request(request.url):
            calls.append(request.url)
            time.sleep(0.6)  # the first via route alone uses up the budget
            return 200, {}, json.dumps(via_route())
        return 200, {}, json.dumps(native())

    responses.add_callback(responses.GET, OSRM_URL, callback=osrm_answer)
    mock_towns([town("Franklin", -96.48, 31.03), town("Cameron", -96.98, 30.85)])

    result = find_route_options(DALLAS, HOUSTON)

    assert len(calls) == 1
    assert [o.via_town for o in result.options] == [None, "Franklin, Texas"]
    assert "temporarily unavailable" in result.warnings[0]
