import { describe, expect, it } from "vitest";

import { RISK_LEVELS } from "@/constants/risk";
import errorFixture from "@/test/fixtures/error-invalid-input.json";
import heatmapFixture from "@/test/fixtures/heatmap.json";
import placesFixture from "@/test/fixtures/places.json";
import tripPlanFixture from "@/test/fixtures/trip-plan.json";
import type { ApiErrorBody, Heatmap, Place } from "@/types/api";

// Fixtures are real responses captured from the backend
// (backend/: uv run python -m tests.capture_frontend_fixtures).
// These assignments make `tsc` fail if the API and our types drift apart.
const heatmap: Heatmap = heatmapFixture;
const places: Place[] = placesFixture;
const error: ApiErrorBody = errorFixture;

// JSON imports widen unions and tuples, so the trip plan is checked at runtime instead.
const ROUTE_KEYS = [
  "arrival",
  "checkpoints",
  "distance_mi",
  "duration_s",
  "geometry",
  "id",
  "label",
  "segments",
  "summary",
  "via_town",
];
const CHECKPOINT_KEYS = [
  "covers",
  "eta",
  "lat",
  "level",
  "lon",
  "mile",
  "rain_in_hr",
  "rain_level",
  "reasons",
  "snow_in_hr",
  "snow_level",
  "wind_level",
  "wind_mph",
];
const isLonLat = (value: unknown) =>
  Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number");

describe("captured API responses match src/types/api.ts", () => {
  const plan = tripPlanFixture;

  it("trip plan: top level", () => {
    expect(Object.keys(plan).sort()).toEqual(
      [
        "departure",
        "interval_mi",
        "load_lb",
        "recommendation",
        "recommended_route_id",
        "routes",
        "warnings",
      ].sort(),
    );
    expect([10, 25, 50]).toContain(plan.interval_mi);
    expect(plan.routes[0].id).toBe(plan.recommended_route_id);
  });

  it("trip plan: routes, segments and checkpoints", () => {
    for (const route of plan.routes) {
      expect(Object.keys(route).sort()).toEqual(ROUTE_KEYS);
      expect(route.geometry.every(isLonLat)).toBe(true);
      expect(RISK_LEVELS).toContain(route.summary.max_level);
      expect(Object.keys(route.summary.miles_by_level).sort()).toEqual([...RISK_LEVELS].sort());
      for (const segment of route.segments) {
        expect(RISK_LEVELS).toContain(segment.level);
        expect(segment.coordinates.every(isLonLat)).toBe(true);
      }
      for (const checkpoint of route.checkpoints) {
        expect(Object.keys(checkpoint).sort()).toEqual(CHECKPOINT_KEYS);
        expect(checkpoint.covers).toHaveLength(2);
        for (const level of [checkpoint.level, checkpoint.wind_level, checkpoint.rain_level]) {
          expect(RISK_LEVELS).toContain(level);
        }
      }
    }
  });

  it("heatmap, places and error bodies", () => {
    expect(heatmap.cells[0].risk).toHaveLength(heatmap.hours);
    expect(places[0].label).toBe("Paris, Texas");
    expect(error.extra).toHaveProperty("fields");
  });
});
