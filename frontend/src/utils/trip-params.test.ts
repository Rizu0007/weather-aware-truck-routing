import { describe, expect, it } from "vitest";

import {
  parseHour,
  parseTripParams,
  toTripPlanRequest,
  tripSearchParams,
  type TripParams,
} from "@/utils/trip-params";

const TRIP: TripParams = {
  origin: { label: "Dallas, Texas", lat: 32.7762719, lon: -96.7968559 },
  destination: { label: "Houston, Texas", lat: 29.7589382, lon: -95.3676974 },
  departure: "2026-10-20T14:00:00.000Z",
  loadLb: 35_000,
  intervalMi: 25,
};

describe("trip search params", () => {
  it("round-trips a trip through the URL", () => {
    const search = tripSearchParams(TRIP);
    const { trip, invalid } = parseTripParams(new URLSearchParams(search.toString()));

    expect(invalid).toBe(false);
    expect(trip).toEqual({
      ...TRIP,
      origin: { ...TRIP.origin, lat: 32.77627, lon: -96.79686 }, // 5 decimals
      destination: { ...TRIP.destination, lat: 29.75894, lon: -95.3677 },
    });
    expect(search.toString()).toContain("fromName=Dallas%2C+Texas");
  });

  it("has no trip, and nothing invalid, without trip params", () => {
    expect(parseTripParams(new URLSearchParams("hour=3"))).toEqual({ trip: null, invalid: false });
  });

  it.each([
    ["missing destination", { to: null }],
    ["bad latitude", { from: "95,-96.8" }],
    ["not a number", { from: "abc,def" }],
    ["bad date", { depart: "tomorrow" }],
    ["load too heavy", { load: "90000" }],
    ["fractional load", { load: "35000.5" }],
    ["unsupported interval", { every: "15" }],
  ])("flags %s as invalid", (_, changes) => {
    const search = tripSearchParams(TRIP);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) search.delete(key);
      else search.set(key, value);
    }

    expect(parseTripParams(search)).toEqual({ trip: null, invalid: true });
  });

  it("labels a place by its coordinates when the name is missing", () => {
    const search = tripSearchParams(TRIP);
    search.delete("fromName");

    expect(parseTripParams(search).trip?.origin.label).toBe("32.776, -96.797");
  });

  it("normalises the departure to UTC ISO", () => {
    const search = tripSearchParams(TRIP);
    search.set("depart", "2026-10-20T09:00:00-05:00");

    expect(parseTripParams(search).trip?.departure).toBe("2026-10-20T14:00:00.000Z");
  });

  it("builds the API request body", () => {
    expect(toTripPlanRequest(TRIP)).toEqual({
      origin: { lat: 32.7762719, lon: -96.7968559 },
      destination: { lat: 29.7589382, lon: -95.3676974 },
      departure: "2026-10-20T14:00:00.000Z",
      load_lb: 35_000,
      interval_mi: 25,
    });
  });
});

describe("parseHour", () => {
  it.each([
    ["6", 6],
    ["48", 48],
    ["49", 0],
    ["-1", 0],
    ["2.5", 0],
    [null, 0],
  ])("hour=%s -> %d", (value, expected) => {
    const search = new URLSearchParams(value === null ? "" : `hour=${value}`);

    expect(parseHour(search)).toBe(expected);
  });
});
