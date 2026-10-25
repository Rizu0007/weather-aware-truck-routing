"""Place search: Photon, or Open-Meteo's geocoding while Photon is down.

Photon's public server has outages of hours (connections refused). The fallback finds towns
and cities only, which is what most trips start and end at.
"""

import logging

from trips.exceptions import ProviderError
from trips.integrations import open_meteo_geocoding, photon
from trips.integrations.photon import Place

logger = logging.getLogger(__name__)


def search(query: str) -> list[Place]:
    if not photon.is_down():
        try:
            return photon.search(query)
        except ProviderError:
            logger.warning(
                "Photon failed; searching places with Open-Meteo for %d s", photon.OUTAGE_S
            )
            photon.mark_down()
    return open_meteo_geocoding.search(query)
