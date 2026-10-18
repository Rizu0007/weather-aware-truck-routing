import type { CanvasSource, Map as MapLibreMap } from "maplibre-gl";

import { riskColors } from "@/components/features/map/map-style";
import { RISK_LEVELS } from "@/constants/risk";
import type { Heatmap } from "@/types/api";

const SOURCE = "risk-field";
export const RISK_FIELD_LAYER = "risk-field";
const OPACITY = 0.6;
// Drawn at this many pixels per cell: scaled up smoothly, then the edge is cut sharp, so areas
// come out rounded like radar with crisp colour (a plain blur turned storms into a haze).
const PX_PER_CELL = 16;
// Alpha 0-255 after smoothing: below LOW is outside, above HIGH fully in; between is the
// 1-2 px anti-aliased edge.
const EDGE_LOW = 110;
const EDGE_HIGH = 150;

/** The heatmap's cells laid out on their regular lattice (cells sit on multiples of cell_deg). */
export interface FieldGrid {
  cols: number;
  rows: number;
  west: number;
  north: number;
  cellDeg: number;
  /** Index into heatmap.cells for each lattice spot (row-major from the north-west), or -1. */
  cellAt: Int32Array;
}

export function fieldGrid(heatmap: Heatmap): FieldGrid {
  const d = heatmap.cell_deg;
  const lons = heatmap.cells.map((c) => c.lon);
  const lats = heatmap.cells.map((c) => c.lat);
  const west = Math.min(...lons) - d / 2;
  const north = Math.max(...lats) + d / 2;
  const cols = Math.round((Math.max(...lons) + d / 2 - west) / d);
  const rows = Math.round((north - (Math.min(...lats) - d / 2)) / d);
  const cellAt = new Int32Array(cols * rows).fill(-1);
  heatmap.cells.forEach((cell, index) => {
    const col = Math.round((cell.lon - west) / d - 0.5);
    const row = Math.round((north - cell.lat) / d - 0.5);
    cellAt[row * cols + col] = index;
  });
  return { cols, rows, west, north, cellDeg: d, cellAt };
}

/** [west, north] … corners, clockwise from the north-west, as an image source wants them. */
export function fieldCorners(grid: FieldGrid): [number, number][] {
  const east = grid.west + grid.cols * grid.cellDeg;
  const south = grid.north - grid.rows * grid.cellDeg;
  return [
    [grid.west, grid.north],
    [east, grid.north],
    [east, south],
    [grid.west, south],
  ];
}

/**
 * The risk heatmap as a smooth, radar-like field: one pixel per cell, scaled up and softened
 * on a canvas the map shows as an image. Low is left clear. A new hour redraws ~100 pixels,
 * so scrubbing stays instant.
 */
export class RiskField {
  private readonly map: MapLibreMap;
  private readonly beforeLayer: string;
  private readonly cells = document.createElement("canvas");
  private readonly field = document.createElement("canvas");
  private heatmap: Heatmap | undefined;
  private grid: FieldGrid | undefined;
  private hour = 0;
  private visible = true;

  constructor(map: MapLibreMap, beforeLayer: string) {
    this.map = map;
    this.beforeLayer = beforeLayer;
  }

  setHeatmap(heatmap: Heatmap) {
    this.heatmap = heatmap;
    this.grid = fieldGrid(heatmap);
    const { cols, rows } = this.grid;
    this.cells.width = cols;
    this.cells.height = rows;
    this.field.width = cols * PX_PER_CELL;
    this.field.height = rows * PX_PER_CELL;
    this.draw();

    const coordinates = fieldCorners(this.grid) as CanvasSource["coordinates"];
    const existing = this.map.getSource<CanvasSource>(SOURCE);
    if (existing) {
      existing.setCoordinates(coordinates);
    } else {
      this.map.addSource(SOURCE, {
        type: "canvas",
        canvas: this.field,
        coordinates,
        animate: false,
      });
      this.map.addLayer(
        {
          id: RISK_FIELD_LAYER,
          type: "raster",
          source: SOURCE,
          layout: { visibility: this.visible ? "visible" : "none" },
          paint: { "raster-opacity": OPACITY, "raster-fade-duration": 0 },
        },
        this.beforeLayer,
      );
    }
    this.refresh();
  }

  setHour(hour: number) {
    this.hour = hour;
    this.draw();
    this.refresh();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (this.map.getLayer(RISK_FIELD_LAYER)) {
      this.map.setLayoutProperty(RISK_FIELD_LAYER, "visibility", visible ? "visible" : "none");
    }
  }

  private draw() {
    const { heatmap, grid } = this;
    const small = this.cells.getContext("2d");
    const big = this.field.getContext("2d");
    if (!heatmap || !grid || !small || !big) return;

    const colors = riskColors();
    const image = small.createImageData(grid.cols, grid.rows);
    const rgb = RISK_LEVELS.map((level) => toRgb(small, colors[level]));
    grid.cellAt.forEach((index, spot) => {
      const level = index < 0 ? 0 : (heatmap.cells[index].risk[this.hour] ?? 0);
      if (level <= 0) return; // Low and empty spots stay transparent
      const [r, g, b] = rgb[level];
      image.data.set([r, g, b, 255], spot * 4);
    });
    small.putImageData(image, 0, 0);

    big.clearRect(0, 0, this.field.width, this.field.height);
    big.imageSmoothingEnabled = true;
    big.drawImage(this.cells, 0, 0, this.field.width, this.field.height);
    sharpenEdges(big, this.field.width, this.field.height);
  }

  /** A canvas source re-reads its canvas only while playing: play for one frame. */
  private refresh() {
    const source = this.map.getSource<CanvasSource>(SOURCE);
    if (!source) return;
    source.play();
    this.map.once("render", () => source.pause());
  }
}

/** Cuts the smoothed alpha into a crisp outline, and makes the inside fully opaque. */
function sharpenEdges(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a === 0) continue;
    // Canvas pixels are un-premultiplied here, so colour stays true as alpha changes.
    data[i] =
      a <= EDGE_LOW ? 0 : a >= EDGE_HIGH ? 255 : ((a - EDGE_LOW) / (EDGE_HIGH - EDGE_LOW)) * 255;
  }
  context.putImageData(image, 0, 0);
}

/** Any CSS colour as [r, g, b]: the canvas normalises what it's given to #rrggbb. */
function toRgb(context: CanvasRenderingContext2D, color: string): [number, number, number] {
  context.fillStyle = color;
  const value = String(context.fillStyle).replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
