"""Hourly risk for every cell of the corridor, 0-48 h after departure."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from trips.domain.corridor import corridor_grid
from trips.domain.geo import Coord
from trips.domain.risk import level_series
from trips.integrations import open_meteo
from trips.services.forecast_window import HEATMAP_HOURS, check_forecast_horizon


@dataclass(frozen=True)
class HeatmapCell:
    center: Coord
    risk: list[int]  # one level per hour from `Heatmap.start`
    wind_mph: list[float | None]
    rain_in_hr: list[float | None]
    snow_in_hr: list[float | None]


@dataclass(frozen=True)
class Heatmap:
    start: datetime  # departure, floored to the hour: slider hour 0
    hours: int
    cell_deg: float
    cells: list[HeatmapCell]
    warnings: list[str]


def build_heatmap(*, routes: list[list[Coord]], departure: datetime, load_lb: int) -> Heatmap:
    check_forecast_horizon(departure, timedelta(hours=HEATMAP_HOURS))
    grid = corridor_grid(routes)
    start = departure.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    hours = HEATMAP_HOURS + 1  # 0 to 48 inclusive
    series = open_meteo.hourly(grid.centers, start, hours)

    cells = [
        HeatmapCell(
            center=center,
            # Missing values count as calm, as in trip plans.
            risk=level_series(
                wind_mph=[v or 0.0 for v in s.wind_mph],
                rain_in_hr=[v or 0.0 for v in s.rain_in_hr],
                snow_in_hr=[v or 0.0 for v in s.snow_in_hr],
                load_lb=load_lb,
            ),
            wind_mph=s.wind_mph,
            rain_in_hr=s.rain_in_hr,
            snow_in_hr=s.snow_in_hr,
        )
        for center, s in zip(grid.centers, series, strict=True)
    ]
    incomplete = sum(None in (*c.wind_mph, *c.rain_in_hr, *c.snow_in_hr) for c in cells)
    warnings = (
        [f"Forecast data was incomplete for {incomplete} of {len(cells)} heatmap cells."]
        if incomplete
        else []
    )
    return Heatmap(start, hours, grid.cell_deg, cells, warnings)
