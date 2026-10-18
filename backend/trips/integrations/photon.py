"""Place search and town lookup from Photon."""

import hashlib
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

from trips.domain.geo import Coord
from trips.exceptions import ProviderError
from trips.integrations.http import get_json

PROVIDER = "photon"
CACHE_TTL_S = 24 * 60 * 60
# Results are global by default; "Hous" would return French villages.
NORTH_AMERICA_BBOX = "-168,14,-52,72"
# Areas, not destinations: a search for "Dallas" also returns four Dallas counties.
AREA_TYPES = frozenset({"county", "state", "country"})
TOWN_TAGS = (("osm_tag", "place:town"), ("osm_tag", "place:city"))
TOWN_SNAP_DEG = 0.05


@dataclass(frozen=True)
class Place:
    label: str
    lon: float
    lat: float

    @property
    def coord(self) -> Coord:
        return (self.lon, self.lat)


def search(query: str, limit: int = 5) -> list[Place]:
    """Places matching `query` in North America, best match first, without duplicates."""
    query = " ".join(query.split())
    digest = hashlib.sha256(query.lower().encode()).hexdigest()
    key = f"places:{digest}:{limit}"  # free text isn't a safe cache key
    if (cached := cache.get(key)) is not None:
        return cached

    params = {"q": query, "limit": limit * 2, "lang": "en", "bbox": NORTH_AMERICA_BBOX}
    found = _places(get_json(PROVIDER, f"{settings.PHOTON_URL}/api/", params))
    places: dict[str, Place] = {}
    for props, place in found:
        if props.get("type") not in AREA_TYPES:
            places.setdefault(place.label, place)
    result = list(places.values())[:limit]
    cache.set(key, result, CACHE_TTL_S)
    return result


def nearest_town(point: Coord, radius_km: float) -> Place | None:
    """Closest town or city to `point` within `radius_km`, if any."""
    lon, lat = (round(round(v / TOWN_SNAP_DEG) * TOWN_SNAP_DEG, 2) for v in point)
    radius = max(1, round(radius_km))
    key = f"town:{lon:.2f}:{lat:.2f}:{radius}"
    if (cached := cache.get(key, default=False)) is not False:
        return cached

    params = [("lon", lon), ("lat", lat), ("radius", radius), ("limit", 1), *TOWN_TAGS]
    found = _places(get_json(PROVIDER, f"{settings.PHOTON_URL}/reverse", params))
    town = found[0][1] if found else None
    cache.set(key, town, CACHE_TTL_S)  # "no town here" is worth remembering too
    return town


def _places(body) -> list[tuple[dict, Place]]:
    """(properties, Place) for each feature that has a name or street."""
    try:
        found = []
        for feature in body["features"]:
            props = feature["properties"]
            lon, lat = feature["geometry"]["coordinates"]
            if label := _label(props):
                found.append((props, Place(label=label, lon=lon, lat=lat)))
        return found
    except (KeyError, TypeError, ValueError) as exc:
        raise ProviderError(PROVIDER, extra={"reason": "unexpected response shape"}) from exc


def _label(props: dict) -> str:
    """E.g. "Dallas, Texas"; "" if there's no name or street. Fields vary per feature."""
    street = " ".join(p for p in (props.get("housenumber"), props.get("street")) if p)
    name = props.get("name") or street
    if not name:
        return ""
    city = props.get("city")
    country = props.get("countrycode")
    parts = [
        name,
        street if street != name else None,
        city if city != name else None,
        props.get("state"),
        country if country != "US" else None,
    ]
    return ", ".join(p for p in parts if p)
