"""Probe the Photon geocoder (komoot public instance). Keyless.

Run: python3 scripts/probe_photon.py
"""

from probe_lib import call, rate_limit_headers, show

BASE = "https://photon.komoot.io/api/"
# Continental US + Canada + Mexico, minLon,minLat,maxLon,maxLat.
NORTH_AMERICA_BBOX = "-168,14,-52,72"


def summarize(data):
    if data is None:
        return
    if "features" not in data:
        show("body", data)
        return
    show("features", len(data["features"]))
    for f in data["features"][:5]:
        p = f["properties"]
        show(
            "feature",
            f"{p.get('name')!r} | {p.get('city')!r} | {p.get('state')!r} | {p.get('countrycode')!r} | "
            f"type={p.get('type')} osm={p.get('osm_key')}:{p.get('osm_value')} coords={f['geometry']['coordinates']}",
        )


print("== Photon: endpoints we need ==")
status, data, headers = call("photon_search_city", BASE, {"q": "Dallas", "limit": 5, "lang": "en"})
summarize(data)
show("rate-limit headers", rate_limit_headers(headers))

# Partial input, as it arrives from an autocomplete box.
status, data, _ = call("photon_search_partial", BASE, {"q": "Hous", "limit": 5, "lang": "en"})
summarize(data)

status, data, _ = call("photon_search_address", BASE, {"q": "1600 Pennsylvania Ave Washington", "limit": 5, "lang": "en"})
summarize(data)

status, data, _ = call("photon_search_bbox", BASE, {"q": "Paris", "limit": 5, "lang": "en", "bbox": NORTH_AMERICA_BBOX})
summarize(data)

# Reverse lookup used to snap alternative-route via-points to a town on a through-road.
REVERSE = "https://photon.komoot.io/reverse"
TOWN_TAGS = [("osm_tag", "place:town"), ("osm_tag", "place:city")]
# Offset via-point west of the Dallas-Houston line.
status, data, _ = call("photon_reverse_town", REVERSE,
                       [("lon", -96.93), ("lat", 31.0), ("radius", 50), ("limit", 1), *TOWN_TAGS])
summarize(data)
# Cascades offset point for Seattle-Portland: no town within the radius.
status, data, _ = call("photon_reverse_no_town", REVERSE,
                       [("lon", -121.35), ("lat", 46.6), ("radius", 20), ("limit", 1), *TOWN_TAGS])
summarize(data)

print("\n== Photon: failure cases ==")
status, data, _ = call("photon_empty_result", BASE, {"q": "qwxzvbnmplkj", "limit": 5})
summarize(data)

status, data, _ = call("photon_error_missing_q", BASE, {"limit": 5})
summarize(data)

status, data, _ = call("photon_error_bad_limit", BASE, {"q": "Dallas", "limit": "abc"})
summarize(data)

status, data, _ = call("photon_error_unsupported_lang", BASE, {"q": "Dallas", "lang": "xx"})
summarize(data)

print("\n== Photon: timeout ==")
call("photon_timeout", BASE, {"q": "Chicago"}, timeout=0.01, save=False)

print("\nRate limit: not triggered deliberately (public instance; fair-use only, no published number).")
