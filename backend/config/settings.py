"""One settings module for every environment; differences come from env vars."""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DJANGO_DEBUG=(bool, False),
    DJANGO_ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    LOG_LEVEL=(str, "INFO"),
    OSRM_URL=(str, "https://router.project-osrm.org"),
    OPEN_METEO_URL=(str, "https://api.open-meteo.com/v1/forecast"),
    OPEN_METEO_API_KEY=(str, ""),
    PHOTON_URL=(str, "https://photon.komoot.io"),
    # Reverse proxies in front of Django (Vercel, Render); used to find the client IP.
    NUM_PROXIES=(int, 0),
)
if (BASE_DIR / ".env").exists():
    environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DJANGO_DEBUG")
ALLOWED_HOSTS = env("DJANGO_ALLOWED_HOSTS")

INSTALLED_APPS = [
    "rest_framework",
    "trips",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Stateless API: no database, sessions, admin or static files.
DATABASES = {}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "TIMEOUT": 15 * 60,
        "OPTIONS": {"MAX_ENTRIES": 20_000},
    }
}

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "trips.api.exception_handler.exception_handler",
    # Per client IP; protects the free provider quotas (Open-Meteo: 600 calls/min).
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"trip-plans": "20/min", "places": "120/min"},
    "NUM_PROXIES": env("NUM_PROXIES"),
}

OSRM_URL = env("OSRM_URL")
OPEN_METEO_URL = env("OPEN_METEO_URL")
OPEN_METEO_API_KEY = env("OPEN_METEO_API_KEY")
PHOTON_URL = env("PHOTON_URL")

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_TZ = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL")},
}
