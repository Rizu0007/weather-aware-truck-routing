import { describe, expect, it } from "vitest";

import { cellMotion } from "@/components/features/map/weather-motion";
import type { HeatmapCell } from "@/types/api";

function cell(wind: number | null, rain: number | null, snow: number | null, from: number | null) {
  const cellAt: HeatmapCell = {
    lon: -96,
    lat: 31,
    risk: [0],
    wind_mph: [wind],
    rain_in_hr: [rain],
    snow_in_hr: [snow],
    wind_from_deg: [from],
  };
  return cellMotion(cellAt, 0);
}

describe("cellMotion", () => {
  it("calm, dry air draws nothing", () => {
    expect(cell(7, 0, 0, 270)).toMatchObject({ drops: 0, flakes: 0, streaks: 0 });
  });

  it("more rain, more drops, up to a cap", () => {
    const light = cell(5, 0.1, 0, 270).drops;
    const heavy = cell(5, 0.5, 0, 270).drops;
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
    expect(cell(5, 5, 0, 270).drops).toBe(50);
  });

  it("snow falls as flakes", () => {
    expect(cell(5, 0, 1, 270).flakes).toBeGreaterThan(0);
  });

  it("wind is drawn from 15 mph, more streaks when stronger", () => {
    expect(cell(14, 0, 0, 270).streaks).toBe(0);
    expect(cell(50, 0, 0, 270).streaks).toBeGreaterThan(cell(20, 0, 0, 270).streaks);
  });

  it("wind from the west blows east, from the north blows down the screen", () => {
    const [ex, ey] = cell(30, 0, 0, 270).toward;
    expect(ex).toBeCloseTo(1);
    expect(ey).toBeCloseTo(0);
    const [sx, sy] = cell(30, 0, 0, 0).toward;
    expect(sx).toBeCloseTo(0);
    expect(sy).toBeCloseTo(1);
  });

  it("missing data counts as calm, and a missing direction as westerly", () => {
    expect(cell(null, null, null, null)).toMatchObject({ drops: 0, flakes: 0, streaks: 0 });
    expect(cell(30, 0, 0, null).toward[0]).toBeCloseTo(1);
  });
});
