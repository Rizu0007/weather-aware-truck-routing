import { describe, expect, it } from "vitest";

import {
  boundsOf,
  checkpointIndex,
  checkpointPoints,
  endpoints,
  riskSegments,
  routeLines,
  truckAt,
} from "@/components/features/map/map-data";
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

describe("truckAt", () => {
  const route = PLAN.routes[0];
  const at = (iso: string) => Date.parse(iso);
  const [first, second] = route.checkpoints;
  const last = route.checkpoints[route.checkpoints.length - 1];

  it("waits at the origin before departure, and stays at the destination after arrival", () => {
    expect(truckAt(route, at(first.eta) - 3_600_000)).toMatchObject({ state: "waiting", mile: 0 });
    expect(truckAt(route, at(last.eta) + 3_600_000)).toMatchObject({
      state: "arrived",
      mile: last.mile,
    });
  });

  it("is between checkpoints in proportion to the time between their ETAs", () => {
    const halfway = (at(first.eta) + at(second.eta)) / 2;
    const truck = truckAt(route, halfway);

    expect(truck.state).toBe("driving");
    expect(truck.mile).toBeCloseTo((first.mile + second.mile) / 2);
  });

  it("sits on the drawn road: the origin at mile 0, the last vertex on arrival", () => {
    expect(truckAt(route, at(first.eta)).lonLat).toEqual(route.geometry[0]);
    expect(truckAt(route, at(last.eta)).lonLat).toEqual(route.geometry[route.geometry.length - 1]);
  });
});
