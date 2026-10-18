import { describe, expect, it } from "vitest";

import {
  describeTimeZone,
  formatDateTime,
  formatDuration,
  formatMiles,
  formatPounds,
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
    expect(formatDateTime("2026-10-20T19:13:00Z", "America/Chicago")).toBe(
      "Tue, Oct 20, 2:13 PM CDT",
    );
  });

  it("describes the browser's time zone", () => {
    expect(describeTimeZone(new Date("2026-10-20T12:00:00Z"))).toBe("CDT (America/Chicago)");
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
