import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { parseHour, parseTripParams, tripSearchParams, type TripParams } from "@/utils/trip-params";

/** Typed access to the trip, selected route and heatmap hour in the URL. */
export function useTripParams() {
  const [search, setSearch] = useSearchParams();
  const { trip, invalid } = useMemo(() => parseTripParams(search), [search]);

  // A new trip is a new history entry, so Back returns to the previous one.
  const setTrip = useCallback((next: TripParams) => setSearch(tripSearchParams(next)), [setSearch]);

  // Selecting a route or scrubbing hours shouldn't flood the history: replace.
  const setParam = useCallback(
    (key: "route" | "hour", value: string | null) =>
      setSearch(
        (previous) => {
          const updated = new URLSearchParams(previous);
          if (value === null) updated.delete(key);
          else updated.set(key, value);
          return updated;
        },
        { replace: true },
      ),
    [setSearch],
  );

  return {
    trip,
    invalidLink: invalid,
    routeId: search.get("route"),
    hour: parseHour(search),
    setTrip,
    setRouteId: useCallback((id: string | null) => setParam("route", id), [setParam]),
    setHour: useCallback(
      (hour: number) => setParam("hour", hour ? String(hour) : null),
      [setParam],
    ),
  };
}
