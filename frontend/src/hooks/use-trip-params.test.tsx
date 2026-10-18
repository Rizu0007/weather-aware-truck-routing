import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, type RouterState } from "react-router";
import { RouterProvider } from "react-router/dom";
import { expect, it } from "vitest";

import { useTripParams } from "@/hooks/use-trip-params";
import { tripSearchParams, type TripParams } from "@/utils/trip-params";

const TRIP: TripParams = {
  origin: { label: "Dallas, Texas", lat: 32.7767, lon: -96.797 },
  destination: { label: "Houston, Texas", lat: 29.7604, lon: -95.3698 },
  departure: "2026-10-18T14:00:00.000Z",
  loadLb: 35_000,
  intervalMi: 10,
};

/** Render the hook inside a real memory router, exposing the router to inspect the URL. */
function renderAt(url: string) {
  let hook: ReturnType<typeof useTripParams> | undefined;
  function Probe() {
    hook = useTripParams();
    return null;
  }
  const router = createMemoryRouter([{ path: "/", Component: Probe }], { initialEntries: [url] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <>
      <RouterProvider router={router} />
      {children}
    </>
  );
  renderHook(() => null, { wrapper });
  return { router, current: () => hook! };
}

const search = (state: RouterState) => new URLSearchParams(state.location.search);

it("reads the trip, route and hour from the URL", () => {
  const params = tripSearchParams(TRIP);
  params.set("route", "B");
  params.set("hour", "6");

  const { current } = renderAt(`/?${params.toString()}`);

  expect(current().trip?.origin.label).toBe("Dallas, Texas");
  expect(current().routeId).toBe("B");
  expect(current().hour).toBe(6);
  expect(current().invalidLink).toBe(false);
});

it("flags a broken link instead of guessing", () => {
  const { current } = renderAt("/?from=abc&to=1,2&load=5");

  expect(current().trip).toBeNull();
  expect(current().invalidLink).toBe(true);
});

it("a new trip is a new history entry and resets route and hour", () => {
  const { router, current } = renderAt("/?route=A&hour=12");

  act(() => current().setTrip(TRIP));

  expect(router.state.historyAction).toBe("PUSH");
  expect(search(router.state).get("from")).toBe("32.77670,-96.79700");
  expect(search(router.state).has("route")).toBe(false);
  expect(search(router.state).has("hour")).toBe(false);
});

it("selecting a route or hour replaces the entry and keeps the trip", () => {
  const { router, current } = renderAt(`/?${tripSearchParams(TRIP).toString()}`);

  act(() => current().setRouteId("B"));
  expect(router.state.historyAction).toBe("REPLACE");
  act(() => current().setHour(6));

  expect(search(router.state).get("route")).toBe("B");
  expect(search(router.state).get("hour")).toBe("6");
  expect(current().trip?.destination.label).toBe("Houston, Texas");

  act(() => current().setHour(0));
  expect(search(router.state).has("hour")).toBe(false); // hour 0 is the default
});
