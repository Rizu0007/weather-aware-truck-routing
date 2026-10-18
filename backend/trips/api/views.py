from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.api.serializers import PlaceOutputSerializer, PlaceSearchInputSerializer
from trips.integrations import photon


class HealthApi(APIView):
    """Liveness check; the frontend also calls it to wake a sleeping instance."""

    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})


class PlaceSearchApi(APIView):
    """Autocomplete for the origin and destination fields."""

    def get(self, request: Request) -> Response:
        params = PlaceSearchInputSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        places = photon.search(params.validated_data["q"])
        return Response(PlaceOutputSerializer(places, many=True).data)
