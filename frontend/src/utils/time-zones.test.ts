// Run under several zones with `npm run test:zones` (sets TZ). Under the default test zone
// (America/Chicago) it runs with the normal suite too.
import { describe, expect, it } from "vitest";

import {
  describeTimeZone,
  formatClock,
  formatDateTime,
  localInputToIso,
  nextFullHour,
  toLocalInputValue,
} from "@/utils/format";

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

interface ZoneCase {
  /** What a driver types into the departure field: 20 Oct 2026, 2:00 PM local. */
  localDeparture: string;
  departureUtc: string;
  /** 18:00 UTC on 20 Oct, shown in this zone (en-US). */
  shown: string;
  /** Zone abbreviation in the departure field's hint. */
  abbreviation: string;
}

const CASES: Record<string, ZoneCase> = {
  "America/New_York": {
    localDeparture: "2026-10-20T14:00",
    departureUtc: "2026-10-20T18:00:00.000Z",
    shown: "Tue, Oct 20, 2:00 PM EDT",
    abbreviation: "EDT",
  },
  "America/Chicago": {
    localDeparture: "2026-10-20T14:00",
    departureUtc: "2026-10-20T19:00:00.000Z",
    shown: "Tue, Oct 20, 1:00 PM CDT",
    abbreviation: "CDT",
  },
  "America/Los_Angeles": {
    localDeparture: "2026-10-20T14:00",
    departureUtc: "2026-10-20T21:00:00.000Z",
    shown: "Tue, Oct 20, 11:00 AM PDT",
    abbreviation: "PDT",
  },
  "Europe/London": {
    localDeparture: "2026-10-20T14:00",
    departureUtc: "2026-10-20T13:00:00.000Z",
    shown: "Tue, Oct 20, 7:00 PM GMT+1",
    abbreviation: "GMT+1",
  },
  // Half-hour offset: a local full hour is not a UTC full hour.
  "Asia/Kolkata": {
    localDeparture: "2026-10-20T14:00",
    departureUtc: "2026-10-20T08:30:00.000Z",
    shown: "Tue, Oct 20, 11:30 PM GMT+5:30",
    abbreviation: "GMT+5:30",
  },
  "Asia/Karachi": {
    localDeparture: "2026-10-20T14:00",
    departureUtc: "2026-10-20T09:00:00.000Z",
    shown: "Tue, Oct 20, 11:00 PM GMT+5",
    abbreviation: "GMT+5",
  },
};

// Some ICU builds still report the old name for India.
CASES["Asia/Calcutta"] = CASES["Asia/Kolkata"];

const zoneCase = CASES[ZONE];

describe.runIf(zoneCase)(`times in ${ZONE}`, () => {
  it("a departure typed in local time is sent as the right UTC instant", () => {
    expect(localInputToIso(zoneCase.localDeparture)).toBe(zoneCase.departureUtc);
  });

  it("and comes back to the same local value (a shared link or Edit)", () => {
    expect(toLocalInputValue(new Date(zoneCase.departureUtc))).toBe(zoneCase.localDeparture);
  });

  it("ETAs are shown in local time with the zone", () => {
    expect(formatDateTime("2026-10-20T18:00:00.000Z", { locale: "en-US" })).toBe(zoneCase.shown);
  });

  it("the departure field names the zone", () => {
    expect(describeTimeZone(new Date("2026-10-20T18:00:00Z"), { locale: "en-US" })).toBe(
      `${zoneCase.abbreviation} (${ZONE})`,
    );
  });

  it("the default departure is the next full local hour", () => {
    const now = new Date(`${zoneCase.departureUtc.slice(0, 13)}:42:10.000Z`);
    const next = nextFullHour(now);

    expect(toLocalInputValue(next).endsWith(":00")).toBe(true);
    expect(next.getTime() - now.getTime()).toBeGreaterThan(0);
    expect(next.getTime() - now.getTime()).toBeLessThanOrEqual(3_600_000);
  });
});

// Daylight saving ends inside the 15-day forecast window: UK on 25 Oct, US on 1 Nov 2026.
describe("trips across a daylight-saving change (any test zone)", () => {
  it("UK: the zone changes from BST to GMT mid-trip, and the ETA says so", () => {
    const options = { timeZone: "Europe/London", locale: "en-GB" };
    const before = "2026-10-25T00:30:00Z"; // 01:30 BST
    const after = "2026-10-25T01:30:00Z"; // 01:30 GMT, an hour later

    expect(formatClock(before, undefined, options)).toBe("Sun 1:30");
    expect(formatClock(after, before, options)).toBe("1:30 GMT");
    expect(formatDateTime(after, options)).toBe("Sun 25 Oct, 01:30 GMT");
  });

  it("US: EDT to EST on 1 Nov", () => {
    const options = { timeZone: "America/New_York", locale: "en-US" };
    const before = "2026-11-01T05:20:00Z"; // 1:20 AM EDT
    const after = "2026-11-01T06:20:00Z"; // 1:20 AM EST

    expect(formatClock(after, before, options)).toBe("1:20 AM EST");
    expect(formatClock("2026-11-01T07:20:00Z", after, options)).toBe("2:20 AM");
  });

  it("a UK user sees BST and a 24-hour clock; a US user sees PDT", () => {
    expect(
      formatDateTime("2026-10-20T13:00:00Z", { timeZone: "Europe/London", locale: "en-GB" }),
    ).toBe("Tue 20 Oct, 14:00 BST");
    expect(
      formatDateTime("2026-10-20T18:00:00Z", { timeZone: "America/Los_Angeles", locale: "en-US" }),
    ).toBe("Tue, Oct 20, 11:00 AM PDT");
  });
});

describe.runIf(ZONE === "America/New_York")("the repeated hour on 1 Nov in New York", () => {
  it("1:30 AM happens twice; a typed 1:30 means the first one (EDT), as browsers do", () => {
    expect(localInputToIso("2026-11-01T01:30")).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe.runIf(ZONE === "Europe/London")("the repeated hour on 25 Oct in London", () => {
  it("1:30 AM happens twice; a typed 1:30 means the first one (BST)", () => {
    expect(localInputToIso("2026-10-25T01:30")).toBe("2026-10-25T00:30:00.000Z");
  });
});
