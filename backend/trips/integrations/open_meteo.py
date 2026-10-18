"""Hourly Open-Meteo forecasts for many points, batched and cached."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.core.cache import cache

from trips.domain.geo import Coord
from trips.exceptions import ProviderError
from trips.integrations.http import get_json

PROVIDER = "open-meteo"
BATCH_SIZE = 200  # ~500+ locations overflow the URL (HTTP 414)
PARALLEL_REQUESTS = 4
# The model grid is ~3 km, so points closer than this share a forecast.
SNAP_DEG = 0.05
CACHE_TTL_S = 15 * 60
HOURLY_FIELDS = ("wind_speed_10m", "rain", "showers", "snowfall")
TIME_FORMAT = "%Y-%m-%dT%H:%M"

TO_MPH = {"mp/h": 1.0, "km/h": 1 / 1.609344, "m/s": 2.236936, "kn": 1.150779}
TO_INCH = {"inch": 1.0, "mm": 1 / 25.4, "cm": 1 / 2.54}


@dataclass(frozen=True)
class HourlySeries:
    """Weather at one point for consecutive hours from `start`. `None` means no data."""

    start: datetime
    wind_mph: list[float | None]
    rain_in_hr: list[float | None]
    snow_in_hr: list[float | None]


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
    return f"wx:{coord[0]:.2f}:{coord[1]:.2f}:{start:%Y%m%d%H}:{hours}"


def _fetch_all(coords: list[Coord], start: datetime, hours: int) -> dict[Coord, HourlySeries]:
    batches = [coords[i : i + BATCH_SIZE] for i in range(0, len(coords), BATCH_SIZE)]
    with ThreadPoolExecutor(max_workers=PARALLEL_REQUESTS) as pool:
        results = pool.map(lambda batch: _fetch_batch(batch, start, hours), batches)
        return {coord: series for batch in results for coord, series in batch.items()}


def _fetch_batch(coords: list[Coord], start: datetime, hours: int) -> dict[Coord, HourlySeries]:
    params = {
        "latitude": ",".join(f"{lat:.2f}" for _, lat in coords),
        "longitude": ",".join(f"{lon:.2f}" for lon, _ in coords),
        "hourly": ",".join(HOURLY_FIELDS),
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "start_hour": start.strftime(TIME_FORMAT),
        "end_hour": (start + timedelta(hours=hours - 1)).strftime(TIME_FORMAT),
    }
    if settings.OPEN_METEO_API_KEY:
        params["apikey"] = settings.OPEN_METEO_API_KEY

    body = get_json(PROVIDER, settings.OPEN_METEO_URL, params)
    # One location comes back as an object, several as a list.
    locations = [body] if isinstance(body, dict) else body
    if not isinstance(locations, list) or len(locations) != len(coords):
        raise ProviderError(PROVIDER, extra={"reason": "location count mismatch"})
    return {
        coord: _parse_location(location, start, hours)
        for coord, location in zip(coords, locations, strict=True)
    }


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

    wind, rain, showers, snow = columns
    return HourlySeries(
        start=start,
        wind_mph=[_scaled(v, wind_factor) for v in wind],
        rain_in_hr=[
            _rain_total(r, s, rain_factor, showers_factor)
            for r, s in zip(rain, showers, strict=True)
        ],
        snow_in_hr=[_scaled(v, snow_factor) for v in snow],
    )


def _scaled(value: float | None, factor: float) -> float | None:
    return None if value is None else value * factor


def _rain_total(rain, showers, rain_factor: float, showers_factor: float) -> float | None:
    """Open-Meteo splits rain into large-scale rain and convective showers."""
    if rain is None and showers is None:
        return None
    return (rain or 0.0) * rain_factor + (showers or 0.0) * showers_factor
