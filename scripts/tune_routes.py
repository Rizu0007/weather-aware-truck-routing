"""Measure the routing parameters we'd otherwise guess.

For a set of varied US trips:
  1. How many routes OSRM `alternatives=3` actually returns.
  2. For via-point offsets (fraction of crow-flies distance, perpendicular at the midpoint):
     detour ratio vs the fastest route, overlap with existing routes, and backtracking.
  3. Effect of a truck speed cap on travel time.
  4. Checkpoint counts and weather-location counts per sampling interval.

Raw OSRM responses are cached in scripts/.cache/ (git-ignored) so re-runs don't hit the server.
Run: python3 scripts/tune_routes.py
"""

import json
import math
import time
from pathlib import Path

from probe_lib import USER_AGENT
import urllib.request

CACHE = Path(__file__).parent / ".cache"
OUT = Path(__file__).parent / "samples" / "tuning_routes.json"
BASE = "https://router.project-osrm.org/route/v1/driving"
PARAMS = "overview=full&geometries=geojson&annotations=duration&steps=false"

TRIPS = {
    "Dallas-Houston": ((-96.797, 32.7767), (-95.3698, 29.7604)),
    "Chicago-Denver": ((-87.6298, 41.8781), (-104.9903, 39.7392)),
    "LosAngeles-Phoenix": ((-118.2437, 34.0522), (-112.074, 33.4484)),
    "Atlanta-Nashville": ((-84.388, 33.749), (-86.7816, 36.1627)),
    "Seattle-Portland": ((-122.3321, 47.6062), (-122.6765, 45.5231)),
    "NewYork-Pittsburgh": ((-74.006, 40.7128), (-79.9959, 40.4406)),
    "SaltLake-Denver": ((-111.891, 40.7608), (-104.9903, 39.7392)),
    "KansasCity-StLouis": ((-94.5786, 39.0997), (-90.1994, 38.627)),
}
OFFSETS = (0.1, -0.1, 0.2, -0.2, 0.3, -0.3)
SPEED_CAPS_MPH = (60, 65, 70)
INTERVALS_MI = (10, 25, 50)
EARTH_MI = 3958.8


def osrm(points, alternatives):
    path = ";".join(f"{lon:.5f},{lat:.5f}" for lon, lat in points)
    key = CACHE / (path.replace(";", "_").replace(",", "~") + f"_{alternatives}.json")
    if key.exists():
        return json.loads(key.read_text()), 0.0, key.stat().st_size
    url = f"{BASE}/{path}?{PARAMS}&alternatives={alternatives}"
    started = time.perf_counter()
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=30) as r:
        body = r.read()
    elapsed = time.perf_counter() - started
    CACHE.mkdir(exist_ok=True)
    key.write_bytes(body)
    time.sleep(1.0)  # public demo server: stay at <= 1 req/s
    return json.loads(body), elapsed, len(body)


