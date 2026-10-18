from datetime import datetime, timedelta

from django.utils import timezone

from trips.exceptions import ForecastHorizonError

# Open-Meteo serves ~15 days ahead; keep a margin.
FORECAST_HORIZON = timedelta(days=15) - timedelta(hours=6)
HEATMAP_HOURS = 48


def latest_departure(trip: timedelta) -> datetime:
    """Latest departure whose trip and 48 h heatmap the forecast still covers."""
    needed = max(trip, timedelta(hours=HEATMAP_HOURS))
    return timezone.now() + FORECAST_HORIZON - needed


def check_forecast_horizon(departure: datetime, trip: timedelta) -> None:
    latest = latest_departure(trip)
    if departure > latest:
        raise ForecastHorizonError(
            "Forecasts only reach about 15 days ahead. Choose an earlier departure.",
            extra={
                "latest_departure": latest.replace(minute=0, second=0, microsecond=0).isoformat()
            },
        )
