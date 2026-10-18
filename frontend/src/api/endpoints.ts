import { request } from "@/api/client";
import type { Heatmap, HeatmapRequest, Place, TripPlan, TripPlanRequest } from "@/types/api";

export function checkHealth(signal?: AbortSignal) {
  return request<{ status: "ok" }>("/health", { signal, timeoutMs: 10_000 });
}

export function searchPlaces(query: string, signal?: AbortSignal) {
  return request<Place[]>(`/places?q=${encodeURIComponent(query)}`, { signal });
}

export function planTrip(body: TripPlanRequest, signal?: AbortSignal) {
  return request<TripPlan>("/trip-plans", { method: "POST", body, signal });
}

export function fetchHeatmap(body: HeatmapRequest, signal?: AbortSignal) {
  return request<Heatmap>("/heatmaps", { method: "POST", body, signal });
}
