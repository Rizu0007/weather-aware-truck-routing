import pytest
from django.core.cache import cache

from trips.integrations import http


@pytest.fixture(autouse=True)
def no_retry_delay(monkeypatch):
    monkeypatch.setattr(http, "BACKOFF_S", 0)


@pytest.fixture(autouse=True)
def empty_cache():
    cache.clear()
    yield
    cache.clear()
