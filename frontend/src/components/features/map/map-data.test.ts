import { describe, expect, it } from "vitest";

import {
  boundsOf,
  briefingPins,
  checkpointIndex,
  checkpointPoints,
  endpoints,
  labelPlacement,
  otherCheckpointPoints,
  riskSegments,
  routeLines,
  truckAt,
} from "@/components/features/map/map-data";
import tripPlan from "@/test/fixtures/trip-plan.json";
import type { LonLat, PlannedRoute, TripPlan } from "@/types/api";

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

describe("route labels and other checkpoints", () => {
  const line = (points: LonLat[]) => ({ id: "X", geometry: points }) as PlannedRoute;

  it("labels a route where it is farthest from the others", () => {
    // Both start and end together; only the first bows north, around x = 5.
    const shared: LonLat[] = Array.from({ length: 11 }, (_, x) => [x, 0]);
    const bowed: LonLat[] = shared.map(([x]) => [x, x > 2 && x < 8 ? 3 - Math.abs(x - 5) : 0]);

    expect(labelPlacement(line(bowed), [line(shared)]).lonLat).toEqual([5, 3]);
  });

  it("puts each label on its route's far side from the neighbour, so they don't overlap", () => {
    const west: LonLat[] = Array.from({ length: 11 }, (_, y) => [0, y]);
    const east: LonLat[] = Array.from({ length: 11 }, (_, y) => [1, y]);

    expect(labelPlacement(line(west), [line(east)]).side).toBe("west");
    expect(labelPlacement(line(east), [line(west)]).side).toBe("east");
  });

  it("keeps the label off the briefing pins", () => {
    const shared: LonLat[] = Array.from({ length: 11 }, (_, x) => [x, 0]);
    const bowed: LonLat[] = shared.map(([x]) => [x, x > 2 && x < 8 ? 3 - Math.abs(x - 5) : 0]);
    // The label reaches 2 degrees east of where it's anchored.
    const placed = labelPlacement(line(bowed), [line(shared)], [[6, 2]], [2, 1]);

    // [5, 3] and [4, 2] would reach over the pin at [6, 2]; [3, 1] stops short of it.
    expect(placed.lonLat).toEqual([3, 1]);
  });

  it("turns a label that would run off the map's edge", () => {
    const west: LonLat[] = Array.from({ length: 11 }, (_, y) => [0, y]);
    const east: LonLat[] = Array.from({ length: 11 }, (_, y) => [1, y]);
    const view: [LonLat, LonLat] = [
      [-1, 0],
      [1.5, 10],
    ];

    // East of the east route is where it belongs, but only half a degree is left there.
    expect(labelPlacement(line(east), [line(west)], [], [0.8, 0.2], view).side).toBe("west");
  });

  it("labels a lone route at its middle", () => {
    expect(
      labelPlacement(
        line([
          [0, 0],
          [1, 0],
          [2, 0],
        ]),
        [],
      ).lonLat,
    ).toEqual([1, 0]);
  });

  it("shows every other route's checkpoints, and none of the selected one", () => {
    const { features } = otherCheckpointPoints(PLAN.routes, "A");
    const others = PLAN.routes.filter((route) => route.id !== "A");

    expect(features).toHaveLength(others.reduce((n, route) => n + route.checkpoints.length, 0));
    expect(features.every((f) => f.properties?.routeId !== "A")).toBe(true);
  });
});

describe("briefing pins and warning rings", () => {
  const routeA = PLAN.routes.find((route) => route.id === "A")!;

  it("pins each numbered briefing change at its checkpoint", () => {
    const pins = briefingPins(routeA);

    expect(pins.map((pin) => pin.number)).toEqual(pins.map((_, index) => index + 1));
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) {
      const checkpoint = routeA.checkpoints.find((c) => c.mile === pin.mile)!;
      expect(pin.lonLat).toEqual([checkpoint.lon, checkpoint.lat]);
    }
    expect(pins.some((pin) => pin.tone === "danger")).toBe(true); // the storm
  });

  it("marks checkpoints with a crosswind, ice or fog flag for the warning ring", () => {
    const { features } = checkpointPoints(routeA);

    expect(features.map((f) => f.properties?.warn as boolean)).toEqual(
      routeA.checkpoints.map((c) => c.conditions.flags.length > 0),
    );
    expect(features.some((f) => f.properties?.warn)).toBe(true);
  });
});
