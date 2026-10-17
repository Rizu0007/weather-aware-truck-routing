from datetime import UTC, datetime, timedelta
from itertools import pairwise

import pytest

from trips.domain.checkpoints import TruckTimeline, build_checkpoints, checkpoint_miles

DEPARTURE = datetime(2026, 10, 20, 14, 0, tzinfo=UTC)
TRUCK_CAP_MPH = 65


@pytest.fixture
def timeline(dallas_houston_route):
    coords, seconds, route = dallas_houston_route
    return TruckTimeline(coords, seconds, TRUCK_CAP_MPH, total_seconds=route["duration"])


@pytest.mark.parametrize(("interval", "expected_count"), [(10, 25), (25, 11), (50, 6)])
def test_checkpoint_counts_on_dallas_houston(timeline, interval, expected_count):
    # 238.3 mi: every `interval` miles from 0, plus the destination.
    checkpoints = build_checkpoints(timeline, DEPARTURE, interval)

    assert len(checkpoints) == expected_count
    assert checkpoints[0].mile == 0
    assert checkpoints[-1].mile == pytest.approx(timeline.total_miles)
    assert checkpoints[1].mile == interval


@pytest.mark.parametrize("interval", [10, 25, 50])
def test_coverage_is_contiguous_and_sums_to_route_length(timeline, interval):
    checkpoints = build_checkpoints(timeline, DEPARTURE, interval)

    assert checkpoints[0].start_mile == 0
    assert checkpoints[-1].end_mile == pytest.approx(timeline.total_miles)
    for previous, current in pairwise(checkpoints):
        assert previous.end_mile == current.start_mile
    assert sum(c.miles_covered for c in checkpoints) == pytest.approx(timeline.total_miles)


def test_arrival_eta_equals_osrm_route_duration(timeline, dallas_houston_route):
    _, _, route = dallas_houston_route
    # Speeds on this route never exceed the cap, so scaling alone sets the total.
    checkpoints = build_checkpoints(timeline, DEPARTURE, 10)

    assert checkpoints[0].eta == DEPARTURE
    assert checkpoints[-1].eta - DEPARTURE == pytest.approx(
        timedelta(seconds=route["duration"]), abs=timedelta(seconds=1)
    )


def test_etas_increase_along_the_route(timeline):
    etas = [c.eta for c in build_checkpoints(timeline, DEPARTURE, 10)]

    assert etas == sorted(etas)


def test_checkpoints_lie_on_the_route(timeline):
    checkpoint = build_checkpoints(timeline, DEPARTURE, 50)[2]  # mile 100
    lon, lat = checkpoint.coord

    lons = [c[0] for c in timeline.coords]
    lats = [c[1] for c in timeline.coords]
    assert min(lons) <= lon <= max(lons) and min(lats) <= lat <= max(lats)


def test_speed_cap_slows_fast_segments():
    # Two points ~69 mi apart that the routing engine says take 30 min (~138 mph).
    coords = [(0.0, 0.0), (0.0, 1.0)]

    timeline = TruckTimeline(coords, [1800], max_speed_mph=65)

    assert timeline.total_seconds == pytest.approx(timeline.total_miles / 65 * 3600)


def test_scaling_spreads_extra_route_time_proportionally():
    coords = [(0.0, 0.0), (0.0, 0.1), (0.0, 0.2)]

    timeline = TruckTimeline(coords, [600, 600], max_speed_mph=65, total_seconds=1320)

    assert timeline.cum_seconds == pytest.approx([0, 660, 1320])


def test_short_final_stretch_replaces_last_mark():
    assert checkpoint_miles(20.3, 10) == [0, 10, 20.3]
    assert checkpoint_miles(21.0, 10) == [0, 10, 20, 21.0]


def test_route_shorter_than_one_interval_has_origin_and_destination():
    assert checkpoint_miles(4.0, 10) == [0, 4.0]


def test_rejects_naive_departure(timeline):
    with pytest.raises(ValueError, match="timezone-aware"):
        build_checkpoints(timeline, datetime(2026, 10, 20, 14, 0), 10)


def test_rejects_mismatched_durations():
    with pytest.raises(ValueError):
        TruckTimeline([(0.0, 0.0), (0.0, 1.0)], [60, 60], max_speed_mph=65)
