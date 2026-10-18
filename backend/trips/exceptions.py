"""Domain-level errors. The API layer maps each one to an HTTP status code."""


class ApplicationError(Exception):
    """Base class for errors we expect and can explain to the user."""

    status_code = 400
    default_message = "The request could not be completed."

    def __init__(self, message: str | None = None, extra: dict | None = None):
        self.message = message or self.default_message
        self.extra = extra or {}
        super().__init__(self.message)


class NoRouteError(ApplicationError):
    status_code = 422
    default_message = "No drivable route was found between these places."


class ForecastHorizonError(ApplicationError):
    status_code = 422
    default_message = "The trip extends beyond the available weather forecast."


class ProviderError(ApplicationError):
    """A third-party service failed or returned something we can't use."""

    status_code = 502
    default_message = "An external service is unavailable. Please try again shortly."

    def __init__(self, provider: str, message: str | None = None, extra: dict | None = None):
        super().__init__(message, {"provider": provider, **(extra or {})})
        self.provider = provider


class ProviderBusyError(ProviderError):
    """The provider's rate limit is used up; retrying straight away won't help."""

    status_code = 503
    default_message = "The weather or routing service is busy. Please try again in a minute."
