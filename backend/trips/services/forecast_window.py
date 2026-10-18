from datetime import datetime, timedelta

from django.utils import timezone

from trips.exceptions import ForecastHorizonError

# Open-Meteo serves ~15 days ahead; keep a margin.
FORECAST_HORIZON = timedelta(days=15) - timedelta(hours=6)
HEATMAP_HOURS = 48


def check_forecast_horizon(departure: datetime, needed: timedelta) -> None:
    """Raise if forecasts don't reach `needed` past departure; the heatmap always needs 48 h."""
    needed = max(needed, timedelta(hours=HEATMAP_HOURS))
    latest_end = timezone.now() + FORECAST_HORIZON
    if departure + needed > latest_end:
        latest_departure = (latest_end - needed).replace(minute=0, second=0, microsecond=0)
        raise ForecastHorizonError(
            "Forecasts only reach about 15 days ahead. Choose an earlier departure.",
            extra={"latest_departure": latest_departure.isoformat()},
        )
