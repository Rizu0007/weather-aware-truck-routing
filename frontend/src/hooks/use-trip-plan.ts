import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchHeatmap, planTrip } from "@/api/endpoints";
import { queryKeys } from "@/api/query-keys";
import type { TripPlan } from "@/types/api";
import { toTripPlanRequest, type TripParams } from "@/utils/trip-params";

/** The plan for the trip in the URL; idle while there is none. */
export function useTripPlan(trip: TripParams | null) {
  const request = trip ? toTripPlanRequest(trip) : null;
  return useQuery({
    queryKey: queryKeys.tripPlan(request),
    queryFn: request ? ({ signal }) => planTrip(request, signal) : skipToken,
  });
}

/** Corridor heatmap for a plan's routes; runs after the plan, and fails on its own. */
export function useHeatmap(plan: TripPlan | undefined) {
  return useQuery({
    queryKey: queryKeys.heatmap(plan),
    queryFn: plan
      ? ({ signal }) =>
          fetchHeatmap(
            {
              routes: plan.routes.map((route) => route.geometry),
              departure: plan.departure,
              load_lb: plan.load_lb,
            },
            signal,
          )
      : skipToken,
  });
}
