import requests
import responses
from django.conf import settings

from tests.conftest import load_sample

SEARCH_URL = f"{settings.PHOTON_URL}/api/"
GEOCODING_URL = settings.OPEN_METEO_GEOCODING_URL


@responses.activate
def test_returns_places(client):
    responses.get(SEARCH_URL, json=load_sample("photon_search_bbox"))

    response = client.get("/api/places", {"q": "Paris"})

    assert response.status_code == 200
    assert response.json()[0] == {"label": "Paris, Texas", "lat": 33.6617962, "lon": -95.555513}


def test_query_is_required(client):
    response = client.get("/api/places")

    assert response.status_code == 400
    assert response.json()["extra"]["fields"]["q"] == ["This field is required."]


def test_query_must_be_at_least_two_characters(client):
    assert client.get("/api/places", {"q": "D"}).status_code == 400


@responses.activate
def test_photon_outage_falls_back_to_open_meteo_towns(client):
    responses.get(SEARCH_URL, body=requests.ConnectionError("refused"))
    responses.get(GEOCODING_URL, json=load_sample("open_meteo_geocoding_search"))

    response = client.get("/api/places", {"q": "Hous"})

    assert response.status_code == 200
    labels = [place["label"] for place in response.json()]
    assert labels[0] == "Houston, Texas"
    assert len(labels) == 5
    # Worldwide matches are dropped: Finland, Burkina Faso, China…
    assert all(place["lat"] > 14 and -168 < place["lon"] < -52 for place in response.json())


@responses.activate
def test_after_a_photon_failure_the_next_search_goes_straight_to_the_fallback(client):
    responses.get(SEARCH_URL, body=requests.ConnectionError("refused"))
    responses.get(GEOCODING_URL, json=load_sample("open_meteo_geocoding_search"))

    client.get("/api/places", {"q": "Hous"})
    photon_calls = sum(SEARCH_URL in c.request.url for c in responses.calls)
    client.get("/api/places", {"q": "Houst"})

    assert sum(SEARCH_URL in c.request.url for c in responses.calls) == photon_calls


@responses.activate
def test_no_match_in_the_fallback_is_an_empty_list(client):
    responses.get(SEARCH_URL, body=requests.ConnectionError("refused"))
    responses.get(GEOCODING_URL, json={"generationtime_ms": 0.05})

    response = client.get("/api/places", {"q": "Zzqxw"})

    assert response.status_code == 200
    assert response.json() == []


@responses.activate
def test_both_providers_down_is_a_502(client):
    responses.get(SEARCH_URL, body=requests.ConnectionError("down"))
    responses.get(GEOCODING_URL, body=requests.ConnectionError("down"))

    response = client.get("/api/places", {"q": "Paris"})

    assert response.status_code == 502
    assert response.json()["extra"] == {"provider": "open-meteo-geocoding"}
