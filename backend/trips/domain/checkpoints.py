"""Weather checkpoints along a route, and when the truck reaches each one."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from trips.domain.geo import Coord, cumulative_miles, haversine_mi, locate, point_at_mile

# A destination this close to the last regular checkpoint replaces it instead of adding another.
MIN_FINAL_GAP_MI = 0.5


@dataclass(frozen=True)
class Checkpoint:
    mile: float
    coord: Coord
    eta: datetime
    # Stretch of road this checkpoint stands for: half-way to each neighbour.
    start_mile: float
    end_mile: float

    @property
    def miles_covered(self) -> float:
        return self.end_mile - self.start_mile


class TruckTimeline:
    """Driving time to every vertex, capped at the truck's top speed.

    Scaled to `total_seconds`: OSRM's total includes turn penalties its segments leave out.
    """

    def __init__(
        self,
        coords: list[Coord],
        segment_seconds: list[float],
        max_speed_mph: float,
        total_seconds: float | None = None,
    ):
        if len(coords) < 2 or len(segment_seconds) != len(coords) - 1:
            raise ValueError("Need at least 2 coordinates and one duration per segment.")
        annotated = sum(segment_seconds)
        scale = total_seconds / annotated if total_seconds and annotated else 1.0

        self.coords = coords
        self.cum_miles = cumulative_miles(coords)
        self.cum_seconds = [0.0]
        for i, seconds in enumerate(segment_seconds):
            fastest = haversine_mi(coords[i], coords[i + 1]) / max_speed_mph * 3600
            self.cum_seconds.append(self.cum_seconds[-1] + max(seconds * scale, fastest))

    @property
    def total_miles(self) -> float:
        return self.cum_miles[-1]

    @property
    def total_seconds(self) -> float:
        return self.cum_seconds[-1]

    def seconds_at_mile(self, mile: float) -> float:
        i, t = locate(self.cum_miles, mile)
        return self.cum_seconds[i] + (self.cum_seconds[i + 1] - self.cum_seconds[i]) * t


def checkpoint_miles(total_miles: float, interval_mi: float) -> list[float]:
    """0, interval, 2 x interval, ... and the destination."""
    if interval_mi <= 0:
        raise ValueError("interval_mi must be positive")
    marks = []
    mile = 0.0
    while mile < total_miles:
        marks.append(mile)
        mile += interval_mi
    if len(marks) > 1 and total_miles - marks[-1] <= MIN_FINAL_GAP_MI:
        marks[-1] = total_miles
    else:
        marks.append(total_miles)
    return marks


def build_checkpoints(
    timeline: TruckTimeline, departure: datetime, interval_mi: float
) -> list[Checkpoint]:
    if departure.tzinfo is None:
        raise ValueError("departure must be timezone-aware")
    marks = checkpoint_miles(timeline.total_miles, interval_mi)
    last = len(marks) - 1
    checkpoints = []
    for k, mile in enumerate(marks):
        start = 0.0 if k == 0 else (marks[k - 1] + mile) / 2
        end = timeline.total_miles if k == last else (mile + marks[k + 1]) / 2
        checkpoints.append(
            Checkpoint(
                mile=mile,
                coord=point_at_mile(timeline.coords, timeline.cum_miles, mile),
                eta=departure + timedelta(seconds=timeline.seconds_at_mile(mile)),
                start_mile=start,
                end_mile=end,
            )
        )
    return checkpoints
