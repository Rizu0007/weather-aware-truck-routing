// Mirrors the Django output serializers (backend/trips/api/serializers.py).
// tests/api-types.test.ts checks these against responses captured from the backend.
import type { RiskLevel } from "@/constants/risk";

export type Interval = 10 | 25 | 50;
/** [lon, lat], as in GeoJSON. */
export type LonLat = [number, number];

export interface Point {
  lat: number;
  lon: number;
}

export interface Place extends Point {
  label: string;
}

export interface Checkpoint extends Point {
  mile: number;
  eta: string;
  /** The stretch of road [start, end] in miles this checkpoint's weather stands for. */
  covers: [number, number];
  wind_mph: number | null;
  rain_in_hr: number | null;
  snow_in_hr: number | null;
  level: RiskLevel;
  wind_level: RiskLevel;
  rain_level: RiskLevel;
  snow_level: RiskLevel;
  reasons: string[];
}

export interface RouteSummary {
  miles_by_level: Record<RiskLevel, number>;
  /** Mile-weighted, 0 (all Low) to 4 (all No Travel). */
  avg_risk: number;
  max_level: RiskLevel;
  /** 0-100; the worst level sets the band (F, D, C, else A/B). */
  safety_score: number;
  grade: SafetyGrade;
}

export type SafetyGrade = "A" | "B" | "C" | "D" | "F";

/** A later departure with fewer High-or-worse miles than the planned one. */
export interface DepartureAdvice {
  departure: string;
  route_id: string;
  reason: string;
}

export interface RiskSegment {
  level: RiskLevel;
  coordinates: LonLat[];
}

export interface PlannedRoute {
  id: string;
  label: string;
  via_town: string | null;
  distance_mi: number;
  duration_s: number;
  arrival: string;
  summary: RouteSummary;
  geometry: LonLat[];
  segments: RiskSegment[];
  checkpoints: Checkpoint[];
}

export interface TripPlan {
  departure: string;
  load_lb: number;
  interval_mi: Interval;
  recommended_route_id: string;
  recommendation: { reason: string; ranking: string[] };
  departure_advice: DepartureAdvice | null;
  warnings: string[];
  /** Best first. */
  routes: PlannedRoute[];
}

export interface TripPlanRequest {
  origin: Point;
  destination: Point;
  departure: string;
  load_lb: number;
  interval_mi: Interval;
}

export interface HeatmapCell extends Point {
  /** One level per hour from Heatmap.start: 0 = Low ... 4 = No Travel. */
  risk: number[];
  wind_mph: (number | null)[];
  rain_in_hr: (number | null)[];
  snow_in_hr: (number | null)[];
  /** Degrees the wind blows from, clockwise from north; only drawn, never scored.
   *  Absent from older backends, so a deploy of one side first doesn't break the map. */
  wind_from_deg?: (number | null)[];
}

export interface Heatmap {
  start: string;
  hours: number;
  cell_deg: number;
  warnings: string[];
  cells: HeatmapCell[];
}

export interface HeatmapRequest {
  routes: LonLat[][];
  departure: string;
  load_lb: number;
}

/** Every error from the API has this shape. */
export interface ApiErrorBody {
  message: string;
  extra: Record<string, unknown>;
}
