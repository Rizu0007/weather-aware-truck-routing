from django.urls import path

from trips.api.views import HealthApi, HeatmapCreateApi, PlaceSearchApi, TripPlanCreateApi

urlpatterns = [
    path("health", HealthApi.as_view(), name="health"),
    path("places", PlaceSearchApi.as_view(), name="places"),
    path("trip-plans", TripPlanCreateApi.as_view(), name="trip-plans"),
    path("heatmaps", HeatmapCreateApi.as_view(), name="heatmaps"),
]
