import type { Feature, FeatureCollection, LineString, Point } from "geojson";

import type { Checkpoint, LonLat, PlannedRoute } from "@/types/api";

// Pure builders from API data to GeoJSON, so they can be tested without WebGL.

type LineFeature = Feature<LineString>;
type PointFeature = Feature<Point>;

/** One feature per risk stretch of every route, coloured by `level`. */
export function riskSegments(routes: PlannedRoute[]): FeatureCollection<LineString> {
  const features: LineFeature[] = routes.flatMap((route) =>
    route.segments.map((segment) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: segment.coordinates },
      properties: { routeId: route.id, level: segment.level },
    })),
  );
  return { type: "FeatureCollection", features };
}

/** Whole routes, used as wide invisible click targets. */
export function routeLines(routes: PlannedRoute[]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: routes.map((route) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: route.geometry },
      properties: { routeId: route.id },
    })),
  };
}

/** Checkpoints of one route; ids are their index so feature-state can address them. */
export function checkpointPoints(route: PlannedRoute): FeatureCollection<Point> {
  const features: PointFeature[] = route.checkpoints.map((checkpoint, index) => ({
    type: "Feature",
    id: index,
    geometry: { type: "Point", coordinates: [checkpoint.lon, checkpoint.lat] },
    properties: { mile: checkpoint.mile, level: checkpoint.level },
  }));
  return { type: "FeatureCollection", features };
}

export function endpoints(route: PlannedRoute): FeatureCollection<Point> {
  const first = route.geometry[0];
  const last = route.geometry[route.geometry.length - 1];
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: first },
        properties: { kind: "origin" },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: last },
        properties: { kind: "destination" },
      },
    ],
  };
}

/** [[west, south], [east, north]] around every route. */
export function boundsOf(routes: PlannedRoute[]): [LonLat, LonLat] {
  let [west, south, east, north] = [180, 90, -180, -90];
  for (const [lon, lat] of routes.flatMap((route) => route.geometry)) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

export function checkpointIndex(route: PlannedRoute, mile: number | null): number {
  return mile === null ? -1 : route.checkpoints.findIndex((c: Checkpoint) => c.mile === mile);
}
