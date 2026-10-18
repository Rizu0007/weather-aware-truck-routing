"""One way to call a third-party JSON API: timeouts, retries, and errors as ProviderError.

Failures are mapped by status code. Provider error bodies differ between
services (see API_NOTES.md), so they are logged, not parsed here; a caller can
`accept` a status when the provider documents a machine-readable error code.
"""

import logging
import time

import requests

from trips.exceptions import ProviderError

logger = logging.getLogger(__name__)

USER_AGENT = "weather-aware-truck-routing/1.0"
TIMEOUT_S = (5, 20)  # (connect, read)
MAX_ATTEMPTS = 3
BACKOFF_S = 0.5  # doubled after each failed attempt
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


def get_json(
    provider: str, url: str, params: dict | list, accept: frozenset[int] = frozenset({200})
) -> dict | list:
    """GET `url` and return the decoded JSON body.

    Network errors, 429 and 5xx are retried with exponential backoff. A status
    outside `accept`, or a body that isn't JSON, raises ProviderError at once.
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = requests.get(
                url, params=params, timeout=TIMEOUT_S, headers={"User-Agent": USER_AGENT}
            )
        except requests.RequestException as exc:
            failure = f"{type(exc).__name__}: {exc}"
            extra = {}
        else:
            if response.status_code in accept:
                return _decode(provider, response)
            failure = f"HTTP {response.status_code}: {response.text[:200]!r}"
            extra = {"status": response.status_code}
            if response.status_code not in RETRY_STATUSES:
                logger.warning("%s request failed: %s", provider, failure)
                raise ProviderError(provider, extra=extra)

        logger.warning("%s attempt %d/%d failed: %s", provider, attempt, MAX_ATTEMPTS, failure)
        if attempt < MAX_ATTEMPTS:
            time.sleep(BACKOFF_S * 2 ** (attempt - 1))

    raise ProviderError(provider, extra=extra)


def _decode(provider: str, response: requests.Response) -> dict | list:
    try:
        return response.json()
    except ValueError as exc:
        logger.warning("%s returned a non-JSON body: %r", provider, response.text[:200])
        raise ProviderError(provider) from exc
