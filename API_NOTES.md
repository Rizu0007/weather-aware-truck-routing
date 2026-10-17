# API Notes

Findings from the probe and tuning scripts in [`scripts/`](scripts/), run on 2026-10-17/18 UTC.
Everything below was observed in real responses saved under [`scripts/samples/`](scripts/samples/);
where something was *not* observed (e.g. rate limiting) it says so.

| Purpose | Provider | Auth | Probe | Tuning |
|---|---|---|---|---|
| Routing | OSRM public demo | none | `probe_osrm.py` | `tune_routes.py`, `tune_alternatives.py` |
| Weather | Open-Meteo forecast | none (optional `apikey` on paid host) | `probe_open_meteo.py` | `tune_weather.py` |
| Geocoding | Photon (komoot) | none | `probe_photon.py` | `tune_alternatives.py` (reverse) |

---

## 1. OSRM — routing

**Base URL:** `https://router.project-osrm.org` · **Auth:** none · **Typical latency:** 0.7–1.9 s

### Endpoint used

`GET /route/v1/driving/{lon},{lat};{lon},{lat}[;…]`

| Param | Value | Why |
|---|---|---|
| `overview` | `full` | Full-resolution geometry, required for the per-segment annotations to line up |
| `geometries` | `geojson` | Plain `[lon, lat]` arrays, no polyline decoding |
| `annotations` | `duration` | Per-segment seconds, used to compute the ETA at each checkpoint |
| `alternatives` | `3` or `false` | `3` for the direct request, `false` for via-point requests |
| `steps` | `false` | Turn-by-turn not needed; keeps payload small |

Coordinates are **lon,lat** order (GeoJSON), separated by `;`.

### Response shape (fields we use)

```text
{
  code: string                      "Ok" on success
  routes: [{
    distance: number                metres (integer 0 for a zero-length route)
    duration: number                seconds
    geometry: { type: "LineString", coordinates: [[lon, lat], …] }
    legs: [{                        one leg per pair of consecutive waypoints
      distance, duration: number
      annotation: { duration: number[], distance: number[] }   one entry per geometry segment
    }]
    weight_name: "routability"
  }]
  waypoints: [{ location: [lon, lat], name: string, distance: number (m from input to snapped point), hint: string }]
}
```

- Verified on every response: `sum(len(leg.annotation.duration))` equals `len(coordinates) - 1`,
  including two-leg via-point routes. Annotations must be **concatenated across legs**.
- `waypoints[].name` is often `""` (unnamed road).
- Snapping distance was 2–87 m for city inputs, but up to **10.5 km** for an offset via-point in the desert.

### Units, time zones, formats
Metres and seconds. No timestamps anywhere: ETAs are ours to compute from `departure + cumulative duration`.

### Errors (all HTTP 400 with `{ code, message }`)

| Case | `code` | `message` |
|---|---|---|
| Latitude out of range (200) | `InvalidValue` | `Invalid coordinate value.` |
| No road connection (Honolulu→LA) | `NoRoute` | `Impossible route between points` |
| Malformed param (`overview=bogus`) | `InvalidQuery` | `Query string malformed close to position 60` |
| `exclude=motorway` | `InvalidValue` | `Exclude flag combination is not supported.` |
| Client timeout (0.05 s) | — | `URLError: timed out` (no response) |

### Rate limits
No rate-limit headers in any response. Not triggered deliberately: it's a shared demo server
whose usage policy asks for at most 1 request/second. Tuning scripts sleep 1 s between calls.

### Surprises / differences from expectations
1. **`alternatives=3` never returned 3 routes.** Across 8 US trips: 4 returned 1, 4 returned 2
   (Dallas–Houston 1, Chicago–Denver 2, LA–Phoenix 1, Atlanta–Nashville 1, Seattle–Portland 1,
   NY–Pittsburgh 2, Salt Lake–Denver 2, Kansas City–St Louis 2).
