import { describe, expect, it } from "vitest";

import tripPlan from "@/test/fixtures/trip-plan.json";
import type { Checkpoint, Conditions, PlannedRoute, TripPlan } from "@/types/api";
import { tripBriefing } from "@/utils/briefing";
import { describeSky, formatVisibility } from "@/utils/conditions";

const PLAN = tripPlan as TripPlan;
const CALM: Conditions = {
  weather_code: 0,
  temperature_f: 60,
  gust_mph: 9,
  visibility_mi: 15,
  precip_probability: 0,
  crosswind_mph: 4,
  flags: [],
};

function stop(
  mile: number,
  overrides: Partial<Checkpoint> = {},
  conditions: Partial<Conditions> = {},
) {
  return {
    mile,
    eta: new Date(Date.UTC(2026, 9, 20, 18) + mile * 60_000).toISOString(),
    level: "low",
    reasons: [],
    ...overrides,
    conditions: { ...CALM, ...conditions },
  } as Checkpoint;
}

const route = (checkpoints: Checkpoint[]) => ({ id: "X", checkpoints }) as PlannedRoute;

describe("tripBriefing", () => {
  it("starts and ends with the trip's places and their weather", () => {
    const items = tripBriefing(
      route([stop(0), stop(10), stop(20, {}, { weather_code: 3, temperature_f: 48.4 })]),
      "Dallas",
      "Houston",
    );

    expect(items.map((i) => i.text)).toEqual([
      "Leave Dallas: Clear, 60 °F",
      "Arrive Houston: Overcast, 48 °F",
    ]);
    expect(items.every((i) => i.tone === "good")).toBe(true);
  });

  it("names each change where it happens, worst tone first in a line", () => {
    const items = tripBriefing(
      route([
        stop(0),
        stop(10, {}, { weather_code: 61 }),
        stop(
          20,
          { level: "high", reasons: ["Wind 38 mph"] },
          { weather_code: 61, flags: ["crosswind"], crosswind_mph: 41 },
        ),
        stop(30, {}, { weather_code: 0 }),
        stop(40),
      ]),
      "A",
      "B",
    );

    expect(items.map((i) => [i.mile, i.tone, i.text])).toEqual([
      [0, "good", "Leave A: Clear, 60 °F"],
      [10, "info", "Rain begins"],
      [20, "danger", "High risk: Wind 38 mph · Crosswind 41 mph"],
      [30, "good", "Back to Low risk · Rain ends"],
      [40, "good", "Arrive B: Clear, 60 °F"],
    ]);
  });

  it("folds short rain spells into one line", () => {
    const drizzle = { weather_code: 53 };
    const items = tripBriefing(
      route([
        stop(0),
        stop(100, {}, drizzle),
        stop(110),
        stop(140, {}, drizzle),
        stop(150),
        stop(400, {}, drizzle),
        stop(410),
        stop(600, {}, drizzle),
        stop(700),
      ]),
      "A",
      "B",
    );

    expect(items.slice(1, -1).map((i) => [i.mile, i.tone, i.text])).toEqual([
      [100, "info", "Drizzle on and off for 50 mi"],
      [400, "info", "Drizzle for 10 mi"],
      [600, "info", "Drizzle begins"],
    ]);
    expect(items.at(-1)!.text).toBe("Arrive B: Drizzle ends");
  });

  it("keeps the most serious changes when there are too many", () => {
    const stops = Array.from({ length: 20 }, (_, k) =>
      stop(k * 10, k % 2 ? { level: "moderate", reasons: ["Wind 22 mph"] } : {}, {
        flags: k === 13 ? ["low_visibility"] : [],
        visibility_mi: 0.4,
      }),
    );
    const middle = tripBriefing(route(stops), "A", "B").slice(1, -1);

    expect(middle).toHaveLength(7);
    expect(middle.some((i) => i.text.includes("Visibility 0.4 mi"))).toBe(true);
    expect(middle.map((i) => i.mile)).toEqual([...middle.map((i) => i.mile)].sort((a, b) => a - b));
  });

  it("tells the captured plan's storm on route A", () => {
    const routeA = PLAN.routes.find((r) => r.id === "A")!;
    const texts = tripBriefing(routeA, "Dallas", "Houston").map((i) => i.text);

    expect(
      texts.some((t) => t.startsWith("No Travel risk: Wind 50 mph with a 35,000 lb load")),
    ).toBe(true);
    expect(texts).toContain("Back to Low risk");
  });
});

describe("conditions", () => {
  it("reads WMO codes as a driver would say them", () => {
    expect(describeSky(0)?.label).toBe("Clear");
    expect(describeSky(66)?.label).toBe("Freezing rain");
    expect(describeSky(75)?.kind).toBe("snow");
    expect(describeSky(95)?.kind).toBe("storm");
    expect(describeSky(null)).toBeNull();
  });

  it("shows visibility past 10 mi as 10+", () => {
    expect(formatVisibility(0.42)).toBe("0.4 mi");
    expect(formatVisibility(3.6)).toBe("4 mi");
    expect(formatVisibility(14.9)).toBe("10+ mi");
  });
});
