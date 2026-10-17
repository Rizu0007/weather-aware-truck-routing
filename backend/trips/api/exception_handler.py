"""Uniform JSON error bodies: {"message": str, "extra": {...}}.

Covers DRF exceptions, our ApplicationError hierarchy, unexpected exceptions
raised inside API views, and Django-level 404/500 for non-DRF paths.
"""

import logging

from django.http import JsonResponse
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from trips.exceptions import ApplicationError

logger = logging.getLogger(__name__)

INTERNAL_ERROR_MESSAGE = "Something went wrong on our side."


def _body(message: str, extra: dict | None = None) -> dict:
    return {"message": message, "extra": extra or {}}


def exception_handler(exc, context):
    if isinstance(exc, ApplicationError):
        return Response(_body(exc.message, exc.extra), status=exc.status_code)

    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled error in API view", exc_info=exc)
        return Response(_body(INTERNAL_ERROR_MESSAGE), status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if isinstance(exc, exceptions.ValidationError):
        response.data = _body("Invalid input.", {"fields": exc.detail})
    else:
        response.data = _body(str(exc.detail))
    return response


def bad_request(request, exception=None):
    return JsonResponse(_body("Bad request."), status=400)


def not_found(request, exception=None):
    return JsonResponse(_body("Not found."), status=404)


def server_error(request):
    return JsonResponse(_body(INTERNAL_ERROR_MESSAGE), status=500)
