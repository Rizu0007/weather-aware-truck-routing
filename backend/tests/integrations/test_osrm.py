import re

import pytest
import responses
from django.conf import settings

from tests.conftest import load_sample
from trips.exceptions import NoRouteError, ProviderError
from trips.integrations.osrm import route_via, routes

URL = re.compile(re.escape(settings.OSRM_URL) + r"/route/v1/driving/.*")
DALLAS = (-96.797, 32.7767)
HOUSTON = (-95.3698, 29.7604)
VIA = (-96.9, 31.0)


@responses.activate
def test_parses_routes_from_sample():
    responses.get(URL, json=load_sample("osrm_route_short_alternatives"))

    [route] = routes(DALLAS, HOUSTON)

    assert len(route.coords) == 2364
    assert len(route.segment_seconds) == len(route.coords) - 1
    assert route.distance_mi == pytest.approx(238.3, abs=0.1)
    assert route.duration_s == 15191.5


@responses.activate
def test_request_is_lon_lat_with_full_geojson_and_alternatives():
    responses.get(URL, json=load_sample("osrm_route_short_alternatives"))

    routes(DALLAS, HOUSTON)

    request = responses.calls[0].request
    assert "/route/v1/driving/-96.79700,32.77670;-95.36980,29.76040?" in request.url
    assert request.params == {
        "overview": "full",
        "geometries": "geojson",
        "annotations": "duration",
        "alternatives": "3",
        "steps": "false",
    }


@responses.activate
def test_via_route_concatenates_legs():
    responses.get(URL, json=load_sample("osrm_route_via_point"))

    route = route_via(DALLAS, VIA, HOUSTON)

    assert len(route.segment_seconds) == 2037 + 2126 == len(route.coords) - 1
    assert responses.calls[0].request.params["alternatives"] == "false"
    assert responses.calls[0].request.url.count(";") == 2


@responses.activate
def test_no_route_raises_a_no_route_error():
    responses.get(URL, status=400, json=load_sample("osrm_error_no_route"))

    with pytest.raises(NoRouteError):
        routes(DALLAS, HOUSTON)


@responses.activate
def test_unroutable_via_point_is_skipped():
    responses.get(URL, status=400, json=load_sample("osrm_error_no_route"))

    assert route_via(DALLAS, VIA, HOUSTON) is None


@responses.activate
def test_other_errors_are_provider_errors():
    responses.get(URL, status=400, json=load_sample("osrm_error_invalid_coordinate"))

    with pytest.raises(ProviderError) as info:
        routes(DALLAS, HOUSTON)

    assert info.value.extra == {"provider": "osrm", "code": "InvalidValue"}


@responses.activate
def test_annotations_not_matching_geometry_is_a_provider_error():
    body = load_sample("osrm_route_short_alternatives")
    body["routes"][0]["legs"][0]["annotation"]["duration"].pop()
    responses.get(URL, json=body)

    with pytest.raises(ProviderError):
        routes(DALLAS, HOUSTON)
