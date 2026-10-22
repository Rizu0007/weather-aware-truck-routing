import { describe, expect, it } from "vitest";

import {
  describeTimeZone,
  formatClock,
  formatDateTime,
  formatDuration,
  formatMiles,
  formatPounds,
  formatReading,
  localInputToIso,
  nextFullHour,
  toLocalInputValue,
} from "@/utils/format";

describe("format", () => {
  it.each([
    [238.27, "238 mi"],
    [1005.6, "1,006 mi"],
  ])("miles %d -> %s", (miles, text) => expect(formatMiles(miles)).toBe(text));

  it.each([
    [15191, "4 h 13 min"],
    [3600, "1 h"],
    [1500, "25 min"],
    [29, "0 min"],
  ])("duration %ds -> %s", (seconds, text) => expect(formatDuration(seconds)).toBe(text));

  it("pounds", () => expect(formatPounds(35000)).toBe("35,000 lb"));

  it("date-times in a given zone, with its abbreviation", () => {
    expect(formatDateTime("2026-10-20T19:13:00Z", { timeZone: "America/Chicago" })).toBe(
      "Tue, Oct 20, 2:13 PM CDT",
    );
  });

  it("describes the browser's time zone", () => {
    expect(describeTimeZone(new Date("2026-10-20T12:00:00Z"))).toBe("CDT (America/Chicago)");
  });
});

describe("formatClock", () => {
  const zone = "America/Chicago";

  it("shows the day for the first time, then only when it changes", () => {
    expect(formatClock("2026-10-20T19:13:00Z", undefined, { timeZone: zone })).toBe("Tue 2:13 PM");
    expect(formatClock("2026-10-20T20:40:00Z", "2026-10-20T19:13:00Z", { timeZone: zone })).toBe(
      "3:40 PM",
    );
    expect(formatClock("2026-10-21T05:20:00Z", "2026-10-21T04:50:00Z", { timeZone: zone })).toBe(
      "Wed 12:20 AM",
    );
  });
});

describe("datetime-local conversions (tests run in America/Chicago)", () => {
  it("round-trips local input values and UTC ISO", () => {
    expect(localInputToIso("2026-10-20T14:00")).toBe("2026-10-20T19:00:00.000Z");
    expect(toLocalInputValue(new Date("2026-10-20T19:00:00Z"))).toBe("2026-10-20T14:00");
  });

  it("rejects empty or broken values", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("not a date")).toBeNull();
  });

  it("defaults to the next full hour", () => {
    expect(toLocalInputValue(nextFullHour(new Date("2026-10-20T19:42:10Z")))).toBe(
      "2026-10-20T15:00",
    );
  });
});

describe("formatReading", () => {
  it("rounds down so a value never reads as the next risk band", () => {
    expect(formatReading(44.6, 0)).toBe("44");
    expect(formatReading(0.249, 2)).toBe("0.24");
    expect(formatReading(0.96, 1)).toBe("0.9");
  });

  it("keeps exact values despite float error", () => {
    expect(formatReading(0.29, 2)).toBe("0.29");
    expect(formatReading(45, 0)).toBe("45");
  });
});
