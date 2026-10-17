"""Shared helper for the API probe scripts (standard library only).

Each probe call prints status code, response time and size, and saves the raw
response body to scripts/samples/<name>.json.
"""

import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SAMPLES = Path(__file__).parent / "samples"
USER_AGENT = "weather-aware-truck-routing-probe/1.0"
# Samples larger than this have their long arrays trimmed so the repo stays small.
MAX_SAMPLE_BYTES = 300_000


def _trim(value, keep=12):
    """Shorten long lists recursively, leaving a marker of how much was cut."""
    if isinstance(value, list):
        items = [_trim(v, keep) for v in value[:keep]]
        if len(value) > keep:
            items.append(f"... {len(value) - keep} more items trimmed by probe ...")
        return items
    if isinstance(value, dict):
        return {k: _trim(v, keep) for k, v in value.items()}
    return value


def call(name, url, params=None, timeout=20.0, save=True):
    """GET `url` and report. Returns (status, parsed_json_or_None, headers)."""
    full = url + ("?" + urllib.parse.urlencode(params, safe=",:;") if params else "")
    req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
    started = time.perf_counter()
    status, body, headers = None, b"", {}
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status, body, headers = resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        status, body, headers = exc.code, exc.read(), dict(exc.headers)
    except (urllib.error.URLError, socket.timeout, TimeoutError) as exc:
        elapsed = time.perf_counter() - started
        print(f"[{name}] NETWORK ERROR after {elapsed:.2f}s: {type(exc).__name__}: {getattr(exc, 'reason', exc)}")
        return None, None, {}
    elapsed = time.perf_counter() - started

    try:
        data = json.loads(body)
    except ValueError:
        data = None

    print(f"[{name}] HTTP {status} in {elapsed:.2f}s, {len(body):,} bytes, url length {len(full):,}")
    if data is None:
        print(f"    non-JSON body: {body[:200]!r}")

    if save:
        SAMPLES.mkdir(exist_ok=True)
        out = SAMPLES / f"{name}.json"
        if data is None:
            out.write_text(json.dumps({"_non_json_body": body.decode(errors="replace")[:2000]}, indent=2))
        elif len(body) > MAX_SAMPLE_BYTES:
            out = SAMPLES / f"{name}.trimmed.json"
            out.write_text(json.dumps(_trim(data), indent=2))
        else:
            out.write_text(json.dumps(data, indent=2))
    return status, data, headers


def show(label, value):
    print(f"    {label}: {value}")


def rate_limit_headers(headers):
    keys = [k for k in headers if "rate" in k.lower() or "limit" in k.lower() or k.lower() == "retry-after"]
    return {k: headers[k] for k in keys} or "none"
