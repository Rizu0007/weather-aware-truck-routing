"""Up to three distinct routes: OSRM's own, then routes forced through nearby towns.

Towns, not raw offset points: those snap to the nearest road, often a dirt road. The towns
come from a bundled list (trips/domain/towns.py), so finding them can't fail or stall.
"""

import logging
import time
from dataclasses import dataclass

from django.core.cache import cache

from trips.domain import alternatives
from trips.domain.geo import Coord, haversine_mi
from trips.domain.towns import Town, nearest_town
from trips.exceptions import ProviderError
from trips.integrations import osrm
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
# Public demo servers sometimes stall; past this, plan with the routes found so far.
ALTERNATIVES_BUDGET_S = 20


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
    key = "routes:" + ":".join(f"{v:.4f}" for v in (*origin, *destination))
    if (cached := cache.get(key)) is not None:
        return cached

    found = [(route, None) for route in osrm.routes(origin, destination)[:TARGET_ROUTES]]
    cut_short = False
    if len(found) < TARGET_ROUTES:
        extra, cut_short = _via_town_routes(origin, destination, [r for r, _ in found])
        found += extra
    # A cut-short search only matters if it left us short of routes.
    incomplete = cut_short and len(found) < TARGET_ROUTES

    options = [
        RouteOption(id=route_id, route=route, via_town=town)
        for route_id, (route, town) in zip(ROUTE_IDS, found, strict=False)
    ]
    warnings = []
    if incomplete:
        warnings.append("Alternative routes are temporarily unavailable.")
    elif len(options) < TARGET_ROUTES:
        warnings.append(
            f"Only {len(options)} distinct route{'s' if len(options) > 1 else ''} found for this "
            "corridor: other roads were near-duplicates or long detours."
        )
    result = RouteOptions(options, warnings)
    if not incomplete:  # so the next request retries the lookup
        cache.set(key, result, CACHE_TTL_S)
    return result


def _via_town_routes(
    origin: Coord, destination: Coord, kept: list[OsrmRoute]
) -> tuple[list[tuple[OsrmRoute, str]], bool]:
    """Accepted (route, town) pairs, and whether an OSRM failure or the time budget cut it short.

    Extra routes are optional, so the plan goes ahead with whatever was found.
    """
    deadline = time.monotonic() + ALTERNATIVES_BUDGET_S
    fastest_s = min(route.duration_s for route in kept)
    footprints = [alternatives.footprint(route.coords) for route in kept]
    towns, countries = _nearest_towns(origin, destination)

    added: list[tuple[OsrmRoute, str]] = []
    tried: set[Coord] = set()
    for offset, town in towns:
        if len(kept) + len(added) >= TARGET_ROUTES:
            break
        if town is None or town.coord in tried:
            continue
        if countries and town.country not in countries:
            # A detour into another country means two border crossings no driver would plan.
            logger.info("Skipped %s: outside %s", town.label, "/".join(sorted(countries)))
            continue
        if time.monotonic() > deadline:
            logger.warning("Alternative routes ran out of time after %d found", len(added))
            return added, True
        tried.add(town.coord)
        try:
            # One at a time: the public OSRM server asks for at most 1 request/second.
            candidate = osrm.route_via(origin, town.coord, destination)
        except ProviderError:
            logger.warning("Route via %s failed", town.label, exc_info=True)
            return added, True
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
    return added, False


def _nearest_towns(
    origin: Coord, destination: Coord
) -> tuple[list[tuple[float, Town | None]], set[str]]:
    """Town nearest each via-point, and the countries of the trip's ends.

    An end with no town nearby adds no country.
    """
    crow_km = haversine_mi(origin, destination) * KM_PER_MI
    radius_km = max(MIN_TOWN_RADIUS_KM, TOWN_RADIUS_SHARE * crow_km)
    towns = [
        (offset, nearest_town(alternatives.via_point(origin, destination, offset), radius_km))
        for offset in alternatives.VIA_OFFSETS
    ]
    ends = (nearest_town(end, MIN_TOWN_RADIUS_KM) for end in (origin, destination))
    return towns, {town.country for town in ends if town}
