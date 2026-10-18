import pytest
import requests
import responses

from trips.exceptions import ProviderError
from trips.integrations.http import MAX_ATTEMPTS, get_json

URL = "https://api.example.test/v1"


@responses.activate
def test_returns_decoded_json_and_sends_params():
    responses.get(URL, json={"ok": True})

    assert get_json("example", URL, {"q": "dallas"}) == {"ok": True}
    assert responses.calls[0].request.params == {"q": "dallas"}


@responses.activate
@pytest.mark.parametrize("failure", [503, 429, requests.ConnectTimeout("timed out")])
def test_retries_transient_failures(failure):
    if isinstance(failure, int):
        responses.get(URL, status=failure)
    else:
        responses.get(URL, body=failure)
    responses.get(URL, json=[1, 2])

    assert get_json("example", URL, {}) == [1, 2]
    assert len(responses.calls) == 2


@responses.activate
def test_gives_up_after_max_attempts():
    responses.get(URL, status=502)

    with pytest.raises(ProviderError) as info:
        get_json("example", URL, {})

    assert len(responses.calls) == MAX_ATTEMPTS
    assert info.value.extra == {"provider": "example", "status": 502}


@responses.activate
def test_network_failure_after_max_attempts():
    responses.get(URL, body=requests.ConnectionError("TLS handshake timeout"))

    with pytest.raises(ProviderError) as info:
        get_json("example", URL, {})

    assert len(responses.calls) == MAX_ATTEMPTS
    assert info.value.extra == {"provider": "example"}


@responses.activate
@pytest.mark.parametrize("status", [400, 404, 414])
def test_client_errors_are_not_retried(status):
    # 414 comes back with an empty body (API_NOTES.md, Open-Meteo errors).
    responses.get(URL, status=status, body="")

    with pytest.raises(ProviderError) as info:
        get_json("example", URL, {})

    assert len(responses.calls) == 1
    assert info.value.status_code == 502
    assert info.value.extra["status"] == status


@responses.activate
def test_non_json_body_is_a_provider_error():
    responses.get(URL, body="<html>maintenance</html>")

    with pytest.raises(ProviderError):
        get_json("example", URL, {})


@responses.activate
def test_api_keys_are_redacted_from_logs(caplog):
    responses.get(
        URL, body=requests.ConnectionError(f"Max retries exceeded with url: {URL}?apikey=s3cret")
    )

    with pytest.raises(ProviderError):
        get_json("example", URL, {"apikey": "s3cret"})

    assert "s3cret" not in caplog.text
    assert "apikey=***" in caplog.text
