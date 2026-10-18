"""Driving routes from OSRM.

Every OSRM error is HTTP 400; only its `code` field tells "no road" from a bad request.
"""

from dataclasses import dataclass

from django.conf import settings

from trips.domain.geo import Coord
from trips.exceptions import NoRouteError, ProviderError
from trips.integrations.http import get_json

PROVIDER = "osrm"
METERS_PER_MILE = 1609.344


@dataclass(frozen=True)
class OsrmRoute:
    coords: list[Coord]
    segment_seconds: list[float]  # one per pair of consecutive coords, across all legs
    distance_mi: float
    duration_s: float


def routes(origin: Coord, destination: Coord) -> list[OsrmRoute]:
    """Fastest route plus OSRM's own alternatives (usually none or one)."""
    return _request([origin, destination], alternatives="3")


def route_via(origin: Coord, via: Coord, destination: Coord) -> OsrmRoute | None:
    """The fastest route through `via`, or None if OSRM can't route through it."""
    try:
        [route] = _request([origin, via, destination], alternatives="false")
    except NoRouteError:
        return None
    return route


def _request(points: list[Coord], alternatives: str) -> list[OsrmRoute]:
    path = ";".join(f"{lon:.5f},{lat:.5f}" for lon, lat in points)
    params = {
        "overview": "full",
        "geometries": "geojson",
        "annotations": "duration",
        "alternatives": alternatives,
        "steps": "false",
    }
    url = f"{settings.OSRM_URL}/route/v1/driving/{path}"
    body = get_json(PROVIDER, url, params, accept=frozenset({200, 400}))

    code = body.get("code") if isinstance(body, dict) else None
    if code == "NoRoute":
        raise NoRouteError()
    if code != "Ok" or not body.get("routes"):
        raise ProviderError(PROVIDER, extra={"code": code})
    return [_parse_route(route) for route in body["routes"]]


def _parse_route(route: dict) -> OsrmRoute:
    try:
        coords = [(lon, lat) for lon, lat in route["geometry"]["coordinates"]]
        seconds = [s for leg in route["legs"] for s in leg["annotation"]["duration"]]
        distance_m, duration_s = route["distance"], route["duration"]
    except (KeyError, TypeError, ValueError) as exc:
        raise ProviderError(PROVIDER, extra={"reason": "unexpected response shape"}) from exc
    if len(coords) < 2 or len(seconds) != len(coords) - 1:
        raise ProviderError(PROVIDER, extra={"reason": "annotations don't match geometry"})
    return OsrmRoute(coords, seconds, distance_m / METERS_PER_MILE, duration_s)
