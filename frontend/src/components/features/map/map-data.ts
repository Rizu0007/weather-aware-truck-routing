import type { Feature, FeatureCollection, LineString, Point } from "geojson";

import type { Checkpoint, LonLat, PlannedRoute } from "@/types/api";
import { tripBriefing, type BriefingTone } from "@/utils/briefing";

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
    properties: {
      mile: checkpoint.mile,
      level: checkpoint.level,
      // Crosswind, ice or fog there: drawn with a warning ring.
      warn: checkpoint.conditions.flags.length > 0,
    },
  }));
  return { type: "FeatureCollection", features };
}

export interface BriefingPin {
  number: number;
  mile: number;
  lonLat: LonLat;
  tone: BriefingTone;
  text: string;
}

/** The trip briefing's numbered changes, where they happen on the road. */
export function briefingPins(route: PlannedRoute): BriefingPin[] {
  return tripBriefing(route, "", "").flatMap((item) => {
    const checkpoint = route.checkpoints.find((c) => c.mile === item.mile);
    if (!item.number || !checkpoint) return [];
    const lonLat: LonLat = [checkpoint.lon, checkpoint.lat];
    return [{ number: item.number, mile: item.mile, lonLat, tone: item.tone, text: item.text }];
  });
}

/** Checkpoints of the routes not selected, drawn faded so every route shows where it was checked. */
export function otherCheckpointPoints(
  routes: PlannedRoute[],
  selectedId: string,
): FeatureCollection<Point> {
  const features: PointFeature[] = routes
    .filter((route) => route.id !== selectedId)
    .flatMap((route) =>
      route.checkpoints.map((checkpoint) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [checkpoint.lon, checkpoint.lat] },
        properties: { routeId: route.id, level: checkpoint.level },
      })),
    );
  return { type: "FeatureCollection", features };
}

const LABEL_CANDIDATES = 100;
const LABEL_NEIGHBOURS = 400;

export interface LabelPlacement {
  lonLat: LonLat;
  /** Which side of the road the label goes: away from the nearest other route. */
  side: "east" | "west";
}

/** Where `route`'s label goes: as far as possible from the other routes, on its far side from
 *  the nearest one, and where a label of `size` ([lon, lat] degrees) covers none of `avoid`
 *  and stays inside `within` (the map's view). */
export function labelPlacement(
  route: PlannedRoute,
  others: PlannedRoute[],
  avoid: LonLat[] = [],
  size: LonLat = [0, 0],
  within?: [LonLat, LonLat],
): LabelPlacement {
  const line = route.geometry;
  // The middle 80%: near the ends every route shares the same streets.
  const from = Math.floor(line.length * 0.1);
  const to = Math.max(from + 1, Math.ceil(line.length * 0.9));
  const candidates = every(line.slice(from, to), LABEL_CANDIDATES);
  const neighbours = others.flatMap((other) => every(other.geometry, LABEL_NEIGHBOURS));

  let best: (LabelPlacement & { distance: number }) | null = null;
  for (const point of candidates) {
    const nearest = neighbours.length ? nearestOf(point, neighbours) : null;
    let side: LabelPlacement["side"] = nearest && nearest[0] > point[0] ? "west" : "east";
    // Running off the map's edge: the other side, if that fits.
    if (within && !fits(point, side, size, within)) side = side === "east" ? "west" : "east";
    if (within && !fits(point, side, size, within)) continue;
    if (avoid.some((pin) => covers(point, side, size, pin))) continue;
    // A lone route: its middle.
    const distance = nearest ? flatDistanceSq(point, nearest) : -Math.abs(point[0] - mid(line)[0]);
    if (!best || distance > best.distance) best = { lonLat: point, side, distance };
  }
  if (best) return { lonLat: best.lonLat, side: best.side };
  // Nowhere clear of the pins and edges: ignore them.
  return avoid.length || within
    ? labelPlacement(route, others)
    : { lonLat: mid(line), side: "east" };
}

function mid(line: LonLat[]): LonLat {
  return line[Math.floor(line.length / 2)];
}

function fits(
  [lon]: LonLat,
  side: "east" | "west",
  [w]: LonLat,
  [[west], [east]]: [LonLat, LonLat],
) {
  return side === "east" ? lon + w <= east : lon - w >= west;
}

/** Whether a label anchored at `point`, reaching `side`, overlaps `pin`. */
function covers([lon, lat]: LonLat, side: "east" | "west", [w, h]: LonLat, [x, y]: LonLat) {
  const [left, right] = side === "east" ? [lon, lon + w] : [lon - w, lon];
  return x >= left - h / 2 && x <= right + h / 2 && Math.abs(y - lat) <= h;
}

function nearestOf(point: LonLat, points: LonLat[]): LonLat {
  return points.reduce((a, b) => (flatDistanceSq(point, a) <= flatDistanceSq(point, b) ? a : b));
}

/** About `count` evenly spaced points of a line. */
function every(line: LonLat[], count: number): LonLat[] {
  const step = Math.max(1, Math.floor(line.length / count));
  return line.filter((_, index) => index % step === 0);
}

/** Squared distance in degrees, longitude scaled by latitude: enough to compare nearby points. */
function flatDistanceSq([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const dx = (lon2 - lon1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return dx * dx + (lat2 - lat1) ** 2;
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