2. **Profile name is ignored.** `/route/v1/truck/…` returns HTTP 200 with the identical car route.
   There is no truck profile; durations are car durations.
3. **`alternatives` is silently ignored when there are via-points** (3 waypoints → 1 route, HTTP 200).
4. **`exclude` is not supported** on the demo server.
5. Origin = destination returns `Ok` with a 0-distance, 2-coordinate route (not an error).
6. Responses are large: Chicago–Denver with 2 alternatives was **785 KB** raw.
8. **Per-segment durations don't add up to the route duration.** Across 92 cached routes, `route.duration`
   exceeds `sum(annotation.duration)` by 0.09–1.29 % (32–304 s); distances agree within 0.2 %.
   Likely turn/penalty time that OSRM adds to the total only. Found during C3 (2026-10-18).
   Decision (approved): scale segment times proportionally so the arrival ETA equals `route.duration`.
7. Durations are already conservative: average speed 50–58 mph on every trip and **0 % of miles
   faster than 65 mph**, so a 65 mph truck cap changes nothing (60 mph cap: Salt Lake–Denver +0.12 h).

### Generating the missing alternatives (tuning result)

Force a route through a via-point offset perpendicular to the origin–destination line at its midpoint.

| Via-point strategy | Detour vs fastest (examples) | Trips reaching 3 routes |
|---|---|---|
| Raw offset point | LA–Phoenix ×3.65 (24 h via "Water Road"), Salt Lake–Denver ×1.47, Dallas–Houston ×1.43 | 7 / 8 |
| **Nearest town/city to offset point** | LA–Phoenix ×1.35 (Needles), Salt Lake–Denver ×1.16 (Baggs), Dallas–Houston ×1.21 (Franklin) | 7 / 8 |

Raw points snap to whatever road is nearest (dirt, county, forest roads); towns sit on through-roads.
Seattle–Portland fails with both: every candidate was either ≥87 % overlapping I-5 or ×1.8–2.2 slower.

Thresholds that held up: offsets **±0.15, ±0.25** of crow-flies distance; reject if overlap with an
existing route > **0.8** (≈1 km cell footprint) or duration > **1.5×** fastest. A "backtracking" check
(unique cells / cell visits) ranged 0.86–1.00 and never separated good from bad candidates: dropped.

---

## 2. Open-Meteo — weather

**Base URL:** `https://api.open-meteo.com/v1/forecast` · **Auth:** none
(paid host `customer-api.open-meteo.com` takes `apikey`) · **Typical latency:** 0.7–1.7 s

### Endpoint used

`GET /v1/forecast`

| Param | Value | Notes |
|---|---|---|
| `latitude`, `longitude` | comma-separated lists | Many locations in one request; counts must match |
| `hourly` | `wind_speed_10m,rain,showers,snowfall` | |
| `wind_speed_unit` | `mph` | Default is km/h |
| `precipitation_unit` | `inch` | Default is mm/cm; **also converts snowfall to inches** |
| `timezone` | `GMT` | All times returned in UTC |
| `start_hour`, `end_hour` | `YYYY-MM-DDTHH:MM` | Inclusive both ends; 3 h window → 3 values |

### Response shape

**One location → a JSON object. Several locations → a JSON array** of the same objects, in request order.

```text
{
  latitude, longitude: number       snapped to the model grid, NOT the requested point (32.7767 → 32.784855)
  elevation: number                 metres
  timezone: "GMT", timezone_abbreviation: "GMT", utc_offset_seconds: 0
  generationtime_ms: number
  location_id: number               present on array items 2…n only; missing on the first item and on single responses
  hourly_units: { time: "iso8601", wind_speed_10m: "mp/h", rain: "inch", showers: "inch", snowfall: "inch" }
  hourly: {
    time: string[]                  "2026-10-17T21:00" — no zone suffix, UTC because timezone=GMT
    wind_speed_10m: number[]        mph, sustained wind at 10 m, instantaneous value at that hour
    rain: number[]                  inches, large-scale rain
    showers: number[]               inches, convective showers (rain total = rain + showers)
    snowfall: number[]              inches
  }
}
```

