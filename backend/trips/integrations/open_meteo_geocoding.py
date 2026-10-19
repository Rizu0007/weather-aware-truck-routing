"""Place search from Open-Meteo's geocoding: towns and cities by name, no streets.

Only the fallback while Photon is down (see services/place_search.py).
"""

import hashlib

from django.conf import settings
from django.core.cache import cache

from trips.exceptions import ProviderError
from trips.integrations.http import get_json
from trips.integrations.photon import NORTH_AMERICA_BBOX, Place

PROVIDER = "open-meteo-geocoding"
CACHE_TTL_S = 60 * 60
# Results are worldwide and can't be limited to an area, so ask for more and filter.
FETCH_COUNT = 20
WEST, SOUTH, EAST, NORTH = (float(v) for v in NORTH_AMERICA_BBOX.split(","))


def search(query: str, limit: int = 5) -> list[Place]:
    """North American places matching `query`, best match first, labelled like Photon's."""
    query = " ".join(query.split())
    digest = hashlib.sha256(query.lower().encode()).hexdigest()
    key = f"geocode:{digest}:{limit}"
    if (cached := cache.get(key)) is not None:
        return cached

    params = {"name": query, "count": FETCH_COUNT, "language": "en", "format": "json"}
    body = get_json(PROVIDER, settings.OPEN_METEO_GEOCODING_URL, params)
    try:
        results = body.get("results") or []  # no matches: the key is left out
        places: dict[str, Place] = {}
        for result in results:
            lat, lon = result["latitude"], result["longitude"]
            if not (SOUTH <= lat <= NORTH and WEST <= lon <= EAST):
                continue
            label = _label(result["name"], result.get("admin1"), result.get("country_code"))
            places.setdefault(label, Place(label, lon, lat, result.get("country_code")))
    except (AttributeError, KeyError, TypeError) as exc:
        raise ProviderError(PROVIDER, extra={"reason": "unexpected response shape"}) from exc

    found = list(places.values())[:limit]
    cache.set(key, found, CACHE_TTL_S)
    return found


def _label(name: str, region: str | None, country: str | None) -> str:
    """ "Houston, Texas", or "Toronto, Ontario, CA" outside the US, as Photon labels them."""
    parts = [name, region if region != name else None, country if country != "US" else None]
    return ", ".join(p for p in parts if p)
