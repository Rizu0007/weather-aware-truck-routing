import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { usePlaceSearch } from "@/hooks/use-place-search";
import { createQueryWrapper, jsonResponse, mockFetch } from "@/test/api";
import places from "@/test/fixtures/places.json";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

function renderSearch(initial = "") {
  const { wrapper } = createQueryWrapper();
  return renderHook(({ query }) => usePlaceSearch(query), {
    wrapper,
    initialProps: { query: initial },
  });
}

it("doesn't search below three characters", async () => {
  const fetch = mockFetch({ "/api/places": places });
  const { result } = renderSearch("Pa");

  await act(() => vi.advanceTimersByTimeAsync(500));

  expect(fetch).not.toHaveBeenCalled();
  expect(result.current).toEqual({ active: false, places: [], searching: false, error: null });
});

it("waits for typing to pause, then sends one request for the latest text", async () => {
  const fetch = mockFetch({ "/api/places": places });
  const { result, rerender } = renderSearch();

  for (const query of ["Par", "Pari", "Paris"]) {
    rerender({ query });
    await act(() => vi.advanceTimersByTimeAsync(100));
  }
  expect(result.current.searching).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(300));

  await waitFor(() => expect(result.current.places).toHaveLength(places.length));
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe("/api/places?q=Paris");
  expect(result.current.searching).toBe(false);
});

it("reuses cached results for the same query", async () => {
  const fetch = mockFetch({ "/api/places": places });
  const { result, rerender } = renderSearch("Paris");
  await act(() => vi.advanceTimersByTimeAsync(300));
  await waitFor(() => expect(result.current.places).toHaveLength(places.length));

  rerender({ query: "Par" });
  await act(() => vi.advanceTimersByTimeAsync(300));
  rerender({ query: "paris " });
  await act(() => vi.advanceTimersByTimeAsync(300));

  await waitFor(() => expect(result.current.searching).toBe(false));
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "/api/places?q=Paris",
    "/api/places?q=Par",
  ]);
});

it("reports a failed search", async () => {
  mockFetch({
    "/api/places": jsonResponse(
      {
        message: "An external service is unavailable. Please try again shortly.",
        extra: { provider: "photon" },
      },
      502,
    ),
  });
  const { result } = renderSearch("Paris");

  await act(() => vi.advanceTimersByTimeAsync(300));

  await waitFor(() => expect(result.current.error).toMatch(/external service is unavailable/));
  expect(result.current.places).toEqual([]);
});