- Arrays are parallel and the same length as `time`.
- **No `null` values were seen** in any probe (including 15 days ahead and 3 days in the past).
  Not proven impossible, so the client should still treat `null` as missing.
- Default units (no unit params): `km/h`, `mm`, `mm`, **`cm`**. With `precipitation_unit=inch`, snowfall is
  reported as `inch` — confirmed in `hourly_units`.

### Forecast window
- **Future:** 7 and 15 days ahead → 200. 17 days → 400
  `Parameter 'start_hour' is out of allowed range from 2026-07-16 to 2026-11-01`
  (i.e. ~3 months back to ~15 days ahead of the run date).
- **Past:** 3 days ago → 200 with data.

### Errors (HTTP 400 with `{ error: true, reason: string }`)

| Case | `reason` |
|---|---|
| Latitude 95 | `Latitude must be in range of -90 to 90°. Given: 95.0.` |
| Unknown hourly variable | `Invalid value: Cannot initialize SurfacePressureAndHeightVariable<…> from invalid String value not_a_variable` |
| 2 latitudes, 1 longitude | `Parameter 'latitude' and 'longitude' must have the same number of elements` |
| `start_hour=tomorrow` | `Bad Request` |
| Beyond horizon | `Parameter 'start_hour' is out of allowed range from … to …` |
| Invalid API key (paid host) | `The supplied API key is invalid.` — **HTTP 400, not 401** |
| URL too long (600 locations, 10,436 chars) | **HTTP 414**, empty body |
| Client timeout (0.01 s) | `URLError: timed out` |

Also seen once: a TLS handshake timeout after 20 s on a normal request; the immediate retry succeeded.
→ Retries are needed for transient network errors.

### Rate limits
No rate-limit headers. 429 not triggered. Not tested against the documented free-tier limits
(600 calls/min, 5,000/hour, 10,000/day), so we don't know how multi-location requests are counted;
we assume **one call per location**, the conservative reading.

### Batching and resolution (tuning result)

| Test | Result |
|---|---|
| 100 locations × 49 h | 200, 1.7 s, 238 KB, URL 1,322 chars |
| 300 locations × 49 h | 200, 1.65 s, 697 KB, URL 5,324 chars |
| 600 locations × 49 h | **414 URI Too Long** at 10,436 chars |
| 4 × 100 locations in parallel | all 200, 3.7 s total (individual 1.4, 1.4, 1.4, 3.7 s) |
| Model grid near Dallas | 41 points 0.01° apart → 14–16 distinct cells ≈ **3 km** grid |

Locations a plan needs (3 routes, worst case without de-duplication; 50 km corridor):

| Trip (fastest route) | Checkpoints @10 / 25 / 50 mi | Heatmap cells @0.15° / 0.25° / 0.4° |
|---|---|---|
| Seattle–Portland (174 mi) | 57 / 24 / 15 | 143 / 56 / 39 |
| Dallas–Houston (238 mi) | 75 / 33 / 18 | 193 / 78 / 56 |
| Salt Lake–Denver (519 mi) | 159 / 66 / 36 | 354 / 150 / 97 |
| Chicago–Denver (1,005 mi) | 306 / 126 / 66 | **680** / 295 / 189 |

Chicago–Denver at 10 mi with a 0.15° grid is ~1,000 locations, over the 600/min free tier.

### Surprises
1. Response type flips between object and array depending on location count.
2. `location_id` is absent on the first location.
3. Returned coordinates are grid-snapped, so they can't be used as lookup keys for the request.
4. Bad API key is a 400, not 401/403.
5. Very long URLs fail with a bare 414 rather than a JSON error.

