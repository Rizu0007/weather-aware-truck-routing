"""Provider mocks built from the saved samples, for use inside @responses.activate tests."""

import copy
import json
import re
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import responses
from django.conf import settings

from tests.conftest import load_sample
from trips.domain.alternatives import VIA_OFFSETS, via_point
from trips.integrations.photon import TOWN_SNAP_DEG

OSRM_URL = re.compile(re.escape(settings.OSRM_URL) + r"/route/v1/driving/.*")
REVERSE_URL = f"{settings.PHOTON_URL}/reverse"
OPEN_METEO_URL = settings.OPEN_METEO_URL
TIME_FORMAT = "%Y-%m-%dT%H:%M"

DALLAS = (-96.797, 32.7767)
HOUSTON = (-95.3698, 29.7604)


def native():
    """Direct Dallas-Houston answer: OSRM returns only one route."""
    return load_sample("osrm_route_short_alternatives")


def via_route(shift_lon=0.0, duration_factor=1.0):
    """Saved via-point route (x1.29 the fastest, 4 % overlap), optionally moved or slowed."""
    body = load_sample("osrm_route_via_point")
    route = body["routes"][0]
    route["geometry"]["coordinates"] = [
        [lon + shift_lon, lat] for lon, lat in route["geometry"]["coordinates"]
    ]
    route["duration"] *= duration_factor
    return body


def is_via_request(url: str) -> bool:
    return url.split("?")[0].count(";") == 2


def mock_osrm(direct, via_answers=()):
    """Direct requests get `direct`; each via request gets the next (status, body)."""
    queue = list(via_answers)

    def callback(request):
        status, body = queue.pop(0) if is_via_request(request.url) else direct
        return status, {}, json.dumps(body)

    responses.add_callback(responses.GET, OSRM_URL, callback=callback)


def town(name, lon, lat):
    feature = copy.deepcopy(load_sample("photon_reverse_town")["features"][0])
    feature["properties"]["name"] = name
    feature["geometry"]["coordinates"] = [lon, lat]
    return {"type": "FeatureCollection", "features": [feature]}


def no_town():
    return load_sample("photon_reverse_no_town")


def mock_towns(answers, origin=DALLAS, destination=HOUSTON):
    """Answer each via-point's /reverse lookup: answers[i] is for VIA_OFFSETS[i].

    An answer is a body, a (status, body) pair, or a callable returning either.

    Matched by coordinates, not call order, because the lookups run in parallel.
    """
    by_point = {}
    for offset, answer in zip(VIA_OFFSETS, answers, strict=False):
        lon, lat = via_point(origin, destination, offset)
        by_point[(_snap(lon), _snap(lat))] = answer

    def callback(request):
        query = parse_qs(urlparse(request.url).query)
        point = (round(float(query["lon"][0]), 2), round(float(query["lat"][0]), 2))
        answer = by_point.get(point, no_town())
        if callable(answer):  # e.g. a slow answer
            answer = answer(request)
        if isinstance(answer, tuple):  # (status, body)
            return answer[0], {}, json.dumps(answer[1])
        return 200, {}, json.dumps(answer)

    responses.add_callback(responses.GET, REVERSE_URL, callback=callback)


def _snap(value: float) -> float:
    # Same rounding as photon.nearest_town.
    return round(round(value / TOWN_SNAP_DEG) * TOWN_SNAP_DEG, 2)


def calm(lon, lat, hour):
    return {"wind": 7.0, "rain": 0.0, "showers": 0.0, "snow": 0.0}


def mock_forecast(weather=calm):
    """Answer Open-Meteo in the sample's shape; `weather(lon, lat, hour)` gives the values."""
    template = load_sample("open_meteo_single_location")

    def callback(request):
        query = parse_qs(urlparse(request.url).query)
        lats = [float(v) for v in query["latitude"][0].split(",")]
        lons = [float(v) for v in query["longitude"][0].split(",")]
        start = datetime.strptime(query["start_hour"][0], TIME_FORMAT)
        end = datetime.strptime(query["end_hour"][0], TIME_FORMAT)
        hours = range(int((end - start) / timedelta(hours=1)) + 1)

        locations = []
        for i, (lon, lat) in enumerate(zip(lons, lats, strict=True)):
            values = [weather(lon, lat, h) for h in hours]
            location = copy.deepcopy(template)
            location["hourly"] = {
                "time": [(start + timedelta(hours=h)).strftime(TIME_FORMAT) for h in hours],
                "wind_speed_10m": [v["wind"] for v in values],
                "rain": [v["rain"] for v in values],
                "showers": [v["showers"] for v in values],
                "snowfall": [v["snow"] for v in values],
            }
            if i:
                location["location_id"] = i
            locations.append(location)
        body = locations[0] if len(locations) == 1 else locations
        return 200, {}, json.dumps(body)

    responses.add_callback(responses.GET, OPEN_METEO_URL, callback=callback)
