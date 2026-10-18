import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useHeatmap, useTripPlan } from "@/hooks/use-trip-plan";
import { createQueryWrapper, jsonResponse, mockFetch } from "@/test/api";
import heatmap from "@/test/fixtures/heatmap.json";
import tripPlan from "@/test/fixtures/trip-plan.json";
import type { TripPlan } from "@/types/api";
import type { TripParams } from "@/utils/trip-params";

const TRIP: TripParams = {
  origin: { label: "Dallas, Texas", lat: 32.7767, lon: -96.797 },
  destination: { label: "Houston, Texas", lat: 29.7604, lon: -95.3698 },
  departure: "2026-10-18T14:00:00.000Z",
  loadLb: 35_000,
  intervalMi: 25,
};
const PLAN = tripPlan as TripPlan;

describe("useTripPlan", () => {
  it("stays idle without a trip", () => {
    const fetch = mockFetch({});

    const { result } = renderHook(() => useTripPlan(null), {
      wrapper: createQueryWrapper().wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the trip and returns the plan", async () => {
    const fetch = mockFetch({ "/api/trip-plans": tripPlan });

    const { result } = renderHook(() => useTripPlan(TRIP), {
      wrapper: createQueryWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.recommended_route_id).toBe("B");
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({
      origin: { lat: 32.7767, lon: -96.797 },
      destination: { lat: 29.7604, lon: -95.3698 },
      departure: "2026-10-18T14:00:00.000Z",
      load_lb: 35_000,
      interval_mi: 25,
    });
  });

  it("exposes the API error", async () => {
    mockFetch({
      "/api/trip-plans": jsonResponse(
        { message: "No drivable route was found between these places.", extra: {} },
        422,
      ),
    });

    const { result } = renderHook(() => useTripPlan(TRIP), {
      wrapper: createQueryWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ kind: "no_route" });
  });
});

describe("useHeatmap", () => {
  it("waits for a plan", () => {
    const fetch = mockFetch({});

    renderHook(() => useHeatmap(undefined), { wrapper: createQueryWrapper().wrapper });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts every route's geometry with the plan's departure and load", async () => {
    const fetch = mockFetch({ "/api/heatmaps": heatmap });

    const { result } = renderHook(() => useHeatmap(PLAN), {
      wrapper: createQueryWrapper().wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      routes: PLAN.routes.map((route) => route.geometry),
      departure: PLAN.departure,
      load_lb: PLAN.load_lb,
    });
    expect(result.current.data?.hours).toBe(49);
  });
});
