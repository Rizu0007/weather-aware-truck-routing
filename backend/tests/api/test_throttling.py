import responses
from django.conf import settings

from tests.conftest import load_sample


@responses.activate
def test_place_search_is_rate_limited_per_client(client):
    responses.get(f"{settings.PHOTON_URL}/api/", json=load_sample("photon_search_city"))
    limit = int(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["places"].split("/")[0])

    results = [client.get("/api/places", {"q": f"Dallas {i}"}) for i in range(limit + 1)]

    assert [r.status_code for r in results[:limit]] == [200] * limit
    assert results[-1].status_code == 429
    assert set(results[-1].json()) == {"message", "extra"}