def hav(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_MI * math.asin(math.sqrt(min(1, h)))


def cells(coords, deg=0.01):
    return {(math.floor(x / deg), math.floor(y / deg)) for x, y in coords}


def backtrack_ratio(coords, deg=0.01):
    """Unique cells / cell visits. 1.0 = never re-enters a cell; lower = drives back on itself."""
    visits, prev = 0, None
    for x, y in coords:
        c = (math.floor(x / deg), math.floor(y / deg))
        if c != prev:
            visits, prev = visits + 1, c
    return len(cells(coords, deg)) / visits


def via_point(o, d, f):
    kx = math.cos(math.radians((o[1] + d[1]) / 2))
    dx, dy = (d[0] - o[0]) * kx, d[1] - o[1]
    mx, my = (o[0] + d[0]) / 2, (o[1] + d[1]) / 2
    return (mx - dy * f / kx, my + dx * f)


def route_stats(r):
    coords = r["geometry"]["coordinates"]
    secs = [s for leg in r["legs"] for s in leg["annotation"]["duration"]]
    seg_mi = [hav(a, b) for a, b in zip(coords, coords[1:])]
    return coords, secs, seg_mi


def capped_hours(secs, seg_mi, cap):
    return sum(max(s, m / cap * 3600) for s, m in zip(secs, seg_mi)) / 3600


def main():
    report = {}
    for name, (o, d) in TRIPS.items():
        data, elapsed, size = osrm([o, d], 3)
        routes = data["routes"]
        fastest_h = min(r["duration"] for r in routes) / 3600
        footprints = [cells(r["geometry"]["coordinates"]) for r in routes]
        crow = hav(o, d)
        print(f"\n=== {name}: crow {crow:.0f} mi, alternatives returned: {len(routes)} "
              f"({elapsed:.2f}s, {size / 1024:.0f} KB)")
        for i, r in enumerate(routes):
            print(f"    native[{i}] {r['distance'] / 1609.344:.0f} mi {r['duration'] / 3600:.2f} h "
                  f"coords={len(r['geometry']['coordinates'])}")

        vias = []
        for f in OFFSETS:
            vdata, velapsed, _ = osrm([o, via_point(o, d, f), d], "false")
            if vdata.get("code") != "Ok":
                vias.append({"offset": f, "code": vdata.get("code")})
                print(f"    via {f:+.1f}: {vdata.get('code')}")
                continue
            r = vdata["routes"][0]
            c = cells(r["geometry"]["coordinates"])
            overlap = max(len(c & fp) / len(c) for fp in footprints)
            snap_m = vdata["waypoints"][1]["distance"]
            row = {
                "offset": f,
                "miles": round(r["distance"] / 1609.344, 1),
                "hours": round(r["duration"] / 3600, 2),
                "detour_ratio": round(r["duration"] / 3600 / fastest_h, 3),
                "overlap_with_native": round(overlap, 3),
                "backtrack_ratio": round(backtrack_ratio(r["geometry"]["coordinates"]), 3),
                "via_snap_distance_m": round(snap_m),
                "via_road": vdata["waypoints"][1]["name"],
            }
            vias.append(row)
            print(f"    via {f:+.1f}: {row['miles']:.0f} mi {row['hours']:.2f} h detour x{row['detour_ratio']:.2f} "
                  f"overlap {row['overlap_with_native']:.2f} backtrack {row['backtrack_ratio']:.2f} "
                  f"snap {row['via_snap_distance_m']} m road={row['via_road']!r}")

        coords, secs, seg_mi = route_stats(routes[0])
        total_mi = sum(seg_mi)
        osrm_h = sum(secs) / 3600
        fast_segment_mi = sum(m for s, m in zip(secs, seg_mi) if s > 0 and m / (s / 3600) > 65)
        caps = {cap: round(capped_hours(secs, seg_mi, cap), 2) for cap in SPEED_CAPS_MPH}
        print(f"    speed: OSRM {osrm_h:.2f} h avg {total_mi / osrm_h:.0f} mph; "
              f"{fast_segment_mi / total_mi:.0%} of miles faster than 65 mph; capped hours {caps}")

        counts = {}
        for interval in INTERVALS_MI:
            n = int(total_mi // interval) + 2
            counts[interval] = n
        print(f"    checkpoints on fastest route at 10/25/50 mi: {counts}")

        report[name] = {
            "crow_miles": round(crow, 1),
            "native_alternatives": len(routes),
            "native_routes": [{"miles": round(r["distance"] / 1609.344, 1), "hours": round(r["duration"] / 3600, 2)} for r in routes],
            "response_kb": round(size / 1024),
            "via_candidates": vias,
            "speed": {"osrm_hours": round(osrm_h, 2), "share_miles_over_65": round(fast_segment_mi / total_mi, 3), "capped_hours": caps},
            "checkpoints_fastest_route": counts,
        }

    OUT.write_text(json.dumps(report, indent=2))
    print(f"\nSaved {OUT}")


if __name__ == "__main__":
    main()
