"""Measure the weather-fetching parameters we'd otherwise guess.

  1. Model grid resolution: how far apart two points must be to get different forecasts
     (decides how coarsely we can round coordinates for de-duplication and caching).
  2. Locations per request: does a single GET with 300 / 600 locations work, and how fast.
  3. Concurrency: 4 parallel 100-location requests vs sequential.
  4. Weather locations a plan needs (checkpoints + heatmap grid), from the cached tuning routes,
     compared with the free-tier limit of 600 calls/minute.

Run: python3 scripts/tune_weather.py
"""

import json
import math
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

from probe_lib import USER_AGENT
from tune_routes import TRIPS, hav, osrm

OUT = Path(__file__).parent / "samples" / "tuning_weather.json"
BASE = "https://api.open-meteo.com/v1/forecast"
HOURLY = "wind_speed_10m,rain,showers,snowfall"
KM_PER_DEG_LAT = 111.32

start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


def fetch(lats, lons, hours=49):
    params = {
        "latitude": ",".join(f"{x:.4f}" for x in lats),
        "longitude": ",".join(f"{x:.4f}" for x in lons),
        "hourly": HOURLY,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "start_hour": start.strftime("%Y-%m-%dT%H:%M"),
        "end_hour": (start + timedelta(hours=hours - 1)).strftime("%Y-%m-%dT%H:%M"),
    }
    url = BASE + "?" + urllib.parse.urlencode(params, safe=",:")
    began = time.perf_counter()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=60) as r:
            status, body = r.status, r.read()
    except urllib.error.HTTPError as exc:
        status, body = exc.code, exc.read()
    elapsed = time.perf_counter() - began
    data = json.loads(body) if body[:1] in (b"[", b"{") else None
    return status, data, elapsed, len(url), len(body)


def grid_resolution():
    # 41 points every 0.01 deg (~1.1 km) north from Dallas, and the same east.
    results = {}
    for axis in ("lat", "lon"):
        lats = [32.70 + (i * 0.01 if axis == "lat" else 0) for i in range(41)]
        lons = [-96.80 + (i * 0.01 if axis == "lon" else 0) for i in range(41)]
        status, data, *_ = fetch(lats, lons, hours=1)
        cells = [(d["latitude"], d["longitude"]) for d in data]
        changes = sum(1 for a, b in zip(cells, cells[1:]) if a != b)
        spacing_km = 0.4 * KM_PER_DEG_LAT * (math.cos(math.radians(32.7)) if axis == "lon" else 1) / max(changes, 1)
        results[axis] = {"unique_model_cells": len(set(cells)), "approx_cell_km": round(spacing_km, 1)}
        print(f"  along {axis}: 41 points over 0.40 deg -> {len(set(cells))} model cells (~{spacing_km:.1f} km each)")
    return results


def batch_limits():
    results = {}
    for n in (300, 600):
        lats = [30 + (i // 25) * 0.3 for i in range(n)]
        lons = [-100 + (i % 25) * 0.3 for i in range(n)]
        status, data, elapsed, url_len, size = fetch(lats, lons)
        reason = data.get("reason") if isinstance(data, dict) else None
        count = len(data) if isinstance(data, list) else 0
        results[n] = {"status": status, "seconds": round(elapsed, 2), "url_chars": url_len, "kb": size // 1024,
                      "locations_returned": count, "reason": reason}
        print(f"  {n} locations: HTTP {status} in {elapsed:.2f}s, URL {url_len:,} chars, {size // 1024} KB, "
              f"returned {count}{' reason=' + reason if reason else ''}")
        time.sleep(65)  # let the per-minute budget recover between big requests
    return results


def concurrency():
    batches = [([30 + (i // 10) * 0.5 + b * 5 for i in range(100)], [-100 + (i % 10) * 0.5 for i in range(100)]) for b in range(4)]
    began = time.perf_counter()
    with ThreadPoolExecutor(4) as pool:
        out = list(pool.map(lambda b: fetch(*b), batches))
    parallel = time.perf_counter() - began
    statuses = [o[0] for o in out]
    print(f"  4 x 100 locations in parallel: {parallel:.2f}s total, statuses {statuses}, "
          f"individual {[round(o[2], 2) for o in out]}")
    return {"parallel_seconds": round(parallel, 2), "statuses": statuses, "individual_seconds": [round(o[2], 2) for o in out]}


def locations_per_plan():
    """Upper bound: 3 routes x checkpoints at 10 mi, plus a 50 km corridor heatmap grid."""
    results = {}
    for name, (o, d) in TRIPS.items():
        data, _, _ = osrm([o, d], 3)
        coords = data["routes"][0]["geometry"]["coordinates"]
        miles = data["routes"][0]["distance"] / 1609.344
        row = {"route_miles": round(miles)}
        for interval in (10, 25, 50):
            row[f"checkpoints_3_routes_{interval}mi"] = 3 * (int(miles // interval) + 2)
        for spacing_deg in (0.15, 0.25, 0.4):
            buffer_km = 50
            lat_step = spacing_deg
            mid = math.radians((o[1] + d[1]) / 2)
            lon_step = spacing_deg / math.cos(mid)
            reach = math.ceil(buffer_km / (spacing_deg * KM_PER_DEG_LAT))
            grid = set()
            for lon, lat in coords[::10]:
                i, j = round(lat / lat_step), round(lon / lon_step)
                for di in range(-reach, reach + 1):
                    for dj in range(-reach, reach + 1):
                        if math.hypot(di, dj) <= reach:
                            grid.add((i + di, j + dj))
            row[f"heatmap_cells_{spacing_deg}deg"] = len(grid)
        results[name] = row
        print(f"  {name:20} {row}")
    return results


def main():
    report = {}
    print("== 1. Model grid resolution ==")
    report["grid_resolution"] = grid_resolution()
    print("\n== 4. Weather locations per plan (computed from cached routes, no API calls) ==")
    report["locations_per_plan"] = locations_per_plan()
    print("\n== 3. Concurrency ==")
    report["concurrency"] = concurrency()
    time.sleep(65)
    print("\n== 2. Locations per request ==")
    report["batch_limits"] = batch_limits()
    OUT.write_text(json.dumps(report, indent=2))
    print(f"\nSaved {OUT}")


if __name__ == "__main__":
    main()
