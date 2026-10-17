from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthApi(APIView):
    """Liveness check; the frontend also calls it to wake a sleeping instance."""

    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})
