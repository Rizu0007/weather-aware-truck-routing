"""Up to three distinct routes: OSRM's own, then routes forced through nearby towns.

Towns, not raw offset points: a raw point snaps to whatever road is nearest,
often a dirt road, while towns sit on through-roads.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, wait
from dataclasses import dataclass

from django.core.cache import cache

from trips.domain import alternatives
from trips.domain.geo import Coord, haversine_mi
from trips.exceptions import ProviderError
from trips.integrations import osrm, photon
from trips.integrations.osrm import OsrmRoute
from trips.integrations.photon import Place

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
# Town lookups take under a second normally; a stalled one mustn't use up the routing time.
TOWN_LOOKUP_SHARE = 0.4


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
    """Accepted (route, town) pairs, and whether the search was cut short.

    Extra routes are optional: a failed lookup, or running out of time on slow
    public servers, ends the search with what has been found instead of failing the plan.
    """
    deadline = time.monotonic() + ALTERNATIVES_BUDGET_S
    fastest_s = min(route.duration_s for route in kept)
    footprints = [alternatives.footprint(route.coords) for route in kept]
    towns, cut_short = _nearest_towns(
        origin, destination, timeout=ALTERNATIVES_BUDGET_S * TOWN_LOOKUP_SHARE
    )

    added: list[tuple[OsrmRoute, str]] = []
    tried: set[Coord] = set()
    for offset, town in towns:
        if len(kept) + len(added) >= TARGET_ROUTES:
            break
        if town is None or town.coord in tried:
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
    return added, cut_short


def _nearest_towns(
    origin: Coord, destination: Coord, timeout: float
) -> tuple[list[tuple[float, Place | None]], bool]:
    """Town nearest each via-point, looked up in parallel. Failed or late lookups give None."""
    crow_km = haversine_mi(origin, destination) * KM_PER_MI
    radius_km = max(MIN_TOWN_RADIUS_KM, TOWN_RADIUS_SHARE * crow_km)
    pool = ThreadPoolExecutor(max_workers=len(alternatives.VIA_OFFSETS))
    futures = {
        offset: pool.submit(
            photon.nearest_town, alternatives.via_point(origin, destination, offset), radius_km
        )
        for offset in alternatives.VIA_OFFSETS
    }
    wait(futures.values(), timeout=timeout)
    pool.shutdown(wait=False, cancel_futures=True)  # don't wait for a stalled lookup

    towns: list[tuple[float, Place | None]] = []
    cut_short = False
    for offset, future in futures.items():
        if not future.done() or future.exception() is not None:
            cut_short = True
            logger.warning("Town lookup for offset %+.2f failed or timed out", offset)
            towns.append((offset, None))
        else:
            towns.append((offset, future.result()))
    return towns, cut_short
