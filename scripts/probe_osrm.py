"""Probe the OSRM public demo server (routing). Keyless.

Run: python3 scripts/probe_osrm.py
"""

from probe_lib import call, rate_limit_headers, show

BASE = "https://router.project-osrm.org/route/v1"
DALLAS = (-96.7970, 32.7767)
HOUSTON = (-95.3698, 29.7604)
CHICAGO = (-87.6298, 41.8781)
DENVER = (-104.9903, 39.7392)
HONOLULU = (-157.8583, 21.3069)
LOS_ANGELES = (-118.2437, 34.0522)

ROUTE_PARAMS = {
    "overview": "full",
    "geometries": "geojson",
    "annotations": "duration,distance",
    "steps": "false",
}


def path(*points):
    return ";".join(f"{lon},{lat}" for lon, lat in points)


def summarize(data):
    if not data:
        return
    show("code", data.get("code"))
    show("message", data.get("message"))
    for i, r in enumerate(data.get("routes", [])):
        coords = r["geometry"]["coordinates"]
        ann_dur = sum(len(leg["annotation"]["duration"]) for leg in r["legs"])
        ann_dist = sum(len(leg["annotation"]["distance"]) for leg in r["legs"])
        show(
            f"route[{i}]",
            f"{r['distance'] / 1609.344:.1f} mi, {r['duration'] / 3600:.2f} h, legs={len(r['legs'])}, "
            f"coords={len(coords)}, annotation durations={ann_dur}, distances={ann_dist}, "
            f"weight_name={r.get('weight_name')}",
        )
    if "waypoints" in data:
        for w in data["waypoints"]:
            show("waypoint", f"name={w.get('name')!r} snapped={w['location']} distance_from_input={w.get('distance'):.1f} m")


print("== OSRM: endpoints we need ==")
for name, points in [
    ("osrm_route_short_alternatives", (DALLAS, HOUSTON)),
    ("osrm_route_long_alternatives", (CHICAGO, DENVER)),
]:
    status, data, headers = call(name, f"{BASE}/driving/{path(*points)}", {**ROUTE_PARAMS, "alternatives": "3"})
    summarize(data)
    show("rate-limit headers", rate_limit_headers(headers))

# A via-point offset to the west of the Dallas-Houston line (our fallback for getting 3 routes).
status, data, _ = call(
    "osrm_route_via_point",
    f"{BASE}/driving/{path(DALLAS, (-96.9, 31.0), HOUSTON)}",
    {**ROUTE_PARAMS, "alternatives": "false"},
)
summarize(data)

print("\n== OSRM: failure cases ==")
status, data, _ = call("osrm_error_invalid_coordinate", f"{BASE}/driving/{path(DALLAS, (-95.37, 200.0))}", ROUTE_PARAMS)
summarize(data)

status, data, _ = call("osrm_error_no_route", f"{BASE}/driving/{path(HONOLULU, LOS_ANGELES)}", ROUTE_PARAMS)
summarize(data)

status, data, _ = call("osrm_error_bad_param", f"{BASE}/driving/{path(DALLAS, HOUSTON)}", {**ROUTE_PARAMS, "overview": "bogus"})
summarize(data)

status, data, _ = call("osrm_error_unknown_profile", f"{BASE}/truck/{path(DALLAS, HOUSTON)}", {**ROUTE_PARAMS, "alternatives": "false"})
summarize(data)

status, data, _ = call("osrm_edge_same_point", f"{BASE}/driving/{path(DALLAS, DALLAS)}", ROUTE_PARAMS)
summarize(data)

status, data, _ = call(
    "osrm_edge_alternatives_with_via",
    f"{BASE}/driving/{path(DALLAS, (-96.9, 31.0), HOUSTON)}",
    {**ROUTE_PARAMS, "alternatives": "3"},
)
summarize(data)

print("\n== OSRM: timeout ==")
call("osrm_timeout", f"{BASE}/driving/{path(CHICAGO, DENVER)}", ROUTE_PARAMS, timeout=0.05, save=False)

print("\nRate limit: not triggered deliberately (shared public demo server; usage policy asks for <= 1 req/s).")
