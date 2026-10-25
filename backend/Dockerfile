FROM python:3.12-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:$PATH"
WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
COPY pyproject.toml uv.lock .python-version ./

FROM base AS test
RUN uv sync --locked
COPY . .
CMD ["sh", "-c", "ruff check && ruff format --check && pytest"]

# Last, so hosts that build without a target (Render) get the server, not the tests.
FROM base AS runtime
RUN uv sync --locked --no-dev
COPY . .
RUN useradd --create-home app
USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
# One worker so the in-memory cache (routes, weather, rate limits) is shared by every
# request; threads, because requests mostly wait on providers. Timeout covers slow retries.
CMD ["gunicorn", "config.wsgi", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "8", "--timeout", "120"]
