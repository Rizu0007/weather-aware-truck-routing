"""Plan a trip: route options, weather at each checkpoint's ETA, risk, recommendation."""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from trips.domain.checkpoints import Checkpoint, TruckTimeline, build_checkpoints, checkpoint_miles
from trips.domain.conditions import Conditions, driving_conditions
from trips.domain.geo import Coord, simplify, slice_line
from trips.domain.ranking import (
    Candidate,
    Ranking,
    RiskSummary,
    rank,
    safer_than,
    sort_key,
    summarize,
)
from trips.domain.risk import Assessment, RiskLevel, assess
from trips.domain.safety_grade import SafetyGrade, grade
from trips.integrations import open_meteo
from trips.integrations.open_meteo import HourlySeries
from trips.services.forecast_window import check_forecast_horizon, latest_departure
from trips.services.route_options import RouteOption, find_route_options

TRUCK_MAX_SPEED_MPH = 65
Weather = tuple[float | None, float | None, float | None]  # wind mph, rain and snow in/hr
# ~50 m: invisible at route zoom, shrinks the geometry several-fold.
SIMPLIFY_TOLERANCE_DEG = 0.0005
# How much later a safer departure is looked for, in whole hours.
LATER_DEPARTURE_HOURS = 24
INTERVALS_MI = (10, 25, 50)
# Open-Meteo allows ~600 locations/min for all users, and a slowed caller needs ~0.45 s each:
# 240 keeps a cross-country plan inside one minute's quota and the 90 s client timeout.
MAX_CHECKPOINTS = 240


@dataclass(frozen=True)
class CheckpointRisk:
    checkpoint: Checkpoint
    wind_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None
    assessment: Assessment
    conditions: Conditions


@dataclass(frozen=True)
class RiskSegment:
    """A stretch of road at one risk level, for drawing."""

    level: RiskLevel
    coordinates: list[Coord]


@dataclass(frozen=True)
class PlannedRoute:
    option: RouteOption
    distance_mi: float
    duration_s: float
    arrival: datetime
    summary: RiskSummary
    grade: SafetyGrade
    geometry: list[Coord]
    segments: list[RiskSegment]
    checkpoints: list[CheckpointRisk]


@dataclass(frozen=True)
class DepartureAdvice:
    """A later departure with fewer High-or-worse miles than the planned one."""

    departure: datetime
    route_id: str
    reason: str


@dataclass(frozen=True)
class TripPlan:
    departure: datetime
    load_lb: int
    interval_mi: int
    routes: list[PlannedRoute]
    ranking: Ranking
    departure_advice: DepartureAdvice | None
    warnings: list[str]


