"""Route options with OSRM mocked from the saved Dallas-Houston samples, and towns faked."""

import json
import time

import pytest
import responses

from tests.conftest import load_sample
from tests.mocks import (
    DALLAS,
    HOUSTON,
    OSRM_URL,
    is_via_request,
    mock_osrm,
    mock_towns,
    native,
    no_town,
    town,
    via_route,
)
from trips.domain import towns
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
def test_a_search_cut_short_is_not_cached():
    # The first via route fails (503, retried 3 times); the next plan tries again.
    mock_osrm((200, native()), [(503, {})] * 3 + [(200, via_route())])
    mock_towns([town("Franklin", -96.48, 31.03)])

    first = find_route_options(DALLAS, HOUSTON)
    second = find_route_options(DALLAS, HOUSTON)

    assert first.warnings == ["Alternative routes are temporarily unavailable."]
    assert [o.via_town for o in second.options] == [None, "Franklin, Texas"]


@responses.activate
def test_real_towns_give_three_routes_without_any_town_service(monkeypatch):
    # The bundled list, not the fake: only OSRM is mocked, so any other request would fail.
    monkeypatch.setattr(route_options, "nearest_town", towns.nearest_town)
    mock_osrm((200, native()), [(200, via_route()), (200, via_route(shift_lon=0.5))])

    result = find_route_options(DALLAS, HOUSTON)

    assert len(result.options) == 3
    assert all(o.via_town.endswith(", Texas") for o in result.options[1:])
    assert result.warnings == []


@responses.activate
def test_via_route_outage_keeps_routes_found_before_it():
    mock_osrm((200, native()), [(200, via_route())] + [(503, {})] * 3)  # 503 is retried
    mock_towns([town("Franklin", -96.48, 31.03), town("Cameron", -96.98, 30.85)])

    result = find_route_options(DALLAS, HOUSTON)

    assert [o.via_town for o in result.options] == [None, "Franklin, Texas"]
    assert result.warnings == ["Alternative routes are temporarily unavailable."]


@responses.activate
def test_skips_towns_in_a_country_neither_end_is_in():
    mock_osrm((200, native()), [(200, via_route())])
    mock_towns(
        [town("Nuevo Laredo", -96.48, 31.03, country="MX"), town("Cameron", -96.98, 30.85)],
        ends=(town("Dallas", *DALLAS), town("Houston", *HOUSTON)),
    )

    result = find_route_options(DALLAS, HOUSTON)

    assert [o.via_town for o in result.options] == [None, "Cameron, Texas"]
    assert len(via_calls()) == 1  # Nuevo Laredo was never routed


@responses.activate
def test_any_town_is_fine_when_the_ends_have_no_town_nearby():
    mock_osrm((200, native()), [(200, via_route())])
    mock_towns([town("Nuevo Laredo", -96.48, 31.03, country="MX")])

    result = find_route_options(DALLAS, HOUSTON)

    assert [o.via_town for o in result.options] == [None, "Nuevo Laredo, Texas, MX"]


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
