"""Weather grid around the routes, coarse enough to stay within the weather budget."""

import math
from dataclasses import dataclass
from itertools import pairwise

from trips.domain.geo import Coord, haversine_mi

KM_PER_MI = 1.609344
CORRIDOR_KM = 50  # each side of the route
# Open-Meteo's free tier allows ~600 locations/min for all users together; a plan
# can take up to 240 (trip_planning.MAX_CHECKPOINTS), so a heatmap gets 120 to leave room.
MAX_CELLS = 120
CELL_SIZES_DEG = (0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1.0)


@dataclass(frozen=True)
class Grid:
    cell_deg: float  # square in degrees, so the map draws each cell from its centre
    centers: list[Coord]  # south to north, then west to east


def corridor_grid(lines: list[list[Coord]], max_cells: int = MAX_CELLS) -> Grid:
    """The finest grid that covers the corridor in at most `max_cells` cells."""
    if not lines or any(len(line) < 2 for line in lines):
        raise ValueError("need at least one line of two or more points")
    for cell_deg in CELL_SIZES_DEG:
        centers = _cells_near(lines, cell_deg)
        if len(centers) <= max_cells:
            break
    return Grid(cell_deg, centers)


def _cells_near(lines: list[list[Coord]], cell_deg: float) -> list[Coord]:
    corridor_mi = CORRIDOR_KM / KM_PER_MI
    reach_lat = math.ceil(CORRIDOR_KM / 111 / cell_deg)
    samples = set().union(*(_samples(line, cell_deg / 2) for line in lines))
    found: set[tuple[int, int]] = set()
    for lon, lat in samples:
        reach_lon = math.ceil(reach_lat / max(math.cos(math.radians(lat)), 0.1))
        i0, j0 = math.floor(lon / cell_deg), math.floor(lat / cell_deg)
        for i in range(i0 - reach_lon, i0 + reach_lon + 1):
            for j in range(j0 - reach_lat, j0 + reach_lat + 1):
                if (i, j) not in found and (
                    haversine_mi(_center(i, j, cell_deg), (lon, lat)) <= corridor_mi
                ):
                    found.add((i, j))
    return [_center(i, j, cell_deg) for i, j in sorted(found, key=lambda ij: (ij[1], ij[0]))]


def _center(i: int, j: int, cell_deg: float) -> Coord:
    return (round((i + 0.5) * cell_deg, 4), round((j + 0.5) * cell_deg, 4))


def _samples(line: list[Coord], step_deg: float) -> set[Coord]:
    """Points at most `step_deg` apart along the line, snapped to a grid so overlaps collapse."""
    samples = set()
    for (x1, y1), (x2, y2) in pairwise(line):
        steps = max(1, math.ceil(max(abs(x2 - x1), abs(y2 - y1)) / step_deg))
        for k in range(steps + 1):
            lon, lat = x1 + (x2 - x1) * k / steps, y1 + (y2 - y1) * k / steps
            samples.add((round(lon / step_deg) * step_deg, round(lat / step_deg) * step_deg))
    return samples
