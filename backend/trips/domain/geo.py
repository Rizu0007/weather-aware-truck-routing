"""Geometry helpers on polylines. Coordinates are (lon, lat) pairs, as in GeoJSON."""

import math
from bisect import bisect_right
from itertools import pairwise

EARTH_RADIUS_MI = 3958.8

Coord = tuple[float, float]


def haversine_mi(a: Coord, b: Coord) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(min(1.0, h)))


def cumulative_miles(coords: list[Coord]) -> list[float]:
    """Distance from the start, in miles, at every vertex."""
    out = [0.0]
    for a, b in pairwise(coords):
        out.append(out[-1] + haversine_mi(a, b))
    return out


def locate(cum_miles: list[float], mile: float) -> tuple[int, float]:
    """Segment index containing `mile` and the fraction (0-1) along that segment.

    Miles outside the line are clamped to its ends.
    """
    last_segment = len(cum_miles) - 2
    if mile <= 0:
        return 0, 0.0
    if mile >= cum_miles[-1]:
        return last_segment, 1.0
    i = min(bisect_right(cum_miles, mile) - 1, last_segment)
    length = cum_miles[i + 1] - cum_miles[i]
    return i, 0.0 if length == 0 else (mile - cum_miles[i]) / length


def point_at_mile(coords: list[Coord], cum_miles: list[float], mile: float) -> Coord:
    i, t = locate(cum_miles, mile)
    (x1, y1), (x2, y2) = coords[i], coords[i + 1]
    return (x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)


def slice_line(
    coords: list[Coord], cum_miles: list[float], start_mi: float, end_mi: float
) -> list[Coord]:
    """Sub-polyline between two mile markers, interpolated at both ends."""
    i, _ = locate(cum_miles, start_mi)
    j, _ = locate(cum_miles, end_mi)
    start = point_at_mile(coords, cum_miles, start_mi)
    end = point_at_mile(coords, cum_miles, end_mi)
    return [start, *coords[i + 1 : j + 1], end]


def simplify(coords: list[Coord], tolerance_deg: float) -> list[Coord]:
    """Douglas-Peucker simplification (iterative), always keeping both endpoints."""
    if len(coords) < 3:
        return list(coords)
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    stack = [(0, len(coords) - 1)]
    tolerance_sq = tolerance_deg * tolerance_deg
    while stack:
        first, last = stack.pop()
        (ax, ay), (bx, by) = coords[first], coords[last]
        dx, dy = bx - ax, by - ay
        norm = dx * dx + dy * dy
        worst_sq, worst = 0.0, -1
        for k in range(first + 1, last):
            px, py = coords[k]
            t = 0.0 if norm == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / norm))
            dist_sq = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if dist_sq > worst_sq:
                worst_sq, worst = dist_sq, k
        if worst_sq > tolerance_sq:
            keep[worst] = True
            stack.extend([(first, worst), (worst, last)])
    return [c for c, kept in zip(coords, keep, strict=True) if kept]
