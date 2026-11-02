import pytest
import responses
from django.conf import settings

from tests.conftest import load_sample
from trips.exceptions import ProviderError
from trips.integrations.photon import NORTH_AMERICA_BBOX, search

SEARCH_URL = f"{settings.PHOTON_URL}/api/"


@responses.activate
def test_search_drops_counties_and_builds_labels():
    # "Dallas" returns the city, then four Dallas counties.
    responses.get(SEARCH_URL, json=load_sample("photon_search_city"))

    places = search("Dallas")

    assert [p.label for p in places] == ["Dallas, Texas"]
    assert places[0].coord == pytest.approx((-96.797, 32.777), abs=0.01)


@responses.activate
def test_search_labels_addresses_with_street_and_city():
    responses.get(SEARCH_URL, json=load_sample("photon_search_address"))

    first = search("1600 Pennsylvania Ave Washington")[0]

    assert first.label == (
        "White House, 1600 Pennsylvania Avenue Northwest, Washington, District of Columbia"
    )


@responses.activate
def test_search_is_limited_to_north_america():
    responses.get(SEARCH_URL, json=load_sample("photon_search_bbox"))

    labels = [p.label for p in search("Paris")]

    assert labels[:3] == ["Paris, Texas", "Paris, Kentucky", "Paris, Arkansas"]
    params = responses.calls[0].request.params
    assert params["bbox"] == NORTH_AMERICA_BBOX
    assert params["lang"] == "en"


@responses.activate
def test_search_without_matches_is_empty():
    responses.get(SEARCH_URL, json=load_sample("photon_empty_result"))

    assert search("qwxzvbnmplkj") == []


@responses.activate
def test_search_skips_features_without_a_name_or_street():
    body = load_sample("photon_search_bbox")
    del body["features"][0]["properties"]["name"]
    responses.get(SEARCH_URL, json=body)

    assert search("Paris")[0].label == "Paris, Kentucky"


@responses.activate
def test_search_is_cached_by_normalised_query():
    responses.get(SEARCH_URL, json=load_sample("photon_search_city"))

    search("Dallas")
    search("  dallas ")

    assert len(responses.calls) == 1


@responses.activate
def test_search_error_is_a_provider_error():
    responses.get(SEARCH_URL, status=400, json=load_sample("photon_error_missing_q"))

    with pytest.raises(ProviderError):
        search("x")


def feature(name, osm_key, lon=-80.19, lat=25.77, **props):
    return {
        "type": "Feature",
        "properties": {"name": name, "osm_key": osm_key, "type": "city", **props},
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }


@responses.activate
def test_search_puts_towns_before_streets():
    # Photon's real order for the typo "Maimi".
    streets = [feature("Maimi Circle", "highway", city="Indian Wells", state="California")]
    towns = [feature("Miami", "place", state="Florida")]
    responses.get(SEARCH_URL, json={"type": "FeatureCollection", "features": streets + towns})

    assert [p.label for p in search("Maimi")] == [
        "Miami, Florida",
        "Maimi Circle, Indian Wells, California",
    ]


@responses.activate
def test_search_keeps_photons_order_for_an_address():
    streets = [feature("Main Street", "highway", housenumber="12", city="Miami", state="Florida")]
    towns = [feature("Main", "place", state="Maine")]
    responses.get(SEARCH_URL, json={"type": "FeatureCollection", "features": streets + towns})

    assert search("12 Main")[0].label.startswith("Main Street")
