import type { TripPlan, TripPlanRequest } from "@/types/api";

export const queryKeys = {
  health: ["health"] as const,
  places: (query: string) => ["places", query.toLowerCase()] as const,
  tripPlan: (request: TripPlanRequest | null) => ["trip-plan", request] as const,
  // Keyed by what identifies the routes, not their (large) geometry.
  heatmap: (plan: TripPlan | undefined) =>
    [
      "heatmap",
      plan?.departure,
      plan?.load_lb,
      plan?.routes.map((route) => `${route.id}:${route.distance_mi}:${route.duration_s}`),
    ] as const,
};
