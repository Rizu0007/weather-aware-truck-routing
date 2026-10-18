import pytest

from trips.domain.corridor import CORRIDOR_KM, MAX_CELLS, corridor_grid
from trips.domain.geo import haversine_mi

KM_PER_MI = 1.609344


def line(a, b, n=300):
    return [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n + 1)]


def test_short_trip_gets_a_fine_grid(dallas_houston_route):
    coords, _, _ = dallas_houston_route

    grid = corridor_grid([coords])

    assert grid.cell_deg <= 0.2
    assert 0 < len(grid.centers) <= MAX_CELLS


@pytest.mark.parametrize(
    ("origin", "destination"),
    [((-87.63, 41.88), (-104.99, 39.74)), ((-118.24, 34.05), (-74.0, 40.7))],  # 920 / 2,470 mi
)
def test_long_trips_stay_within_the_cell_budget(origin, destination):
    grid = corridor_grid([line(origin, destination)])

    assert len(grid.centers) <= MAX_CELLS


def test_every_route_point_is_near_a_cell(dallas_houston_route):
    coords, _, _ = dallas_houston_route

    grid = corridor_grid([coords])

    half_diagonal_mi = grid.cell_deg * 69 * 0.71
    for point in coords[::50]:
        nearest = min(haversine_mi(point, c) for c in grid.centers)
        assert nearest <= half_diagonal_mi


def test_cells_stay_inside_the_corridor():
    route = line((-100.0, 35.0), (-98.0, 35.0))

    grid = corridor_grid([route])

    for center in grid.centers:
        nearest = min(haversine_mi(center, p) for p in route)
        assert nearest <= CORRIDOR_KM / KM_PER_MI


def test_separate_routes_are_not_joined_end_to_start():
    north = line((-100.0, 36.0), (-98.0, 36.0))
    south = line((-98.0, 34.0), (-100.0, 34.0))

    grid = corridor_grid([north, south], max_cells=10_000)

    # Joining them would draw a line from (-98, 36) down to (-98, 34).
    assert not any(34.6 < lat < 35.4 for _, lat in grid.centers)


def test_overlapping_routes_share_cells():
    route = line((-100.0, 35.0), (-98.0, 35.0))

    assert corridor_grid([route, route]) == corridor_grid([route])


def test_centers_are_ordered_south_to_north_then_west_to_east():
    grid = corridor_grid([line((-100.0, 35.0), (-98.0, 37.0))])

    assert grid.centers == sorted(grid.centers, key=lambda c: (c[1], c[0]))


def test_needs_a_line():
    with pytest.raises(ValueError):
        corridor_grid([[(-100.0, 35.0)]])