def plan_trip(
    *, origin: Coord, destination: Coord, departure: datetime, load_lb: int, interval_mi: int
) -> TripPlan:
    found = find_route_options(origin, destination)
    timelines = [
        TruckTimeline(
            o.route.coords, o.route.segment_seconds, TRUCK_MAX_SPEED_MPH, o.route.duration_s
        )
        for o in found.options
    ]
    longest = timedelta(seconds=max(t.total_seconds for t in timelines))
    check_forecast_horizon(departure, longest)

    later_hours = min(
        LATER_DEPARTURE_HOURS, max(0, (latest_departure(longest) - departure) // timedelta(hours=1))
    )
    requested_mi = interval_mi
    interval_mi = _fit_interval(requested_mi, [t.total_miles for t in timelines])
    checkpoints = [build_checkpoints(t, departure, interval_mi) for t in timelines]
    series = _series_by_checkpoint(checkpoints, departure, longest, later_hours)
    routes = [
        _planned_route(
            option,
            timeline,
            departure,
            [_checkpoint_risk(c, series[c], load_lb) for c in route_checkpoints],
        )
        for option, timeline, route_checkpoints in zip(
            found.options, timelines, checkpoints, strict=True
        )
    ]

    warnings = list(found.warnings)
    if interval_mi != requested_mi:
        warnings.append(
            f"Checkpoints are every {interval_mi} mi instead of {requested_mi} mi: "
            "a trip this long would use up the weather service's limit."
        )
    if missing := sum(
        None in (c.wind_mph, c.rain_in_hr, c.snow_in_hr) for r in routes for c in r.checkpoints
    ):
        warnings.append(
            f"Forecast data was incomplete at {missing} checkpoint{'s' if missing > 1 else ''}; "
            "missing values were treated as calm."
        )

    ranking = rank([Candidate(r.option.id, r.summary, r.duration_s) for r in routes])
    by_id = {r.option.id: r for r in routes}
    return TripPlan(
        departure=departure,
        load_lb=load_lb,
        interval_mi=interval_mi,
        routes=[by_id[route_id] for route_id in ranking.order],
        ranking=ranking,
        departure_advice=_safer_departure(routes, series, departure, load_lb, later_hours),
        warnings=warnings,
    )


def _fit_interval(requested_mi: int, route_miles: list[float]) -> int:
    """The requested spacing, widened until all routes together fit MAX_CHECKPOINTS."""
    for interval in (i for i in INTERVALS_MI if i >= requested_mi):
        if sum(len(checkpoint_miles(m, interval)) for m in route_miles) <= MAX_CHECKPOINTS:
            return interval
    return max(INTERVALS_MI)


def _series_by_checkpoint(
    checkpoints: list[list[Checkpoint]],
    departure: datetime,
    longest_trip: timedelta,
    later_hours: int,
) -> dict[Checkpoint, HourlySeries]:
    """Each checkpoint's forecast, long enough for the trip to leave up to `later_hours` later."""
    flat = [c for route in checkpoints for c in route]
    # The series starts at the departure's hour (floored in UTC); +2 because the
    # nearest hour can round up past the arrival hour.
    hours = math.ceil(longest_trip / timedelta(hours=1)) + 2 + later_hours
    series = open_meteo.hourly([c.coord for c in flat], departure, hours)
    return dict(zip(flat, series, strict=True))


def _hour_at(series: HourlySeries, moment: datetime) -> int:
    """Index of the forecast hour nearest `moment`."""
    return round((moment - series.start) / timedelta(hours=1))


def _weather_at(series: HourlySeries, moment: datetime) -> Weather:
    """(wind, rain, snow) at the forecast hour nearest `moment`."""
    i = _hour_at(series, moment)
    return series.wind_mph[i], series.rain_in_hr[i], series.snow_in_hr[i]


def _safer_departure(
    routes: list[PlannedRoute],
    series: dict[Checkpoint, HourlySeries],
    departure: datetime,
    load_lb: int,
    later_hours: int,
) -> DepartureAdvice | None:
    """The safest of the next `later_hours` hourly departures, earliest on a tie.

    Suggested only if it has fewer High-or-worse miles than the planned departure.
    """
    planned = _best_route(routes, series, timedelta(0), load_lb)
    advice, safest = None, planned
    for hours in range(1, later_hours + 1):
        delay = timedelta(hours=hours)
        candidate = _best_route(routes, series, delay, load_lb)
        if safer_than(candidate, safest):
            reason = safer_than(candidate, planned)
            advice = DepartureAdvice(
                departure + delay, candidate.route_id, f"{reason} at the planned time."
            )
            safest = candidate
    return advice


def _best_route(
    routes: list[PlannedRoute],
    series: dict[Checkpoint, HourlySeries],
    delay: timedelta,
    load_lb: int,
) -> Candidate:
    """The route that would be recommended if the trip left `delay` later."""
    candidates = []
    for route in routes:
        levels = [
            (
                r.checkpoint.miles_covered,
                _assess(_weather_at(series[r.checkpoint], r.checkpoint.eta + delay), load_lb).level,
            )
            for r in route.checkpoints
        ]
        candidates.append(Candidate(route.option.id, summarize(levels), route.duration_s))
    return min(candidates, key=sort_key)


def _assess(weather: Weather, load_lb: int) -> Assessment:
    wind, rain, snow = weather
    return assess(
        wind_mph=wind or 0.0, rain_in_hr=rain or 0.0, snow_in_hr=snow or 0.0, load_lb=load_lb
    )


def _checkpoint_risk(checkpoint: Checkpoint, series: HourlySeries, load_lb: int) -> CheckpointRisk:
    """Risk from the brief's rules, plus what else the driver should know there."""
    i = _hour_at(series, checkpoint.eta)
    wind, rain, snow = series.wind_mph[i], series.rain_in_hr[i], series.snow_in_hr[i]

    def info(values):
        return None if values is None else values[i]

    conditions = driving_conditions(
        heading_deg=checkpoint.heading_deg,
        wind_mph=wind,
        wind_from_deg=info(series.wind_from_deg),
        gust_mph=info(series.gust_mph),
        temperature_f=info(series.temperature_f),
        visibility_mi=info(series.visibility_mi),
        rain_in_hr=rain,
        snow_in_hr=snow,
        weather_code=info(series.weather_code),
        precip_probability=info(series.precip_probability),
    )
    return CheckpointRisk(
        checkpoint, wind, rain, snow, _assess((wind, rain, snow), load_lb), conditions
    )


def _planned_route(
    option: RouteOption, timeline: TruckTimeline, departure: datetime, risks: list[CheckpointRisk]
) -> PlannedRoute:
    summary = summarize([(r.checkpoint.miles_covered, r.assessment.level) for r in risks])
    return PlannedRoute(
        option=option,
        distance_mi=timeline.total_miles,
        duration_s=timeline.total_seconds,
        arrival=departure + timedelta(seconds=timeline.total_seconds),
        summary=summary,
        grade=grade(summary),
        geometry=simplify(timeline.coords, SIMPLIFY_TOLERANCE_DEG),
        segments=_risk_segments(timeline, risks),
        checkpoints=risks,
    )


def _risk_segments(timeline: TruckTimeline, risks: list[CheckpointRisk]) -> list[RiskSegment]:
    """Neighbouring checkpoints at the same level merge into one drawn stretch."""
    runs: list[tuple[RiskLevel, float, float]] = []
    for r in risks:
        level, start, end = r.assessment.level, r.checkpoint.start_mile, r.checkpoint.end_mile
        if runs and runs[-1][0] == level:
            runs[-1] = (level, runs[-1][1], end)
        else:
            runs.append((level, start, end))
    return [
        RiskSegment(
            level,
            simplify(
                slice_line(timeline.coords, timeline.cum_miles, start, end), SIMPLIFY_TOLERANCE_DEG
            ),
        )
        for level, start, end in runs
    ]
