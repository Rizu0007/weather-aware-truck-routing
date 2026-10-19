"""Hourly Open-Meteo forecasts for many points, batched and cached."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import requests
from django.conf import settings
from django.core.cache import cache

from trips.domain.geo import Coord
from trips.exceptions import ProviderBusyError, ProviderError
from trips.integrations.http import get_json

PROVIDER = "open-meteo"
# A heavy caller is served at ~0.45 s per location, and 4 requests at once get 503s, so
# batches stay small and each gets time in proportion to its size (scripts/probe_open_meteo.py).
BATCH_SIZE = 50
PARALLEL_REQUESTS = 2
READ_TIMEOUT_S = 10
READ_TIMEOUT_PER_LOCATION_S = 0.6
MAX_READ_TIMEOUT_S = 45
# The model grid is ~3 km, so points closer than this share a forecast.
SNAP_DEG = 0.05
CACHE_TTL_S = 15 * 60
HOURLY_FIELDS = ("wind_speed_10m", "rain", "showers", "snowfall")
# Shown to the driver or drawn, never scored: a response without them, or in a unit we don't
# know, still parses, with those values missing. 10 fields in all: more count as extra calls.
DIRECTION_FIELD = "wind_direction_10m"
INFO_FIELDS = (
    DIRECTION_FIELD,
    "wind_gusts_10m",
    "temperature_2m",
    "visibility",
    "weather_code",
    "precipitation_probability",
)
TIME_FORMAT = "%Y-%m-%dT%H:%M"

TO_MPH = {"mp/h": 1.0, "km/h": 1 / 1.609344, "m/s": 2.236936, "kn": 1.150779}
TO_INCH = {"inch": 1.0, "mm": 1 / 25.4, "cm": 1 / 2.54}
TO_MILES = {"m": 1 / 1609.344, "ft": 1 / 5280}
TO_FAHRENHEIT = {"°F": lambda f: f, "°C": lambda c: c * 9 / 5 + 32}


@dataclass(frozen=True)
class HourlySeries:
    """Weather at one point for consecutive hours from `start`. `None` means no data."""

    start: datetime
    wind_mph: list[float | None]
    rain_in_hr: list[float | None]
    snow_in_hr: list[float | None]
    # Information only; None per hour, or for the whole series, if absent.
    wind_from_deg: list[float | None] | None = None  # degrees it blows from (meteorological)
    gust_mph: list[float | None] | None = None
    temperature_f: list[float | None] | None = None
    visibility_mi: list[float | None] | None = None
    weather_code: list[int | None] | None = None  # WMO weather interpretation code
    precip_probability: list[int | None] | None = None  # percent


def snap(coord: Coord) -> Coord:
    lon, lat = coord
    return (round(round(lon / SNAP_DEG) * SNAP_DEG, 2), round(round(lat / SNAP_DEG) * SNAP_DEG, 2))


def hourly(points: list[Coord], start: datetime, hours: int) -> list[HourlySeries]:
    """One series per point, in order. `start` is floored to the hour."""
    if start.tzinfo is None:
        raise ValueError("start must be timezone-aware")
    if hours < 1:
        raise ValueError("hours must be at least 1")
    start = start.astimezone(UTC).replace(minute=0, second=0, microsecond=0)

    snapped = [snap(p) for p in points]
    keys = {coord: _cache_key(coord, start, hours) for coord in dict.fromkeys(snapped)}
    found = cache.get_many(keys.values())
    by_coord = {coord: found[key] for coord, key in keys.items() if key in found}

    missing = [coord for coord in keys if coord not in by_coord]
    if missing:
        fetched = _fetch_all(missing, start, hours)
        cache.set_many({keys[coord]: series for coord, series in fetched.items()}, CACHE_TTL_S)
        by_coord |= fetched

    return [by_coord[coord] for coord in snapped]


def _cache_key(coord: Coord, start: datetime, hours: int) -> str:
    return f"wx3:{coord[0]:.2f}:{coord[1]:.2f}:{start:%Y%m%d%H}:{hours}"


def _fetch_all(coords: list[Coord], start: datetime, hours: int) -> dict[Coord, HourlySeries]:
    batches = [coords[i : i + BATCH_SIZE] for i in range(0, len(coords), BATCH_SIZE)]
    with ThreadPoolExecutor(max_workers=PARALLEL_REQUESTS) as pool:
        results = pool.map(lambda batch: _fetch_batch(batch, start, hours), batches)
        return {coord: series for batch in results for coord, series in batch.items()}


def _fetch_batch(coords: list[Coord], start: datetime, hours: int) -> dict[Coord, HourlySeries]:
    params = {
        "latitude": ",".join(f"{lat:.2f}" for _, lat in coords),
        "longitude": ",".join(f"{lon:.2f}" for lon, _ in coords),
        "hourly": ",".join((*HOURLY_FIELDS, *INFO_FIELDS)),
        "wind_speed_unit": "mph",
        "temperature_unit": "fahrenheit",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "start_hour": start.strftime(TIME_FORMAT),
        "end_hour": (start + timedelta(hours=hours - 1)).strftime(TIME_FORMAT),
    }
    if settings.OPEN_METEO_API_KEY:
        params["apikey"] = settings.OPEN_METEO_API_KEY

    # A timeout cut short an answer that was on its way, and its retry spends the quota again.
    read_timeout = min(
        MAX_READ_TIMEOUT_S, READ_TIMEOUT_S + READ_TIMEOUT_PER_LOCATION_S * len(coords)
    )
    body = get_json(
        PROVIDER,
        settings.OPEN_METEO_URL,
        params,
        rate_limit=_quota_error,
        read_timeout_s=read_timeout,
    )
    # One location comes back as an object, several as a list.
    locations = [body] if isinstance(body, dict) else body
    if not isinstance(locations, list) or len(locations) != len(coords):
        raise ProviderError(PROVIDER, extra={"reason": "location count mismatch"})
    return {
        coord: _parse_location(location, start, hours)
        for coord, location in zip(coords, locations, strict=True)
    }


def _quota_error(response: requests.Response) -> ProviderBusyError | None:
    """The free tier also has hourly and daily quotas; their 429 says which, and waiting a
    minute won't help, so tell the user when it resets."""
    try:
        reason = str(response.json().get("reason", ""))
    except ValueError:
        return None
    now = datetime.now(UTC)
    if reason.startswith("Daily"):
        resets = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        message = "The free weather service's daily limit is used up. It resets at midnight UTC."
        limit = "daily"
    elif reason.startswith("Hourly"):
        resets = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        message = "The free weather service's hourly limit is used up. It resets on the hour."
        limit = "hourly"
    else:
        return None
    return ProviderBusyError(
        PROVIDER,
        message,
        extra={
            "status": 429,
            "limit": limit,
            "retry_after": round((resets - now).total_seconds()),
            "resets_at": resets.isoformat(),
        },
    )


