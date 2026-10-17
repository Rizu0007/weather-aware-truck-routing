"""Probe the Open-Meteo forecast API (weather). Keyless.

Run: python3 scripts/probe_open_meteo.py
"""

from datetime import datetime, timedelta, timezone

from probe_lib import call, rate_limit_headers, show

BASE = "https://api.open-meteo.com/v1/forecast"
HOURLY = "wind_speed_10m,rain,showers,snowfall"
IMPERIAL = {"wind_speed_unit": "mph", "precipitation_unit": "inch", "timezone": "GMT"}

now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


def hour(dt):
    return dt.strftime("%Y-%m-%dT%H:%M")


def window(start_offset_h, hours):
    start = now + timedelta(hours=start_offset_h)
    return {"start_hour": hour(start), "end_hour": hour(start + timedelta(hours=hours - 1))}


def summarize(data):
    if data is None:
        return
    if isinstance(data, dict) and data.get("error"):
        show("error", data)
        return
    locations = data if isinstance(data, list) else [data]
    show("top-level type", f"{type(data).__name__} with {len(locations)} location(s)")
    for loc in locations[:2]:
        hourly = loc["hourly"]
        times = hourly["time"]
        nulls = {k: sum(v is None for v in vals) for k, vals in hourly.items() if k != "time"}
        show(
            "location",
            f"requested->returned lat/lon {loc['latitude']},{loc['longitude']} elev={loc.get('elevation')} "
            f"location_id={loc.get('location_id')} tz={loc.get('timezone')} utc_offset={loc.get('utc_offset_seconds')}",
        )
        show("hourly_units", loc.get("hourly_units"))
        show("hours", f"{len(times)} from {times[0]} to {times[-1]}")
        show("null counts", nulls)
        show("max values", {k: max((v for v in vals if v is not None), default=None) for k, vals in hourly.items() if k != "time"})


print("== Open-Meteo: endpoints we need ==")
# One checkpoint at its ETA hour.
status, data, headers = call(
    "open_meteo_single_location",
    BASE,
    {"latitude": "32.7767", "longitude": "-96.797", "hourly": HOURLY, **IMPERIAL, **window(0, 3)},
)
summarize(data)
show("rate-limit headers", rate_limit_headers(headers))

# Several checkpoints in one request.
status, data, _ = call(
    "open_meteo_multi_location",
    BASE,
    {"latitude": "32.7767,31.5,29.7604", "longitude": "-96.797,-96.5,-95.3698", "hourly": HOURLY, **IMPERIAL, **window(0, 3)},
)
summarize(data)

# Heatmap: 0-48 h window for a 100-point grid in one request.
lats = [round(30 + (i // 10) * 0.5, 2) for i in range(100)]
lons = [round(-100 + (i % 10) * 0.5, 2) for i in range(100)]
status, data, _ = call(
    "open_meteo_batch_100_locations_49h",
    BASE,
    {"latitude": ",".join(map(str, lats)), "longitude": ",".join(map(str, lons)), "hourly": HOURLY, **IMPERIAL, **window(0, 49)},
)
summarize(data)

# Default units, to confirm what the imperial parameters change.
status, data, _ = call(
    "open_meteo_default_units",
    BASE,
    {"latitude": "32.7767", "longitude": "-96.797", "hourly": HOURLY, **window(0, 3)},
)
summarize(data)

# Snowy, windy places right now, to see non-zero values in the real shape.
status, data, _ = call(
    "open_meteo_mountain_locations",
    BASE,
    {"latitude": "39.68,44.27,61.22", "longitude": "-105.9,-71.3,-149.9", "hourly": HOURLY, **IMPERIAL, **window(0, 49)},
)
summarize(data)

print("\n== Open-Meteo: forecast horizon ==")
for days in (7, 15, 17):
    status, data, _ = call(
        f"open_meteo_horizon_{days}d",
        BASE,
        {"latitude": "32.7767", "longitude": "-96.797", "hourly": HOURLY, **IMPERIAL, **window(days * 24, 3)},
    )
    summarize(data)

print("\n== Open-Meteo: failure cases ==")
status, data, _ = call(
    "open_meteo_error_invalid_latitude",
    BASE,
    {"latitude": "95", "longitude": "-96.797", "hourly": HOURLY, **IMPERIAL, **window(0, 3)},
)
summarize(data)

status, data, _ = call(
    "open_meteo_error_unknown_variable",
    BASE,
    {"latitude": "32.7767", "longitude": "-96.797", "hourly": "wind_speed_10m,not_a_variable", **IMPERIAL, **window(0, 3)},
)
summarize(data)

status, data, _ = call(
    "open_meteo_error_lat_lon_count_mismatch",
    BASE,
    {"latitude": "32.7,31.5", "longitude": "-96.8", "hourly": HOURLY, **IMPERIAL, **window(0, 3)},
)
summarize(data)

status, data, _ = call(
    "open_meteo_error_bad_hour_format",
    BASE,
    {"latitude": "32.7767", "longitude": "-96.797", "hourly": HOURLY, **IMPERIAL, "start_hour": "tomorrow", "end_hour": "later"},
)
summarize(data)

status, data, _ = call(
    "open_meteo_edge_past_window",
    BASE,
    {"latitude": "32.7767", "longitude": "-96.797", "hourly": HOURLY, **IMPERIAL, **window(-24 * 3, 3)},
)
summarize(data)

status, data, _ = call(
    "open_meteo_error_invalid_apikey",
    "https://customer-api.open-meteo.com/v1/forecast",
    {"latitude": "32.7767", "longitude": "-96.797", "hourly": HOURLY, **IMPERIAL, **window(0, 3), "apikey": "invalid-key"},
)
summarize(data)

print("\n== Open-Meteo: timeout ==")
call("open_meteo_timeout", BASE, {"latitude": "32.7", "longitude": "-96.8", "hourly": HOURLY}, timeout=0.01, save=False)

print("\nRate limit: not triggered deliberately (free tier documents 600/min, 5,000/hour, 10,000/day).")
