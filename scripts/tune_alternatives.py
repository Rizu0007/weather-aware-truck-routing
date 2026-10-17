"""Compare two ways of forcing alternative routes through a via-point.

  raw  - the offset point itself (OSRM snaps it to the nearest road, often a dirt/county road)
  town - the nearest town/city to the offset point (Photon reverse geocode), which sits on through-roads

A candidate is "usable" if it is not a near-duplicate of a route we already have
(overlap <= MAX_OVERLAP) and not an absurd detour (<= MAX_DETOUR x fastest).
Reuses tune_routes.py's OSRM cache. Run: python3 scripts/tune_alternatives.py
"""

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from probe_lib import USER_AGENT
from tune_routes import TRIPS, backtrack_ratio, cells, hav, osrm, via_point

OUT = Path(__file__).parent / "samples" / "tuning_alternatives.json"
OFFSETS = (0.15, -0.15, 0.25, -0.25)
MAX_OVERLAP = 0.8
MAX_DETOUR = 1.5
KM_PER_MI = 1.609344


def nearest_town(point, radius_km):
    params = [("lon", point[0]), ("lat", point[1]), ("radius", round(radius_km)), ("limit", 1),
              ("osm_tag", "place:town"), ("osm_tag", "place:city")]
    url = "https://photon.komoot.io/reverse?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=20) as r:
        features = json.loads(r.read())["features"]
    time.sleep(0.5)
    if not features:
        return None, None
    f = features[0]
    return tuple(f["geometry"]["coordinates"]), f["properties"].get("name")


def evaluate(o, d, via, routes):
    data, _, _ = osrm([o, via, d], "false")
    if data.get("code") != "Ok":
        return {"code": data.get("code")}
    r = data["routes"][0]
    c = cells(r["geometry"]["coordinates"])
    fastest = min(x["duration"] for x in routes)
    overlap = max(len(c & cells(x["geometry"]["coordinates"])) / len(c) for x in routes)
    detour = r["duration"] / fastest
    return {
        "hours": round(r["duration"] / 3600, 2),
        "detour": round(detour, 2),
        "overlap": round(overlap, 2),
        "backtrack": round(backtrack_ratio(r["geometry"]["coordinates"]), 2),
        "usable": overlap <= MAX_OVERLAP and detour <= MAX_DETOUR,
        "_route": r,
    }


def main():
    report, totals = {}, {"raw": 0, "town": 0}
    for name, (o, d) in TRIPS.items():
        data, _, _ = osrm([o, d], 3)
        crow_km = hav(o, d) * KM_PER_MI
        result = {"native": len(data["routes"]), "raw": [], "town": []}
        # Accumulate as a real implementation would: each accepted route joins the comparison set.
        for strategy in ("raw", "town"):
            routes = list(data["routes"])
            for f in OFFSETS:
                if len(routes) >= 3:
                    break
                point = via_point(o, d, f)
                label = f"{f:+.2f}"
                if strategy == "town":
                    point, town = nearest_town(point, radius_km=max(20, 0.12 * crow_km))
                    if point is None:
                        result[strategy].append({"offset": f, "town": None})
                        continue
                    label += f" {town}"
                row = evaluate(o, d, point, routes)
                if row.get("usable"):
                    routes.append(row["_route"])
                row.pop("_route", None)
                row["offset"] = label
                result[strategy].append(row)
            result[f"{strategy}_total_routes"] = len(routes)
            totals[strategy] += len(routes) >= 3

        print(f"\n=== {name}: native {result['native']}")
        for strategy in ("raw", "town"):
            print(f"  {strategy}: reached {result[f'{strategy}_total_routes']} routes")
            for row in result[strategy]:
                print(f"     {row}")
        report[name] = result

    print(f"\nTrips reaching 3 routes: raw {totals['raw']}/{len(TRIPS)}, town {totals['town']}/{len(TRIPS)}")
    OUT.write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
