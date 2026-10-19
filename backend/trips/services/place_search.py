"""Place search: Photon, or Open-Meteo's geocoding while Photon is down.

Photon's public server has outages of hours (connections refused). The fallback finds towns
and cities only, which is what most trips start and end at.
"""

import logging

from django.core.cache import cache

from trips.exceptions import ProviderError
from trips.integrations import open_meteo_geocoding, photon
from trips.integrations.photon import Place

logger = logging.getLogger(__name__)

# After a failure, skip Photon for this long: each try costs its retries on every keystroke.
OUTAGE_KEY = "photon-down"
OUTAGE_S = 60


def search(query: str) -> list[Place]:
    if not cache.get(OUTAGE_KEY):
        try:
            return photon.search(query)
        except ProviderError:
            logger.warning("Photon failed; searching places with Open-Meteo for %d s", OUTAGE_S)
            cache.set(OUTAGE_KEY, True, OUTAGE_S)
    return open_meteo_geocoding.search(query)
