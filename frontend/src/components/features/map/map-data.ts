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

const EARTH_RADIUS_MI = 3958.8;

function milesBetween([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}

export interface TruckPosition {
  state: "waiting" | "driving" | "arrived";
  mile: number;
  lonLat: LonLat;
}

/** Where the truck is at `time` (ms): mile from the checkpoints' ETAs, point along the road. */
export function truckAt(route: PlannedRoute, time: number): TruckPosition {
  const stops = route.checkpoints.map((c) => ({ mile: c.mile, at: Date.parse(c.eta) }));
  const first = stops[0];
  const last = stops[stops.length - 1];
  let state: TruckPosition["state"] = "driving";
  let mile: number;
  if (time <= first.at) {
    state = time < first.at ? "waiting" : "driving";
    mile = first.mile;
  } else if (time >= last.at) {
    state = "arrived";
    mile = last.mile;
  } else {
    const next = stops.findIndex((stop) => stop.at > time);
    const a = stops[next - 1];
    const b = stops[next];
    mile = a.mile + ((time - a.at) / (b.at - a.at)) * (b.mile - a.mile);
  }
  return { state, mile, lonLat: pointAtMile(route, mile) };
}

/** The point `mile` miles along the drawn route (its length scaled to the route's distance). */
function pointAtMile(route: PlannedRoute, mile: number): LonLat {
  const line = route.geometry;
  const lengths = line.slice(1).map((point, i) => milesBetween(line[i], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let left = (mile / route.distance_mi) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]) {
      const t = lengths[i] ? left / lengths[i] : 0;
      const [x1, y1] = line[i];
      const [x2, y2] = line[i + 1];
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    }
    left -= lengths[i];
  }
  return line[line.length - 1];
}
