import { describe, expect, it } from "vitest";

import { fieldCorners, fieldGrid } from "@/components/features/map/risk-field";
import { weatherField } from "@/components/features/map/weather-flow";
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

describe("weatherField", () => {
  const heatmap = { ...HEATMAP, cell_deg: 0.5, cells: [cellAt(-96.25, 31.25, 20, 270)] };
  const grid = fieldGrid(heatmap);

  it("wind from the west blows east (x), in mph", () => {
    const { windX, windY } = weatherField(heatmap, grid, 0);
    expect(windX[0]).toBeCloseTo(20);
    expect(windY[0]).toBeCloseTo(0);
  });

  it("wind from the north blows down the screen (y)", () => {
    const north = { ...heatmap, cells: [cellAt(-96.25, 31.25, 20, 0)] };
    const { windX, windY } = weatherField(north, grid, 0);
    expect(windX[0]).toBeCloseTo(0);
    expect(windY[0]).toBeCloseTo(20);
  });
});

it("an older backend without wind direction still gives a field (wind from the west)", () => {
  const cell = cellAt(-96.25, 31.25, 20);
  delete cell.wind_from_deg;
  const heatmap = { ...HEATMAP, cell_deg: 0.5, cells: [cell] };

  const { windX } = weatherField(heatmap, fieldGrid(heatmap), 0);

  expect(windX[0]).toBeCloseTo(20);
});
