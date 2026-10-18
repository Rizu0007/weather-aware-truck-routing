import requests
import responses
from django.conf import settings

from tests.conftest import load_sample

SEARCH_URL = f"{settings.PHOTON_URL}/api/"


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
def test_provider_outage_is_a_502(client):
    responses.get(SEARCH_URL, body=requests.ConnectionError("down"))

    response = client.get("/api/places", {"q": "Paris"})

    assert response.status_code == 502
    assert response.json()["extra"] == {"provider": "photon"}
