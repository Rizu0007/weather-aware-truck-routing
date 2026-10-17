import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


def load_sample(name: str):
    """A saved API response from scripts/samples (copied into tests/fixtures)."""
    return json.loads((FIXTURES / f"{name}.json").read_text())


@pytest.fixture
def dallas_houston_route():
    """(coords, segment_seconds, osrm_route) for the fastest Dallas-Houston route."""
    route = load_sample("osrm_route_short_alternatives")["routes"][0]
    coords = [tuple(c) for c in route["geometry"]["coordinates"]]
    seconds = [s for leg in route["legs"] for s in leg["annotation"]["duration"]]
    return coords, seconds, route
