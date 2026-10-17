import pytest
from rest_framework import exceptions

from trips.api.exception_handler import exception_handler
from trips.exceptions import ForecastHorizonError, NoRouteError, ProviderError


def handle(exc):
    response = exception_handler(exc, context={})
    return response.status_code, response.data


def test_validation_error_lists_field_errors():
    status, body = handle(exceptions.ValidationError({"load_lb": ["Must be positive."]}))

    assert status == 400
    assert body["message"] == "Invalid input."
    assert body["extra"]["fields"] == {"load_lb": ["Must be positive."]}


def test_other_drf_errors_keep_their_status_and_detail():
    status, body = handle(exceptions.NotFound("No such plan."))

    assert status == 404
    assert body == {"message": "No such plan.", "extra": {}}


@pytest.mark.parametrize(
    ("exc", "expected_status"),
    [(NoRouteError(), 422), (ForecastHorizonError(), 422), (ProviderError("osrm"), 502)],
)
def test_application_errors_map_to_their_status(exc, expected_status):
    status, body = handle(exc)

    assert status == expected_status
    assert body["message"] == exc.default_message


def test_provider_error_names_the_provider():
    _, body = handle(ProviderError("open_meteo", "Weather service timed out."))

    assert body == {"message": "Weather service timed out.", "extra": {"provider": "open_meteo"}}


def test_unexpected_error_becomes_generic_500(caplog):
    status, body = handle(RuntimeError("boom"))

    assert status == 500
    assert body == {"message": "Something went wrong on our side.", "extra": {}}
    assert "Unhandled error in API view" in caplog.text
