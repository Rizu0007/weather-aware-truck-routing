import type { Map as MapLibreMap } from "maplibre-gl";

import { fieldGrid, type FieldGrid } from "@/components/features/map/risk-field";
import type { Heatmap } from "@/types/api";

const PARTICLES_PER_CELL = 10;
const MAX_PARTICLES = 1_200;
const PX_PER_S_PER_MPH = 2.2; // on screen: 20 mph drifts 44 px/s, 50 mph 110 px/s
const LIFE_S: [number, number] = [2, 4];
// Each frame keeps this much of the last one: the fading tail behind every particle.
const TRAIL_KEEP = 0.95;
const MAX_FRAME_S = 0.05;

/** Wind at each lattice spot for one hour, in mph towards east (x) and south (y, screen down). */
export function windField(heatmap: Heatmap, grid: FieldGrid, hour: number): Float32Array {
  const field = new Float32Array(grid.cellAt.length * 2).fill(Number.NaN);
  grid.cellAt.forEach((index, spot) => {
    if (index < 0) return;
    const cell = heatmap.cells[index];
    const mph = cell.wind_mph[hour] ?? 0;
    // Meteorological: degrees it blows from, clockwise from north. Unknown: from the west.
    const toward = (((cell.wind_from_deg[hour] ?? 270) + 180) * Math.PI) / 180;
    field[spot * 2] = Math.sin(toward) * mph;
    field[spot * 2 + 1] = -Math.cos(toward) * mph;
  });
  return field;
}

interface Particle {
  lon: number;
  lat: number;
  age: number;
  life: number;
}

/**
 * Wind as flowing streamlines over the corridor, Windy-style: particles drift with the
 * hour's wind and leave fading trails. Faster wind, faster and brighter lines.
 */
export class WindFlow {
  private readonly map: MapLibreMap;
  private readonly canvas = document.createElement("canvas");
  private readonly context: CanvasRenderingContext2D | null;
  private heatmap: Heatmap | undefined;
  private grid: FieldGrid | undefined;
  private wind: ReturnType<typeof windField> = new Float32Array(0);
  private particles: Particle[] = [];
  private hour = 0;
  private frame = 0;
  private last = 0;
  private moving = false;

  constructor(map: MapLibreMap) {
    this.map = map;
    this.canvas.className = "wind-flow";
    this.canvas.setAttribute("aria-hidden", "true");
    map.getCanvasContainer().appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");
    map.on("resize", this.resize);
    // Trails are in screen space; while the map moves, drop them instead of smearing.
    map.on("movestart", this.startMoving);
    map.on("moveend", this.stopMoving);
    this.resize();
  }

  setHeatmap(heatmap: Heatmap) {
    this.heatmap = heatmap;
    this.grid = fieldGrid(heatmap);
    const count = Math.min(MAX_PARTICLES, heatmap.cells.length * PARTICLES_PER_CELL);
    this.particles = Array.from({ length: count }, () => this.spawn({} as Particle, true));
    this.setHour(this.hour);
  }

  /** Particles keep their places; only the wind under them changes, so hours flow smoothly. */
  setHour(hour: number) {
    this.hour = hour;
    if (this.heatmap && this.grid) this.wind = windField(this.heatmap, this.grid, hour);
  }

  setEnabled(enabled: boolean) {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.clear();
    if (enabled) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.draw);
    }
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.map.off("resize", this.resize);
    this.map.off("movestart", this.startMoving);
    this.map.off("moveend", this.stopMoving);
    this.canvas.remove();
  }

  private readonly startMoving = () => (this.moving = true);
  private readonly stopMoving = () => (this.moving = false);

  private readonly resize = () => {
    const { clientWidth, clientHeight } = this.map.getCanvas();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(clientWidth * ratio);
    this.canvas.height = Math.round(clientHeight * ratio);
    this.canvas.style.width = `${clientWidth}px`;
    this.canvas.style.height = `${clientHeight}px`;
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  private clear() {
    this.context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private readonly draw = (now: number) => {
    const context = this.context;
    this.frame = requestAnimationFrame(this.draw);
    if (!context || !this.grid) return;
    const dt = Math.min(MAX_FRAME_S, (now - this.last) / 1000);
    this.last = now;

    // Fade what's there, so each particle leaves a short tail.
    if (this.moving) {
      this.clear();
    } else {
      context.globalCompositeOperation = "destination-in";
      context.fillStyle = `rgb(0 0 0 / ${TRAIL_KEEP})`;
      context.fillRect(0, 0, this.canvas.width, this.canvas.height);
      context.globalCompositeOperation = "source-over";
    }

    // Degrees per screen pixel at this zoom (MapLibre's world is 512 px at zoom 0).
    const degPerPx = 360 / (512 * 2 ** this.map.getZoom());
    // Three brightness bands by speed, one path each.
    const bands = [new Path2D(), new Path2D(), new Path2D()];

    for (const p of this.particles) {
      p.age += dt;
      const [vx, vy] = this.sample(p.lon, p.lat);
      if (p.age > p.life || Number.isNaN(vx)) {
        this.spawn(p, false);
        continue;
      }
      const from = this.map.project([p.lon, p.lat]);
      const kx = PX_PER_S_PER_MPH * dt * degPerPx;
      p.lon += vx * kx;
      // Mercator stretches latitude by 1/cos(lat).
      p.lat -= vy * kx * Math.cos((p.lat * Math.PI) / 180);
      const to = this.map.project([p.lon, p.lat]);
      const mph = Math.hypot(vx, vy);
      const band = mph < 15 ? 0 : mph < 30 ? 1 : 2;
      bands[band].moveTo(from.x, from.y);
      bands[band].lineTo(to.x, to.y);
    }

    context.lineCap = "round";
    context.lineWidth = 1.2;
    // Calm air is barely there, so the eye goes to strong wind.
    [0.12, 0.45, 0.85].forEach((alpha, band) => {
      context.strokeStyle = `rgb(240 248 255 / ${alpha})`;
      context.stroke(bands[band]);
    });
  };

  /** Wind (mph east, mph south) at a point, blended from the four nearest lattice spots. */
  private sample(lon: number, lat: number): [number, number] {
    const grid = this.grid!;
    const x = (lon - grid.west) / grid.cellDeg - 0.5;
    const y = (grid.north - lat) / grid.cellDeg - 0.5;
    const col = Math.floor(x);
    const row = Math.floor(y);
    let vx = 0;
    let vy = 0;
    let weight = 0;
    for (const [dc, dr] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
      const spot = r * grid.cols + c;
      const u = this.wind[spot * 2];
      if (Number.isNaN(u)) continue;
      const w = (1 - Math.abs(x - c)) * (1 - Math.abs(y - r));
      vx += u * w;
      vy += this.wind[spot * 2 + 1] * w;
      weight += w;
    }
    // Outside the corridor (no spot near): the particle is done.
    return weight < 0.25 ? [Number.NaN, Number.NaN] : [vx / weight, vy / weight];
  }

  /** Somewhere random in a corridor cell; the first ones start part-way through their life. */
  private spawn(p: Particle, staggered: boolean): Particle {
    const { heatmap } = this;
    const [min, max] = LIFE_S;
    p.life = min + Math.random() * (max - min);
    p.age = staggered ? Math.random() * p.life : 0;
    if (heatmap?.cells.length) {
      const cell = heatmap.cells[Math.floor(Math.random() * heatmap.cells.length)];
      p.lon = cell.lon + (Math.random() - 0.5) * heatmap.cell_deg;
      p.lat = cell.lat + (Math.random() - 0.5) * heatmap.cell_deg;
    }
    return p;
  }
}
