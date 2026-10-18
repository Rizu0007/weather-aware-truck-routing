"""Plan a trip: route options, weather at each checkpoint's ETA, risk, recommendation."""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

from trips.domain.checkpoints import Checkpoint, TruckTimeline, build_checkpoints
from trips.domain.geo import Coord, simplify, slice_line
from trips.domain.ranking import Candidate, Ranking, RiskSummary, rank, summarize
from trips.domain.risk import Assessment, RiskLevel, assess
from trips.exceptions import ForecastHorizonError
from trips.integrations import open_meteo
from trips.services.route_options import RouteOption, find_route_options

TRUCK_MAX_SPEED_MPH = 65
# Open-Meteo serves ~15 days ahead (API_NOTES.md, section 2); keep a margin.
FORECAST_HORIZON = timedelta(days=15) - timedelta(hours=6)
# The heatmap shows 48 h from departure, so the plan must leave room for it.
HEATMAP_HOURS = 48
# ~50 m: invisible at route zoom, shrinks the geometry several-fold.
SIMPLIFY_TOLERANCE_DEG = 0.0005


@dataclass(frozen=True)
class CheckpointRisk:
    checkpoint: Checkpoint
    wind_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None
    assessment: Assessment


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
    geometry: list[Coord]
    segments: list[RiskSegment]
    checkpoints: list[CheckpointRisk]


@dataclass(frozen=True)
class TripPlan:
    departure: datetime
    load_lb: int
    interval_mi: int
    routes: list[PlannedRoute]
    ranking: Ranking
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
    _check_forecast_horizon(departure, longest)

    checkpoints = [build_checkpoints(t, departure, interval_mi) for t in timelines]
    weather = _weather_by_checkpoint(checkpoints, departure, longest)
    routes = [
        _planned_route(
            option,
            timeline,
            departure,
            [_assess_checkpoint(c, weather[c], load_lb) for c in route_checkpoints],
        )
        for option, timeline, route_checkpoints in zip(
            found.options, timelines, checkpoints, strict=True
        )
    ]

    warnings = list(found.warnings)
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
        warnings=warnings,
    )


def _check_forecast_horizon(departure: datetime, longest_trip: timedelta) -> None:
    latest_end = timezone.now() + FORECAST_HORIZON
    needed = max(longest_trip, timedelta(hours=HEATMAP_HOURS))
    if departure + needed > latest_end:
        latest_departure = (latest_end - needed).replace(minute=0, second=0, microsecond=0)
        raise ForecastHorizonError(
            "Forecasts only reach about 15 days ahead. Choose an earlier departure.",
            extra={"latest_departure": latest_departure.isoformat()},
        )


def _weather_by_checkpoint(
    checkpoints: list[list[Checkpoint]], departure: datetime, longest_trip: timedelta
) -> dict[Checkpoint, tuple[float | None, float | None, float | None]]:
    """(wind, rain, snow) at the forecast hour nearest each checkpoint's ETA."""
    flat = [c for route in checkpoints for c in route]
    start = departure.replace(minute=0, second=0, microsecond=0)
    # +2: the nearest hour can round up past the arrival hour.
    hours = math.ceil(longest_trip / timedelta(hours=1)) + 2
    series = open_meteo.hourly([c.coord for c in flat], start, hours)

    weather = {}
    for checkpoint, s in zip(flat, series, strict=True):
        i = round((checkpoint.eta - s.start) / timedelta(hours=1))
        weather[checkpoint] = (s.wind_mph[i], s.rain_in_hr[i], s.snow_in_hr[i])
    return weather


def _assess_checkpoint(checkpoint: Checkpoint, weather, load_lb: int) -> CheckpointRisk:
    wind, rain, snow = weather
    assessment = assess(
        wind_mph=wind or 0.0, rain_in_hr=rain or 0.0, snow_in_hr=snow or 0.0, load_lb=load_lb
    )
    return CheckpointRisk(checkpoint, wind, rain, snow, assessment)


def _planned_route(
    option: RouteOption, timeline: TruckTimeline, departure: datetime, risks: list[CheckpointRisk]
) -> PlannedRoute:
    return PlannedRoute(
        option=option,
        distance_mi=timeline.total_miles,
        duration_s=timeline.total_seconds,
        arrival=departure + timedelta(seconds=timeline.total_seconds),
        summary=summarize([(r.checkpoint.miles_covered, r.assessment.level) for r in risks]),
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
