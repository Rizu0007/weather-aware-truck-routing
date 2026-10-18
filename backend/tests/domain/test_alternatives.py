import pytest

from trips.domain.alternatives import footprint, is_acceptable, overlap, via_point
from trips.domain.geo import haversine_mi

DALLAS = (-96.797, 32.7767)
HOUSTON = (-95.3698, 29.7604)


def test_via_point_is_offset_perpendicular_at_the_midpoint():
    mid = ((DALLAS[0] + HOUSTON[0]) / 2, (DALLAS[1] + HOUSTON[1]) / 2)
    crow = haversine_mi(DALLAS, HOUSTON)

    point = via_point(DALLAS, HOUSTON, 0.25)

    assert haversine_mi(mid, point) == pytest.approx(0.25 * crow, rel=0.02)
    # Perpendicular: equally far from both ends.
    assert haversine_mi(DALLAS, point) == pytest.approx(haversine_mi(HOUSTON, point), rel=0.02)


def test_positive_offset_is_left_of_travel():
    # Heading south-east from Dallas, left is north-east.
    left, right = via_point(DALLAS, HOUSTON, 0.15), via_point(DALLAS, HOUSTON, -0.15)

    assert left[0] > right[0] and left[1] > right[1]


def test_footprint_counts_each_cell_once():
    line = [(0.001, 0.001), (0.002, 0.002), (0.015, 0.001)]

    assert footprint(line) == {(0, 0), (1, 0)}


def test_overlap_is_share_of_the_candidate():
    candidate = frozenset({(0, 0), (1, 0), (2, 0), (3, 0)})
    other = frozenset({(0, 0), (1, 0), (9, 9)})

    assert overlap(candidate, other) == 0.5
    assert overlap(frozenset(), other) == 1.0


FAST = frozenset({(i, 0) for i in range(10)})
DISTINCT = frozenset({(i, 1) for i in range(10)})
MOSTLY_SAME = frozenset({(i, 0) for i in range(9)} | {(0, 5)})  # 90 % shared


@pytest.mark.parametrize(
    ("candidate", "seconds", "accepted"),
    [
        (DISTINCT, 1000 * 1.2, True),
        (DISTINCT, 1000 * 1.5, True),  # the limit itself is allowed
        (DISTINCT, 1000 * 1.51, False),  # detour
        (MOSTLY_SAME, 1000 * 1.1, False),  # near-duplicate
    ],
)
def test_is_acceptable(candidate, seconds, accepted):
    assert is_acceptable(candidate, seconds, [FAST], fastest_seconds=1000) is accepted


def test_must_be_distinct_from_every_kept_route():
    assert not is_acceptable(DISTINCT, 1100, [FAST, DISTINCT], fastest_seconds=1000)
