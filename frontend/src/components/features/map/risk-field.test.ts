import { describe, expect, it } from "vitest";

import { fieldCorners, fieldGrid } from "@/components/features/map/risk-field";
import { windField } from "@/components/features/map/wind-flow";
import heatmapFixture from "@/test/fixtures/heatmap.json";
import type { Heatmap, HeatmapCell } from "@/types/api";

const HEATMAP: Heatmap = heatmapFixture;

function cellAt(lon: number, lat: number, windMph = 10, from = 270): HeatmapCell {
  return {
    lon,
    lat,
    risk: [0],
    wind_mph: [windMph],
    rain_in_hr: [0],
    snow_in_hr: [0],
    wind_from_deg: [from],
  };
}

describe("fieldGrid", () => {
  it("puts every cell on its lattice spot, once", () => {
    const grid = fieldGrid(HEATMAP);
    const placed = [...grid.cellAt].filter((index) => index >= 0);

    expect(placed.sort((a, b) => a - b)).toEqual(HEATMAP.cells.map((_, i) => i));
  });

  it("lays out rows from the north-west, with gaps left empty", () => {
    // An L of three 0.5° cells: the missing corner stays -1.
    const grid = fieldGrid({
      ...HEATMAP,
      cell_deg: 0.5,
      cells: [cellAt(-96.25, 31.75), cellAt(-96.25, 31.25), cellAt(-95.75, 31.25)],
    });

    expect([grid.cols, grid.rows, grid.west, grid.north]).toEqual([2, 2, -96.5, 32]);
    expect([...grid.cellAt]).toEqual([0, -1, 1, 2]);
    expect(fieldCorners(grid)).toEqual([
      [-96.5, 32],
      [-95.5, 32],
      [-95.5, 31],
      [-96.5, 31],
    ]);
  });
});

describe("windField", () => {
  const heatmap = { ...HEATMAP, cell_deg: 0.5, cells: [cellAt(-96.25, 31.25, 20, 270)] };
  const grid = fieldGrid(heatmap);

  it("wind from the west blows east (x), in mph", () => {
    const [vx, vy] = windField(heatmap, grid, 0);
    expect(vx).toBeCloseTo(20);
    expect(vy).toBeCloseTo(0);
  });

  it("wind from the north blows down the screen (y)", () => {
    const north = { ...heatmap, cells: [cellAt(-96.25, 31.25, 20, 0)] };
    const [vx, vy] = windField(north, grid, 0);
    expect(vx).toBeCloseTo(0);
    expect(vy).toBeCloseTo(20);
  });
});
