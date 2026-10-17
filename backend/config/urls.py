from django.urls import include, path

urlpatterns = [
    path("api/", include("trips.api.urls")),
]

handler400 = "trips.api.exception_handler.bad_request"
handler404 = "trips.api.exception_handler.not_found"
handler500 = "trips.api.exception_handler.server_error"
