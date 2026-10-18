import { describe, expect, it } from "vitest";

import { serverFieldErrors, validateTrip, type TripFormValues } from "@/utils/validate-trip";

const NOW = new Date("2026-10-18T17:00:00Z"); // 12:00 in Chicago
const DALLAS = { label: "Dallas, Texas", lat: 32.7767, lon: -96.797 };
const HOUSTON = { label: "Houston, Texas", lat: 29.7604, lon: -95.3698 };
const VALID: TripFormValues = {
  origin: DALLAS,
  destination: HOUSTON,
  departure: "2026-10-18T14:00", // local
  load: "35000",
  interval: 25,
};

const errorsFor = (changes: Partial<TripFormValues>) =>
  validateTrip({ ...VALID, ...changes }, NOW).errors;

describe("validateTrip", () => {
  it("turns valid input into trip params with a UTC departure", () => {
    expect(validateTrip(VALID, NOW)).toEqual({
      trip: {
        origin: DALLAS,
        destination: HOUSTON,
        departure: "2026-10-18T19:00:00.000Z",
        loadLb: 35000,
        intervalMi: 25,
      },
      errors: null,
    });
  });

  it("accepts a load typed with commas", () => {
    expect(validateTrip({ ...VALID, load: "35,000" }, NOW).trip?.loadLb).toBe(35000);
  });

  it("asks for everything that's missing", () => {
    expect(errorsFor({ origin: null, destination: null, departure: "", load: "" })).toEqual({
      origin: "Choose a starting place from the suggestions.",
      destination: "Choose a destination from the suggestions.",
      departure: "Enter a departure date and time.",
      load: "Enter the load weight.",
    });
  });

  it.each([
    [
      "same place",
      { destination: { ...DALLAS, label: "Dallas" } },
      "destination",
      "at least 1 mile",
    ],
    ["past departure", { departure: "2026-10-18T10:30" }, "departure", "can't be in the past"],
    ["13 days ahead", { departure: "2026-10-31T12:00" }, "departure", "next 12 days"],
    ["zero load", { load: "0" }, "load", "from 1 to 80,000"],
    ["too heavy", { load: "80001" }, "load", "from 1 to 80,000"],
    ["fractional load", { load: "1000.5" }, "load", "whole number"],
  ] as const)("rejects %s", (_, changes, field, message) => {
    expect(errorsFor(changes)?.[field]).toContain(message);
  });

  it("allows a departure up to an hour ago, like the backend", () => {
    expect(errorsFor({ departure: "2026-10-18T11:15" })).toBeNull();
  });
});

describe("serverFieldErrors", () => {
  it("maps Django field names onto form fields and ignores the rest", () => {
    expect(
      serverFieldErrors({ load_lb: "Too heavy.", interval_mi: "Bad.", non_field_errors: "x" }),
    ).toEqual({ load: "Too heavy.", interval: "Bad." });
  });
});
