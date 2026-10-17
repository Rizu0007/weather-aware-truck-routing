import pytest

from trips.domain.geo import (
    cumulative_miles,
    haversine_mi,
    locate,
    point_at_mile,
    simplify,
    slice_line,
)

METERS_PER_MILE = 1609.344


def test_one_degree_of_latitude_is_about_69_miles():
    assert haversine_mi((0, 0), (0, 1)) == pytest.approx(69.09, abs=0.01)


def test_route_length_matches_osrm_distance(dallas_houston_route):
    coords, _, route = dallas_houston_route

    assert cumulative_miles(coords)[-1] == pytest.approx(
        route["distance"] / METERS_PER_MILE, rel=0.005
    )


LINE = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)]
CUM = cumulative_miles(LINE)


@pytest.mark.parametrize(
    ("mile", "expected"),
    [
        (-5, (0, 0.0)),
        (0, (0, 0.0)),
        (CUM[1] / 2, (0, 0.5)),
        (CUM[1], (1, 0.0)),
        (CUM[2], (1, 1.0)),
        (CUM[2] + 5, (1, 1.0)),
    ],
)
def test_locate_finds_segment_and_fraction(mile, expected):
    index, fraction = locate(CUM, mile)

    assert index == expected[0]
    assert fraction == pytest.approx(expected[1])


def test_point_at_mile_interpolates():
    assert point_at_mile(LINE, CUM, CUM[1] * 1.5) == pytest.approx((0.0, 1.5))


def test_slice_line_interpolates_both_ends_and_keeps_inner_vertices():
    piece = slice_line(LINE, CUM, CUM[1] * 0.5, CUM[1] * 1.5)

    assert piece == [pytest.approx((0, 0.5)), (0.0, 1.0), pytest.approx((0, 1.5))]


def test_simplify_drops_collinear_points_and_keeps_endpoints():
    line = [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (3.0, 1.0)]

    assert simplify(line, tolerance_deg=0.01) == [(0.0, 0.0), (2.0, 0.0), (3.0, 1.0)]


def test_simplify_shrinks_a_real_route(dallas_houston_route):
    coords, _, _ = dallas_houston_route

    simplified = simplify(coords, tolerance_deg=0.0005)

    assert simplified[0] == coords[0] and simplified[-1] == coords[-1]
    assert len(simplified) < len(coords) / 3
