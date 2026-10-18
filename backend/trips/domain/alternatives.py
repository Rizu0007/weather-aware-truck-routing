"""Rules for generating and accepting alternative routes.

The public OSRM server returns only 1-2 routes, so extra candidates are forced
through a via-point beside the direct line (API_NOTES.md, section 1). The
thresholds below come from scripts/tune_alternatives.py.
"""

import math

from trips.domain.geo import Coord

# Perpendicular offsets of the via-point, as a fraction of the crow-flies distance.
VIA_OFFSETS = (0.15, -0.15, 0.25, -0.25)
# A candidate sharing more than this share of its footprint with a kept route is a duplicate.
MAX_OVERLAP = 0.8
# A candidate slower than this multiple of the fastest route is an unreasonable detour.
MAX_DETOUR = 1.5
# Footprint cell size (~1 km).
CELL_DEG = 0.01


def via_point(origin: Coord, destination: Coord, offset: float) -> Coord:
    """Point beside the midpoint of the origin-destination line.

    `offset` is the distance from the midpoint as a fraction of the line length;
    positive is to the left when facing the destination. Longitudes are scaled
    by cos(latitude) so the offset is perpendicular on the ground, not on the grid.
    """
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
    """A candidate must be distinct from every kept route and not a long detour."""
    if candidate_seconds > MAX_DETOUR * fastest_seconds:
        return False
    return all(overlap(candidate, other) <= MAX_OVERLAP for other in kept)
