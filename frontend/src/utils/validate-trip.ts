import { INTERVALS, MAX_LOAD_LB } from "@/constants/limits";
import type { Interval, Place } from "@/types/api";
import { localInputToIso } from "@/utils/format";
import type { TripParams } from "@/utils/trip-params";

const HOUR_MS = 3_600_000;
// Django accepts ~15 days ahead, minus 48 h for the heatmap and the trip itself.
export const MAX_DAYS_AHEAD = 12;
// Same as the backend: under a mile apart is the same place.
const MIN_TRIP_MILES = 1;

export interface TripFormValues {
  origin: Place | null;
  destination: Place | null;
  departure: string; // datetime-local value
  load: string; // as typed
  interval: Interval;
}

export type TripField = "origin" | "destination" | "departure" | "load" | "interval";
export type TripErrors = Partial<Record<TripField, string>>;

/** Same rules as the Django serializer, so most mistakes never reach the server. */
export function validateTrip(
  values: TripFormValues,
  now = new Date(),
): { trip: TripParams; errors: null } | { trip: null; errors: TripErrors } {
  const errors: TripErrors = {};
  const { origin, destination } = values;

  if (!origin) errors.origin = "Choose a starting place from the suggestions.";
  if (!destination) errors.destination = "Choose a destination from the suggestions.";
  else if (origin && milesBetween(origin, destination) < MIN_TRIP_MILES) {
    errors.destination = "Destination must be at least 1 mile from the origin.";
  }

  const departure = localInputToIso(values.departure);
  if (!departure) errors.departure = "Enter a departure date and time.";
  else {
    const time = Date.parse(departure);
    if (time < now.getTime() - HOUR_MS) errors.departure = "Departure can't be in the past.";
    else if (time > now.getTime() + MAX_DAYS_AHEAD * 24 * HOUR_MS) {
      errors.departure = `Forecasts only cover the next ${MAX_DAYS_AHEAD} days.`;
    }
  }

  const load = Number(values.load.replaceAll(",", ""));
  if (values.load.trim() === "") errors.load = "Enter the load weight.";
  else if (!Number.isInteger(load) || load < 1 || load > MAX_LOAD_LB) {
    errors.load = `Enter a whole number from 1 to ${MAX_LOAD_LB.toLocaleString("en-US")} lb.`;
  }

  if (!INTERVALS.includes(values.interval)) errors.interval = "Choose 10, 25 or 50 miles.";

  if (Object.keys(errors).length > 0 || !origin || !destination || !departure) {
    return { trip: null, errors };
  }
  return {
    trip: { origin, destination, departure, loadLb: load, intervalMi: values.interval },
    errors: null,
  };
}

/** Django's field names → form fields, for 400 responses. */
export function serverFieldErrors(fields: Record<string, string>): TripErrors {
  const map: Record<string, TripField> = {
    origin: "origin",
    destination: "destination",
    departure: "departure",
    load_lb: "load",
    interval_mi: "interval",
  };
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, message]) => (map[key] ? [[map[key], message]] : [])),
  );
}

function milesBetween(a: Place, b: Place): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(Math.min(1, h)));
}
