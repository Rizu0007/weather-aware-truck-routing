"""Via-points and acceptance rules for extra routes (tuned in scripts/tune_alternatives.py)."""

import math

from trips.domain.geo import Coord

# Fractions of the crow-flies distance.
VIA_OFFSETS = (0.15, -0.15, 0.25, -0.25)
# Share of footprint shared with a kept route above which a candidate is a duplicate.
MAX_OVERLAP = 0.8
# Slower than this multiple of the fastest route is an unreasonable detour.
MAX_DETOUR = 1.5
# Footprint cell size (~1 km).
CELL_DEG = 0.01


def via_point(origin: Coord, destination: Coord, offset: float) -> Coord:
    """Point `offset` x line length beside the midpoint; positive is left of travel."""
    # Scale longitudes by cos(lat) so the offset is perpendicular on the ground.
    k = math.cos(math.radians((origin[1] + destination[1]) / 2))
    dx, dy = (destination[0] - origin[0]) * k, destination[1] - origin[1]
    mid_lon, mid_lat = (origin[0] + destination[0]) / 2, (origin[1] + destination[1]) / 2
    return (mid_lon - dy * offset / k, mid_lat + dx * offset)


def footprint(coords: list[Coord]) -> frozenset[tuple[int, int]]:
    """Grid cells a route passes through."""
    return frozenset(
        (math.floor(lon / CELL_DEG), math.floor(lat / CELL_DEG)) for lon, lat in coords
    )


def overlap(candidate: frozenset, other: frozenset) -> float:
    """Share of the candidate's footprint that `other` also covers (0-1)."""
    return len(candidate & other) / len(candidate) if candidate else 1.0


def is_acceptable(
    candidate: frozenset,
    candidate_seconds: float,
    kept: list[frozenset],
    fastest_seconds: float,
) -> bool:
    if candidate_seconds > MAX_DETOUR * fastest_seconds:
        return False
    return all(overlap(candidate, other) <= MAX_OVERLAP for other in kept)
