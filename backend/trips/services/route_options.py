"""Up to three distinct driving routes between two places.

OSRM's own alternatives come first. If there are fewer than three, candidates
are forced through the town nearest to a point beside the direct line, and kept
only if they're distinct and not a long detour (domain/alternatives.py).
Corridors with a single sensible road return fewer routes and a warning.
"""

import logging
from dataclasses import dataclass

from django.core.cache import cache

from trips.domain import alternatives
from trips.domain.geo import Coord, haversine_mi
from trips.integrations import osrm, photon
from trips.integrations.osrm import OsrmRoute

logger = logging.getLogger(__name__)

TARGET_ROUTES = 3
ROUTE_IDS = "ABC"
CACHE_TTL_S = 60 * 60
KM_PER_MI = 1.609344
# Town search radius: wide enough to reach a town from an offset point in open
# country, but small enough to stay on the chosen side of the direct line.
MIN_TOWN_RADIUS_KM = 20
TOWN_RADIUS_SHARE = 0.12


@dataclass(frozen=True)
class RouteOption:
    id: str
    route: OsrmRoute
    via_town: str | None = None  # None for OSRM's own routes


@dataclass(frozen=True)
class RouteOptions:
    options: list[RouteOption]
    warnings: list[str]


def find_route_options(origin: Coord, destination: Coord) -> RouteOptions:
    """Raises NoRouteError if the places aren't connected by road."""
    key = "routes:" + ":".join(f"{v:.4f}" for v in (*origin, *destination))
    if (cached := cache.get(key)) is not None:
        return cached

    found = [(route, None) for route in osrm.routes(origin, destination)[:TARGET_ROUTES]]
    if len(found) < TARGET_ROUTES:
        found += _via_town_routes(origin, destination, [r for r, _ in found])

    options = [
        RouteOption(id=route_id, route=route, via_town=town)
        for route_id, (route, town) in zip(ROUTE_IDS, found, strict=False)
    ]
    warnings = []
    if len(options) < TARGET_ROUTES:
        warnings.append(
            f"Only {len(options)} distinct route{'s' if len(options) > 1 else ''} found for this "
            "corridor: other roads were near-duplicates or long detours."
        )
    result = RouteOptions(options, warnings)
    cache.set(key, result, CACHE_TTL_S)
    return result


def _via_town_routes(
    origin: Coord, destination: Coord, kept: list[OsrmRoute]
) -> list[tuple[OsrmRoute, str]]:
    fastest_s = min(route.duration_s for route in kept)
    footprints = [alternatives.footprint(route.coords) for route in kept]
    crow_km = haversine_mi(origin, destination) * KM_PER_MI
    radius_km = max(MIN_TOWN_RADIUS_KM, TOWN_RADIUS_SHARE * crow_km)

    added: list[tuple[OsrmRoute, str]] = []
    tried_towns: set[Coord] = set()
    for offset in alternatives.VIA_OFFSETS:
        if len(kept) + len(added) >= TARGET_ROUTES:
            break
        town = photon.nearest_town(alternatives.via_point(origin, destination, offset), radius_km)
        if town is None or town.coord in tried_towns:
            continue
        tried_towns.add(town.coord)

        candidate = osrm.route_via(origin, town.coord, destination)
        if candidate is None:
            continue
        candidate_footprint = alternatives.footprint(candidate.coords)
        if alternatives.is_acceptable(
            candidate_footprint, candidate.duration_s, footprints, fastest_s
        ):
            added.append((candidate, town.label))
            footprints.append(candidate_footprint)
        else:
            logger.info("Rejected route via %s (offset %+.2f)", town.label, offset)
    return added
