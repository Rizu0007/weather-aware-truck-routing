"""The bundled town list (trips/data/towns.tsv.gz) and the nearest-town lookup."""

import pytest

from trips.domain.towns import nearest_town

WINNSBORO_TX = (-95.2902, 32.9573)


def test_finds_the_town_at_a_point():
    town = nearest_town(WINNSBORO_TX, radius_km=20)

    assert town.label == "Winnsboro, Texas"
    assert town.country == "US"
    assert town.coord == pytest.approx(WINNSBORO_TX, abs=0.001)


def test_finds_the_closest_of_several_towns():
    # Just west of Whitehouse, Texas, a few miles south-east of Tyler.
    assert nearest_town((-95.24, 32.23), radius_km=30).label == "Whitehouse, Texas"


def test_nothing_within_the_radius_is_none():
    # The Gulf of Mexico, 150 km from shore.
    assert nearest_town((-92.0, 27.5), radius_km=50) is None


def test_canadian_and_mexican_towns_carry_their_country():
    toronto = nearest_town((-79.40, 43.70), radius_km=5)
    nuevo_laredo = nearest_town((-99.51, 27.48), radius_km=5)

    assert (toronto.label, toronto.country) == ("Toronto, Ontario, CA", "CA")
    assert nuevo_laredo.country == "MX"


def test_neighbourhoods_are_not_towns():
    # GeoNames lists city sections (PPLX); a via-point must be a real town on through-roads.
    town = nearest_town((-96.80, 32.78), radius_km=3)  # downtown Dallas

    assert town.label == "Dallas, Texas"


def test_wide_radius_in_the_far_north_still_finds_a_town():
    # Interior Alaska: towns are far apart, and a degree of longitude is short.
    town = nearest_town((-150.0, 64.8), radius_km=400)

    assert town is not None
    assert town.label.endswith(", Alaska")