def _parse_location(location: dict, start: datetime, hours: int) -> HourlySeries:
    try:
        units = location["hourly_units"]
        data = location["hourly"]
        times = data["time"]
        wind_factor = TO_MPH[units["wind_speed_10m"]]
        rain_factor = TO_INCH[units["rain"]]
        showers_factor = TO_INCH[units["showers"]]
        snow_factor = TO_INCH[units["snowfall"]]
        columns = [data[field] for field in HOURLY_FIELDS]
    except (KeyError, TypeError) as exc:
        raise ProviderError(PROVIDER, extra={"reason": "unexpected response shape"}) from exc

    if (
        len(times) != hours
        or times[0] != start.strftime(TIME_FORMAT)
        or any(len(column) != hours for column in columns)
    ):
        raise ProviderError(PROVIDER, extra={"reason": "unexpected forecast window"})

    def info(field: str, convert=lambda v: v):
        values = data.get(field)
        if not isinstance(values, list) or len(values) != hours:
            return None
        try:
            return [None if v is None else convert(v) for v in values]
        except (TypeError, ValueError):
            return None

    def unit(field: str, table: dict):
        return table.get(units.get(field))

    gust_factor = unit("wind_gusts_10m", TO_MPH)
    miles_factor = unit("visibility", TO_MILES)
    to_fahrenheit = unit("temperature_2m", TO_FAHRENHEIT)
    wind, rain, showers, snow = columns
    return HourlySeries(
        start=start,
        wind_mph=[_scaled(v, wind_factor) for v in wind],
        rain_in_hr=[
            _rain_total(r, s, rain_factor, showers_factor)
            for r, s in zip(rain, showers, strict=True)
        ],
        snow_in_hr=[_scaled(v, snow_factor) for v in snow],
        wind_from_deg=info(DIRECTION_FIELD),
        gust_mph=gust_factor and info("wind_gusts_10m", lambda v: v * gust_factor),
        temperature_f=to_fahrenheit and info("temperature_2m", to_fahrenheit),
        visibility_mi=miles_factor and info("visibility", lambda v: v * miles_factor),
        weather_code=info("weather_code", int),
        precip_probability=info("precipitation_probability", int),
    )


def _scaled(value: float | None, factor: float) -> float | None:
    return None if value is None else value * factor


def _rain_total(
    rain: float | None, showers: float | None, rain_factor: float, showers_factor: float
) -> float | None:
    """Open-Meteo splits rain into large-scale rain and convective showers."""
    if rain is None and showers is None:
        return None
    return (rain or 0.0) * rain_factor + (showers or 0.0) * showers_factor
