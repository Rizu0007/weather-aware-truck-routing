"""Nearest town to a point, from a bundled list: via-points for extra routes, with no network call.

The list is every US, Canadian and Mexican town or city of 1,000+ people from GeoNames
(CC BY 4.0), built by scripts/build_towns.py. Towns sit on through-roads, so a route forced
through one stays on real roads.
"""

import csv
import gzip
import io
import math
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from trips.domain.geo import Coord, haversine_mi

DATA = Path(__file__).resolve().parent.parent / "data" / "towns.tsv.gz"
KM_PER_MI = 1.609344
CELL_DEG = 1.0  # index cell size
KM_PER_DEG_LAT = 111.0


@dataclass(frozen=True)
class Town:
    label: str  # e.g. "Winnsboro, Texas" or "Kingston, Ontario, CA"
    lon: float
    lat: float
    country: str  # ISO code, e.g. "US"

    @property
    def coord(self) -> Coord:
        return (self.lon, self.lat)


def _label(name: str, state: str, country: str) -> str:
    return ", ".join(p for p in (name, state, country if country != "US" else "") if p)


def _cell(lon: float, lat: float) -> tuple[int, int]:
    return math.floor(lon / CELL_DEG), math.floor(lat / CELL_DEG)


@cache
def _index() -> dict[tuple[int, int], list[Town]]:
    """Towns by 1° cell, loaded once per process (~27,000 towns, a few milliseconds)."""
    cells: dict[tuple[int, int], list[Town]] = {}
    with io.TextIOWrapper(gzip.open(DATA), encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            town = Town(
                _label(row["name"], row["state"], row["country"]),
                float(row["lon"]),
                float(row["lat"]),
                row["country"],
            )
            cells.setdefault(_cell(town.lon, town.lat), []).append(town)
    return cells


def nearest_town(point: Coord, radius_km: float) -> Town | None:
    """Closest town to `point` within `radius_km`, if any."""
    lon, lat = point
    dlat = radius_km / KM_PER_DEG_LAT
    dlon = dlat / max(math.cos(math.radians(lat)), 0.01)
    (x0, y0), (x1, y1) = _cell(lon - dlon, lat - dlat), _cell(lon + dlon, lat + dlat)
    index = _index()
    best, best_mi = None, radius_km / KM_PER_MI
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            for town in index.get((x, y), ()):
                if (miles := haversine_mi(point, town.coord)) <= best_mi:
                    best, best_mi = town, miles
    return best
