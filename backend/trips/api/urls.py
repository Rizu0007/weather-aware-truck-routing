from django.urls import path

from trips.api.views import HealthApi

urlpatterns = [
    path("health", HealthApi.as_view(), name="health"),
]
