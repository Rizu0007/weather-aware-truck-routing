"""Weather risk classification from the assessment's threshold table and load rules.

Band edges (agreed interpretation, see ASSESSMENT.md):
- each band includes its lower bound: 25 mph is Moderate, 0.25 in/hr rain is High;
- the No Travel band follows the table literally: wind >= 55 mph, rain > 1.00 in/hr,
  snow > 3.0 in/hr (so exactly 1.00 in/hr rain is still Severe).
"""

from dataclasses import dataclass
from enum import IntEnum


class RiskLevel(IntEnum):
    """Ordered so that max() gives the worst level and int() gives the risk score."""

    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()


# Lower bounds of Moderate, High and Severe for each condition.
WIND_MPH_BANDS = (25, 35, 45)
RAIN_IN_HR_BANDS = (0.10, 0.25, 0.50)
SNOW_IN_HR_BANDS = (0.5, 1.0, 2.0)

WIND_NO_TRAVEL_MPH = 55  # inclusive
RAIN_NO_TRAVEL_IN_HR = 1.00  # exclusive
SNOW_NO_TRAVEL_IN_HR = 3.0  # exclusive

# Load rules: a heavy load escalates the wind level by one step.
SEVERE_WIND_NO_TRAVEL_LOAD_LB = 30_000  # 45-54 mph + more than this -> No Travel
HIGH_WIND_SEVERE_LOAD_LB = 40_000  # 35-44 mph + more than this -> Severe


def _band(value: float, bands: tuple[float, float, float]) -> RiskLevel:
    moderate, high, severe = bands
    if value >= severe:
        return RiskLevel.SEVERE
    if value >= high:
        return RiskLevel.HIGH
    if value >= moderate:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def classify_wind(mph: float) -> RiskLevel:
    if mph >= WIND_NO_TRAVEL_MPH:
        return RiskLevel.NO_TRAVEL
    return _band(mph, WIND_MPH_BANDS)


def classify_rain(in_per_hr: float) -> RiskLevel:
    if in_per_hr > RAIN_NO_TRAVEL_IN_HR:
        return RiskLevel.NO_TRAVEL
    return _band(in_per_hr, RAIN_IN_HR_BANDS)


def classify_snow(in_per_hr: float) -> RiskLevel:
    if in_per_hr > SNOW_NO_TRAVEL_IN_HR:
        return RiskLevel.NO_TRAVEL
    return _band(in_per_hr, SNOW_IN_HR_BANDS)


def apply_load_rules(wind_level: RiskLevel, load_lb: float) -> RiskLevel:
    """Escalate the wind level for heavy loads.

    >= 55 mph is already No Travel for any load (classify_wind handles it).
    """
    if wind_level == RiskLevel.SEVERE and load_lb > SEVERE_WIND_NO_TRAVEL_LOAD_LB:
        return RiskLevel.NO_TRAVEL
    if wind_level == RiskLevel.HIGH and load_lb > HIGH_WIND_SEVERE_LOAD_LB:
        return RiskLevel.SEVERE
    return wind_level


@dataclass(frozen=True)
class Assessment:
    level: RiskLevel
    wind_level: RiskLevel
    rain_level: RiskLevel
    snow_level: RiskLevel
    reasons: tuple[str, ...]


def assess(*, wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> Assessment:
    """Overall risk is the worst of wind (after load rules), rain and snow.

    `reasons` names every condition that sets the overall level (empty when Low).
    """
    base_wind = classify_wind(wind_mph)
    wind = apply_load_rules(base_wind, load_lb)
    rain = classify_rain(rain_in_hr)
    snow = classify_snow(snow_in_hr)
    level = max(wind, rain, snow)

    reasons = []
    if level > RiskLevel.LOW:
        if wind == level:
            load_note = f" with a {load_lb:,.0f} lb load" if wind != base_wind else ""
            reasons.append(f"Wind {wind_mph:.0f} mph{load_note}")
        if rain == level:
            reasons.append(f"Rain {rain_in_hr:.2f} in/hr")
        if snow == level:
            reasons.append(f"Snow {snow_in_hr:.1f} in/hr")
    return Assessment(level, wind, rain, snow, tuple(reasons))


def level_series(
    *, wind_mph: list[float], rain_in_hr: list[float], snow_in_hr: list[float], load_lb: float
) -> list[int]:
    """Overall level for each hour of a forecast series, as plain ints (for the heatmap)."""
    return [
        int(max(apply_load_rules(classify_wind(w), load_lb), classify_rain(r), classify_snow(s)))
        for w, r, s in zip(wind_mph, rain_in_hr, snow_in_hr, strict=True)
    ]
