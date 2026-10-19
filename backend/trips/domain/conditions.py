"""Driving conditions beyond the brief's risk table: shown to the driver, never scored."""

import math
from dataclasses import dataclass

# The brief's Moderate wind: the same line, but for wind across the road.
CROSSWIND_MPH = 25
FREEZING_F = 32
# Under a mile: the distance the National Weather Service calls reduced visibility.
LOW_VISIBILITY_MI = 1.0
# WMO codes for freezing drizzle and freezing rain.
FREEZING_PRECIP_CODES = frozenset({56, 57, 66, 67})


@dataclass(frozen=True)
class Conditions:
    weather_code: int | None
    temperature_f: float | None
    gust_mph: float | None
    visibility_mi: float | None
    precip_probability: int | None
    # Wind across the road (gusts when known); None without a wind direction.
    crosswind_mph: float | None
    flags: tuple[str, ...]  # "crosswind", "freezing", "low_visibility"


def crosswind(wind_mph: float, wind_from_deg: float, heading_deg: float) -> float:
    """The part of the wind blowing across the road, whichever side it comes from."""
    return abs(wind_mph * math.sin(math.radians(wind_from_deg - heading_deg)))


def driving_conditions(
    *,
    heading_deg: float,
    wind_mph: float | None,
    wind_from_deg: float | None,
    gust_mph: float | None,
    temperature_f: float | None,
    visibility_mi: float | None,
    rain_in_hr: float | None,
    snow_in_hr: float | None,
    weather_code: int | None,
    precip_probability: int | None,
) -> Conditions:
    strongest = gust_mph if gust_mph is not None else wind_mph
    across = (
        None
        if strongest is None or wind_from_deg is None
        else crosswind(strongest, wind_from_deg, heading_deg)
    )
    wet = bool(rain_in_hr) or bool(snow_in_hr) or weather_code in FREEZING_PRECIP_CODES
    flags = []
    if across is not None and across >= CROSSWIND_MPH:
        flags.append("crosswind")
    if temperature_f is not None and temperature_f <= FREEZING_F and wet:
        flags.append("freezing")
    if visibility_mi is not None and visibility_mi < LOW_VISIBILITY_MI:
        flags.append("low_visibility")
    return Conditions(
        weather_code=weather_code,
        temperature_f=temperature_f,
        gust_mph=gust_mph,
        visibility_mi=visibility_mi,
        precip_probability=precip_probability,
        crosswind_mph=across,
        flags=tuple(flags),
    )
