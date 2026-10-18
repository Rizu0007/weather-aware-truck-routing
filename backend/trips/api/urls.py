from django.urls import path

from trips.api.views import HealthApi, PlaceSearchApi, TripPlanCreateApi

urlpatterns = [
    path("health", HealthApi.as_view(), name="health"),
    path("places", PlaceSearchApi.as_view(), name="places"),
    path("trip-plans", TripPlanCreateApi.as_view(), name="trip-plans"),
]
