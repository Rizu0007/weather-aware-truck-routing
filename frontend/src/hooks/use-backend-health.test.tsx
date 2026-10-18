import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { vi } from "vitest";

import { useBackendHealth } from "@/hooks/use-backend-health";
import { createQueryWrapper, jsonResponse, mockFetch } from "@/test/api";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

it("is ready as soon as the server answers", async () => {
  mockFetch({ "/api/health": { status: "ok" } });

  const { result } = renderHook(() => useBackendHealth(), {
    wrapper: createQueryWrapper().wrapper,
  });

  expect(result.current).toBe("checking");
  await waitFor(() => expect(result.current).toBe("ready"));
});

it("shows waking while a sleeping server fails, and retries until it answers", async () => {
  let calls = 0;
  const fetch = mockFetch({
    "/api/health": () =>
      ++calls < 3 ? Promise.reject(new TypeError("Failed")) : jsonResponse({ status: "ok" }),
  });

  const { result } = renderHook(() => useBackendHealth(), {
    wrapper: createQueryWrapper().wrapper,
  });

  await waitFor(() => expect(result.current).toBe("waking"));
  await act(() => vi.advanceTimersByTimeAsync(3_000));
  expect(result.current).toBe("waking");
  await act(() => vi.advanceTimersByTimeAsync(3_000));
  await waitFor(() => expect(result.current).toBe("ready"));
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("shows waking when the first answer is slow (a cold start holds the request)", async () => {
  mockFetch({ "/api/health": () => new Promise<Response>(() => {}) });

  const { result } = renderHook(() => useBackendHealth(), {
    wrapper: createQueryWrapper().wrapper,
  });

  expect(result.current).toBe("checking");
  await act(() => vi.advanceTimersByTimeAsync(2_000));
  expect(result.current).toBe("waking");
});
