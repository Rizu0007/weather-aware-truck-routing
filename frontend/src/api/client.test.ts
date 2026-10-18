import { describe, expect, it, vi } from "vitest";

import { ApiError, request } from "@/api/client";
import { jsonResponse } from "@/test/api";
import errorFixture from "@/test/fixtures/error-invalid-input.json";

function respondWith(response: Response | (() => Promise<Response>)) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      typeof response === "function" ? response : () => Promise.resolve(response),
    );
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ApiError)) throw new Error(`expected an ApiError, got ${String(error)}`);
  return error;
}

describe("request", () => {
  it("calls /api on the same origin and returns the JSON body", async () => {
    const fetch = respondWith(jsonResponse({ status: "ok" }));

    await expect(request("/health")).resolves.toEqual({ status: "ok" });
    expect(fetch).toHaveBeenCalledWith("/api/health", expect.objectContaining({ method: "GET" }));
  });

  it("sends a JSON body for POST", async () => {
    const fetch = respondWith(jsonResponse({}));

    await request("/trip-plans", { method: "POST", body: { load_lb: 35000 } });

    const [, init] = fetch.mock.calls[0];
    expect(init?.body).toBe('{"load_lb":35000}');
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
  });
});

describe("ApiError mapping", () => {
  it("400: validation, with the first message per field", async () => {
    respondWith(jsonResponse(errorFixture, 400));

    const error = await failure(request("/trip-plans"));

    expect(error.kind).toBe("validation");
    expect(error.message).toBe("Invalid input.");
    expect(error.fieldErrors).toEqual({
      origin: "This field is required.",
      destination: "This field is required.",
      departure: "This field is required.",
      load_lb: "This field is required.",
    });
  });

  it("400: nested serializer errors flatten to the field", async () => {
    respondWith(
      jsonResponse(
        { message: "Invalid input.", extra: { fields: { origin: { lat: ["Too high."] } } } },
        400,
      ),
    );

    expect((await failure(request("/trip-plans"))).fieldErrors).toEqual({ origin: "Too high." });
  });

  it("422 with latest_departure: beyond the forecast", async () => {
    const body = {
      message: "Forecasts only reach about 15 days ahead. Choose an earlier departure.",
      extra: { latest_departure: "2026-10-31T05:00:00+00:00" },
    };
    respondWith(jsonResponse(body, 422));

    const error = await failure(request("/trip-plans"));

    expect(error.kind).toBe("beyond_forecast");
    expect(error.latestDeparture).toBe("2026-10-31T05:00:00+00:00");
  });

  it("422 otherwise: no route", async () => {
    respondWith(
      jsonResponse(
        { message: "No drivable route was found between these places.", extra: {} },
        422,
      ),
    );

    const error = await failure(request("/trip-plans"));

    expect(error.kind).toBe("no_route");
    expect(error.latestDeparture).toBeUndefined();
  });

  it("503 from a rate-limited provider: busy, retry_after from the body", async () => {
    const body = {
      message: "The weather or routing service is busy. Please try again in a minute.",
      extra: { provider: "open-meteo", status: 429, retry_after: 42 },
    };
    respondWith(jsonResponse(body, 503));

    const error = await failure(request("/heatmaps"));

    expect(error.kind).toBe("busy");
    expect(error.retryAfterS).toBe(42);
  });

  it("429 from our own rate limit: busy, Retry-After from the header", async () => {
    const body = { message: "Request was throttled. Expected available in 17 seconds.", extra: {} };
    respondWith(jsonResponse(body, 429, { "Retry-After": "17" }));

    expect((await failure(request("/trip-plans"))).retryAfterS).toBe(17);
  });

  it("502: a provider failed", async () => {
    const body = {
      message: "An external service is unavailable. Please try again shortly.",
      extra: { provider: "osrm" },
    };
    respondWith(jsonResponse(body, 502));

    const error = await failure(request("/trip-plans"));

    expect(error.kind).toBe("provider");
    expect(error.extra.provider).toBe("osrm");
  });

  it("a non-JSON page from a proxy: server, with our own message", async () => {
    respondWith(new Response("<html>504 Gateway Timeout</html>", { status: 504 }));

    const error = await failure(request("/trip-plans"));

    expect(error.kind).toBe("server");
    expect(error.status).toBe(504);
    expect(error.message).toMatch(/server is unavailable/);
  });

  it("no response: network", async () => {
    respondWith(() => Promise.reject(new TypeError("Failed to fetch")));

    const error = await failure(request("/health"));

    expect(error.kind).toBe("network");
    expect(error.status).toBe(0);
  });

  it("too slow: timeout", async () => {
    respondWith(
      () =>
        new Promise<Response>((_, reject) => {
          const signal = vi.mocked(fetch).mock.lastCall?.[1]?.signal;
          signal?.addEventListener("abort", () => reject(signal.reason as DOMException));
        }),
    );

    expect((await failure(request("/trip-plans", { timeoutMs: 20 }))).kind).toBe("timeout");
  });

  it("cancelled by the caller: rethrows the abort, not an ApiError", async () => {
    respondWith(
      () =>
        new Promise<Response>((_, reject) => {
          const signal = vi.mocked(fetch).mock.lastCall?.[1]?.signal;
          signal?.addEventListener("abort", () => reject(signal.reason as DOMException));
        }),
    );
    const controller = new AbortController();

    const pending = request("/places?q=dal", { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });
});
