from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from trips.api.serializers import (
    HeatmapInputSerializer,
    HeatmapOutputSerializer,
    PlaceOutputSerializer,
    PlaceSearchInputSerializer,
    TripPlanInputSerializer,
    TripPlanOutputSerializer,
)
from trips.integrations import photon
from trips.services.heatmap import build_heatmap
from trips.services.trip_planning import plan_trip


class HealthApi(APIView):
    """Also used by the frontend to wake a sleeping Render instance."""

    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})


class PlaceSearchApi(APIView):
    throttle_scope = "places"

    def get(self, request: Request) -> Response:
        params = PlaceSearchInputSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        places = photon.search(params.validated_data["q"])
        return Response(PlaceOutputSerializer(places, many=True).data)


class TripPlanCreateApi(APIView):
    throttle_scope = "trip-plans"

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


class HeatmapCreateApi(APIView):
    throttle_scope = "heatmaps"

    def post(self, request: Request) -> Response:
        params = HeatmapInputSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        heatmap = build_heatmap(**params.validated_data)
        return Response(HeatmapOutputSerializer(heatmap).data)
