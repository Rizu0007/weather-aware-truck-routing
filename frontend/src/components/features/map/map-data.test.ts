import { describe, expect, it } from "vitest";

import {
  boundsOf,
  checkpointIndex,
  checkpointPoints,
  endpoints,
  heatmapCells,
  riskSegments,
  routeLines,
} from "@/components/features/map/map-data";
import heatmapFixture from "@/test/fixtures/heatmap.json";
import tripPlan from "@/test/fixtures/trip-plan.json";
import type { TripPlan } from "@/types/api";

const PLAN = tripPlan as TripPlan;
const ROUTE_A = PLAN.routes.find((route) => route.id === "A")!;

describe("map data", () => {
  it("draws each risk stretch of every route as its own feature", () => {
    const { features } = riskSegments(PLAN.routes);

    const total = PLAN.routes.reduce((n, route) => n + route.segments.length, 0);
    expect(features).toHaveLength(total);
    expect(
      features
        .filter((f) => f.properties?.routeId === "A")
        .map((f) => f.properties?.level as string),
    ).toEqual(["low", "no_travel", "low"]);
  });

  it("has one click target per route", () => {
    expect(routeLines(PLAN.routes).features.map((f) => f.properties?.routeId as string)).toEqual([
      "B",
      "A",
    ]);
  });

  it("numbers checkpoints by index so feature-state can find them", () => {
    const { features } = checkpointPoints(ROUTE_A);

    expect(features.map((f) => f.id)).toEqual(ROUTE_A.checkpoints.map((_, index) => index));
    expect(features[0].geometry.coordinates).toEqual([
      ROUTE_A.checkpoints[0].lon,
      ROUTE_A.checkpoints[0].lat,
    ]);
    expect(checkpointIndex(ROUTE_A, ROUTE_A.checkpoints[3].mile)).toBe(3);
    expect(checkpointIndex(ROUTE_A, null)).toBe(-1);
  });

  it("marks the start and end of the route", () => {
    const [origin, destination] = endpoints(ROUTE_A).features;

    expect(origin.geometry.coordinates).toEqual(ROUTE_A.geometry[0]);
    expect(destination.properties?.kind).toBe("destination");
  });

  it("frames every route", () => {
    const [[west, south], [east, north]] = boundsOf(PLAN.routes);
    const all = PLAN.routes.flatMap((route) => route.geometry);

    expect(west).toBe(Math.min(...all.map(([lon]) => lon)));
    expect(north).toBe(Math.max(...all.map(([, lat]) => lat)));
    expect(east).toBeGreaterThan(west);
    expect(north).toBeGreaterThan(south);
  });
});

describe("heatmap cells", () => {
  const heatmap = heatmapFixture;

  it("draws each cell as a square centred on it", () => {
    const [first] = heatmapCells(heatmap).features;
    const { lon, lat } = heatmap.cells[0];
    const half = heatmap.cell_deg / 2;

    expect(first.geometry.coordinates[0]).toEqual([
      [lon - half, lat - half],
      [lon + half, lat - half],
      [lon + half, lat + half],
      [lon - half, lat + half],
      [lon - half, lat - half],
    ]);
  });

  it("carries the risk for every hour, so the slider only restyles", () => {
    const features = heatmapCells(heatmap).features;
    const stormy = heatmap.cells.findIndex((cell) => cell.risk.includes(4));

    expect(Object.keys(features[0].properties ?? {})).toHaveLength(heatmap.hours);
    expect(features[stormy].properties?.[`h${heatmap.cells[stormy].risk.indexOf(4)}`]).toBe(4);
  });
});
