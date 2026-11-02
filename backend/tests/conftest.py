import json
import threading
from pathlib import Path

import pytest
from django.core.cache import cache

from trips.integrations import http

FIXTURES = Path(__file__).parent / "fixtures"


def load_sample(name: str):
    """A saved API response from scripts/samples (copied into tests/fixtures)."""
    return json.loads((FIXTURES / f"{name}.json").read_text())


@pytest.fixture(autouse=True)
def empty_cache():
    cache.clear()
    yield
    # A lookup the code gave up on still finishes in its thread and caches its answer;
    # wait for it, or it lands in the next test's cache.
    for thread in threading.enumerate():
        if thread.name.startswith("ThreadPoolExecutor"):
            thread.join(timeout=5)
    cache.clear()


@pytest.fixture(autouse=True)
def fake_towns(monkeypatch):
    """Route options look up towns in a table the test fills (tests.mocks.mock_towns).

    The real bundled list is tested in tests/domain/test_towns.py.
    """
    from tests import mocks
    from trips.services import route_options

    mocks.TOWN_ANSWERS.clear()
    monkeypatch.setattr(route_options, "nearest_town", mocks.fake_nearest_town)


@pytest.fixture(autouse=True)
def no_retry_delay(monkeypatch):
    monkeypatch.setattr(http, "BACKOFF_S", 0)


@pytest.fixture
def dallas_houston_route():
    """(coords, segment_seconds, osrm_route) for the fastest Dallas-Houston route."""
    route = load_sample("osrm_route_short_alternatives")["routes"][0]
    coords = [tuple(c) for c in route["geometry"]["coordinates"]]
    seconds = [s for leg in route["legs"] for s in leg["annotation"]["duration"]]
    return coords, seconds, route