---

## 3. Photon — geocoding

**Base URL:** `https://photon.komoot.io` · **Auth:** none · **Typical latency:** 0.7–0.9 s

### Endpoints used

| Endpoint | Params | Use |
|---|---|---|
| `GET /api/` | `q`, `limit`, `lang=en`, `bbox=minLon,minLat,maxLon,maxLat` | Origin/destination autocomplete |
| `GET /reverse` | `lon`, `lat`, `radius` (km), `limit`, `osm_tag=place:town`, `osm_tag=place:city` (repeatable) | Snapping alternative-route via-points to towns |

### Response shape (GeoJSON FeatureCollection, both endpoints)

```text
{
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      name: string
      type: string                  "city" | "county" | "house" | …
      osm_key, osm_value: string    e.g. place/city, place/town, office/government
      osm_type: string, osm_id: number
      state, country, countrycode: string
      county?, city?, street?, housenumber?, postcode?, district?: string   all optional
      extent?: [minLon, maxLat, maxLon, minLat]
      extra?: { admin_level: string }
    }
  }]
}
```

- **Optional fields vary per feature.** City results have no `city` property (the name *is* the city);
  the second "Dallas" result had no `county`. Labels must be built from whichever fields exist.
- A plain search returns counties alongside cities ("Dallas" → Dallas city, then 4 Dallas *counties*).

### Errors

| Case | Status | Body |
|---|---|---|
| No match (`qwxzvbnmplkj`) | **200** | `{"type":"FeatureCollection","features":[]}` |
| Missing `q` | 400 | `{"message": "q parameter is required when no include categories are specified"}` |
| `limit=abc` | 400 | `{"limit": [{"message": "TYPE_CONVERSION_FAILED", "args": {}, "value": "abc"}]}` |
| `lang=xx` | 400 | `{"lang": [{"message": "Language is not supported. Supported are: default, de, en, fr", …}]}` |
| Client timeout (0.01 s) | — | `URLError: timed out` |

**Three different error body shapes** — the client should only rely on the status code.

### Rate limits
No headers, not triggered. Public instance is fair-use with no published number → debounce
autocomplete and cache results.

### Surprises
1. Partial input is global: `"Hous"` → Houston TX, then three French villages. `bbox` fixes it
   (`"Paris"` + North America bbox → Paris TX, KY, AR, IL, TN).
2. `layer=city` on `/reverse` returned villages (Bagdad, Wilhoit); `osm_tag=place:town` returned real towns
   (Chino Valley, Prescott Valley). Use `osm_tag`.
3. `/reverse` with a radius can return **no features** (Seattle–Portland offsets inside ~28 km of the Cascades).

---

## 4. Implications for the build

| Finding | Consequence |
|---|---|
| OSRM returns 1–2 routes | Via-point fallback is the normal path, not an edge case |
| Raw via-points create absurd detours | Snap via-points to the nearest town via Photon `/reverse` |
| Some corridors have only one sensible road | UI must handle and explain fewer than 3 routes |
| Segment durations sum 0.1–1.3 % short of route duration | Scale them to the route total before computing ETAs |
| No truck profile; speeds already ≤ 65 mph | Keep a 65 mph cap as a safeguard; document ETAs as car-profile based |
| 785 KB route payloads | Simplify geometry server-side before sending to the browser |
| Open-Meteo object vs array | Normalise to a list in the client |
| 414 above ~8–10 K URL chars | Batch ≤ 200 locations per request |
| ~1,000 locations for long trips | Scale heatmap cell size with trip length; de-duplicate; cache |
| Transient TLS timeout seen | Retry with backoff on network errors / 5xx / 429 |
| Forecast ends ~15 days out | Validate departure + trip + 48 h heatmap against the horizon |
| Photon results are global | Pass a North America `bbox` for autocomplete |
| Inconsistent error bodies | Map errors by status code, surface our own messages |
