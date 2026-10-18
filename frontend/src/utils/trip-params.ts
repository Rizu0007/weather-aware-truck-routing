import { HEATMAP_MAX_HOUR, INTERVALS, MAX_LOAD_LB } from "@/constants/limits";
import type { Interval, Place, TripPlanRequest } from "@/types/api";

/** A trip as kept in the URL, so it survives refresh and can be shared. */
export interface TripParams {
  origin: Place;
  destination: Place;
  /** ISO, UTC. */
  departure: string;
  loadLb: number;
  intervalMi: Interval;
}

const TRIP_KEYS = ["from", "fromName", "to", "toName", "depart", "load", "every"] as const;
const COORD_DECIMALS = 5; // ~1 m: plenty, and keeps the URL short

export function parseTripParams(search: URLSearchParams): {
  trip: TripParams | null;
  /** True when trip params are present but unusable (e.g. a hand-edited link). */
  invalid: boolean;
} {
  if (!TRIP_KEYS.some((key) => search.has(key))) return { trip: null, invalid: false };

  const origin = parsePlace(search.get("from"), search.get("fromName"));
  const destination = parsePlace(search.get("to"), search.get("toName"));
  const departure = parseDeparture(search.get("depart"));
  const loadLb = Number(search.get("load"));
  const intervalMi = Number(search.get("every")) as Interval;

  const valid =
    origin &&
    destination &&
    departure &&
    Number.isInteger(loadLb) &&
    loadLb >= 1 &&
    loadLb <= MAX_LOAD_LB &&
    INTERVALS.includes(intervalMi);
  if (!valid) return { trip: null, invalid: true };
  return { trip: { origin, destination, departure, loadLb, intervalMi }, invalid: false };
}

/** Search params for a new trip. The selected route and heatmap hour reset with it. */
export function tripSearchParams(trip: TripParams): URLSearchParams {
  return new URLSearchParams({
    from: formatCoord(trip.origin),
    fromName: trip.origin.label,
    to: formatCoord(trip.destination),
    toName: trip.destination.label,
    depart: trip.departure,
    load: String(trip.loadLb),
    every: String(trip.intervalMi),
  });
}

export function toTripPlanRequest(trip: TripParams): TripPlanRequest {
  return {
    origin: { lat: trip.origin.lat, lon: trip.origin.lon },
    destination: { lat: trip.destination.lat, lon: trip.destination.lon },
    departure: trip.departure,
    load_lb: trip.loadLb,
    interval_mi: trip.intervalMi,
  };
}

export function parseHour(search: URLSearchParams): number {
  const hour = Number(search.get("hour"));
  return Number.isInteger(hour) && hour >= 0 && hour <= HEATMAP_MAX_HOUR ? hour : 0;
}

function parsePlace(coord: string | null, name: string | null): Place | null {
  const [lat, lon] = (coord ?? "").split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, label: name?.trim() || `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
}

function parseDeparture(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function formatCoord({ lat, lon }: Place): string {
  return `${lat.toFixed(COORD_DECIMALS)},${lon.toFixed(COORD_DECIMALS)}`;
}
