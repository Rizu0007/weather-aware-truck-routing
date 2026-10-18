from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.api.serializers import (
    PlaceOutputSerializer,
    PlaceSearchInputSerializer,
    TripPlanInputSerializer,
    TripPlanOutputSerializer,
)
from trips.integrations import photon
from trips.services.trip_planning import plan_trip


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


class TripPlanCreateApi(APIView):
    """Route options with weather risk along each, ranked, for one departure and load."""

    def post(self, request: Request) -> Response:
        params = TripPlanInputSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        data = params.validated_data
        plan = plan_trip(
            origin=(data["origin"]["lon"], data["origin"]["lat"]),
            destination=(data["destination"]["lon"], data["destination"]["lat"]),
            departure=data["departure"],
            load_lb=data["load_lb"],
            interval_mi=data["interval_mi"],
        )
        return Response(TripPlanOutputSerializer(plan).data)
