import type { Map as MapLibreMap } from "maplibre-gl";

import { fieldGrid, type FieldGrid } from "@/components/features/map/risk-field";
import type { Heatmap } from "@/types/api";
import { cellWeather, SHOWN_FROM } from "@/utils/weather";

// Wind: streamlines with fading trails, only where it's strong enough to matter.
const WIND_PER_CELL = 14;
const WIND_PX_PER_S_PER_MPH = 0.9; // on screen: 50 mph drifts 45 px/s
const WIND_LIFE_S: [number, number] = [3, 5];
const TRAIL_KEEP = 0.96; // share of the last frame kept: the tail behind each line
// Rain and snow: particles per 100 × 100 px of rainy or snowy cell on screen.
const RAIN_DENSITY = 22;
const SNOW_DENSITY = 9;
const RAIN_FALL_PX_S = 170;
const SNOW_FALL_PX_S = 16;
const RAIN_LIFE_S: [number, number] = [0.6, 1.1];
const SNOW_LIFE_S: [number, number] = [4, 7];
const MAX_PARTICLES = 1_600;
const MAX_FRAME_S = 0.05;
const WORLD_PX = 512; // MapLibre's world at zoom 0

type Kind = "wind" | "rain" | "snow";

/** Per lattice spot for one hour: wind in mph (x east, y south), rain and snow in in/hr. */
export interface WeatherField {
  windX: Float32Array;
  windY: Float32Array;
  rain: Float32Array;
  snow: Float32Array;
}

export function weatherField(heatmap: Heatmap, grid: FieldGrid, hour: number): WeatherField {
  const size = grid.cellAt.length;
  const field = {
    windX: new Float32Array(size).fill(Number.NaN),
    windY: new Float32Array(size).fill(Number.NaN),
    rain: new Float32Array(size).fill(Number.NaN),
    snow: new Float32Array(size).fill(Number.NaN),
  };
  grid.cellAt.forEach((index, spot) => {
    if (index < 0) return;
    const cell = heatmap.cells[index];
    const mph = cell.wind_mph[hour] ?? 0;
    // Meteorological: degrees it blows from, clockwise from north. Unknown: from the west.
    const toward = (((cell.wind_from_deg[hour] ?? 270) + 180) * Math.PI) / 180;
    field.windX[spot] = Math.sin(toward) * mph;
    field.windY[spot] = -Math.cos(toward) * mph;
    field.rain[spot] = cell.rain_in_hr[hour] ?? 0;
    field.snow[spot] = cell.snow_in_hr[hour] ?? 0;
  });
  return field;
}

interface Particle {
  kind: Kind;
  lon: number;
  lat: number;
  age: number;
  life: number;
  phase: number;
}

/**
 * Wind, rain and snow over the corridor, each in its own look: white streamlines where wind is
 * 25+ mph, light-blue falling streaks where it rains, drifting dots where it snows. Values are
 * blended between cells, so nothing follows the grid's squares.
 */
export class WeatherFlow {
  private readonly map: MapLibreMap;
  // Wind keeps trails between frames; rain and snow are redrawn clean each frame.
  private readonly trails = document.createElement("canvas");
  private readonly precip = document.createElement("canvas");
  private heatmap: Heatmap | undefined;
  private grid: FieldGrid | undefined;
  private field: WeatherField | undefined;
  private sources: Record<Kind, number[]> = { wind: [], rain: [], snow: [] };
  private particles: Particle[] = [];
  private hour = 0;
  private frame = 0;
  private last = 0;
  private moving = false;

  constructor(map: MapLibreMap) {
    this.map = map;
    for (const canvas of [this.trails, this.precip]) {
      canvas.className = "weather-flow";
      canvas.setAttribute("aria-hidden", "true");
      map.getCanvasContainer().appendChild(canvas);
    }
    map.on("resize", this.resize);
    // Trails are in screen space; while the map moves, drop them instead of smearing.
    map.on("movestart", this.startMoving);
    map.on("moveend", this.stopMoving);
    this.resize();
  }

  setHeatmap(heatmap: Heatmap) {
    this.heatmap = heatmap;
    this.grid = fieldGrid(heatmap);
    this.particles = [];
    this.setHour(this.hour);
  }

  /** Particles in flight keep going; new ones start only where the new hour has weather. */
  setHour(hour: number) {
    this.hour = hour;
    const { heatmap, grid } = this;
    if (!heatmap || !grid) return;
    this.field = weatherField(heatmap, grid, hour);
    this.sources = { wind: [], rain: [], snow: [] };
    heatmap.cells.forEach((cell, index) => {
      const weather = cellWeather(cell, hour);
      if (weather.wind) this.sources.wind.push(index);
      if (weather.rain) this.sources.rain.push(index);
      if (weather.snow) this.sources.snow.push(index);
    });
    this.fill();
  }

  setEnabled(enabled: boolean) {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.clear(this.trails);
    this.clear(this.precip);
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
    this.trails.remove();
    this.precip.remove();
  }

  private readonly startMoving = () => (this.moving = true);
  private readonly stopMoving = () => {
    this.moving = false;
    this.fill(); // a zoom changes how many particles the cells need on screen
  };

  private readonly resize = () => {
    const { clientWidth, clientHeight } = this.map.getCanvas();
    const ratio = window.devicePixelRatio || 1;
    for (const canvas of [this.trails, this.precip]) {
      canvas.width = Math.round(clientWidth * ratio);
      canvas.height = Math.round(clientHeight * ratio);
      canvas.style.width = `${clientWidth}px`;
      canvas.style.height = `${clientHeight}px`;
      canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  };

  private clear(canvas: HTMLCanvasElement) {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  /** Grow or shrink each kind's pool to what its cells need at this zoom; extras retire. */
  private fill() {
    const { heatmap } = this;
    if (!heatmap) return;
    const cellPx = (heatmap.cell_deg * WORLD_PX * 2 ** this.map.getZoom()) / 360;
    const cellArea = (cellPx * cellPx) / 10_000;
    const wanted: Record<Kind, number> = {
      wind: this.sources.wind.length * WIND_PER_CELL,
      rain: Math.round(this.sources.rain.length * cellArea * RAIN_DENSITY),
      snow: Math.round(this.sources.snow.length * cellArea * SNOW_DENSITY),
    };
    const total = wanted.wind + wanted.rain + wanted.snow;
    const scale = total > MAX_PARTICLES ? MAX_PARTICLES / total : 1;
    const kept: Particle[] = [];
    for (const kind of ["wind", "rain", "snow"] as Kind[]) {
      const target = Math.floor(wanted[kind] * scale);
      const current = this.particles.filter((p) => p.kind === kind).slice(0, target);
      while (current.length < target) current.push(this.spawn({ kind } as Particle, true));
      kept.push(...current);
    }
    this.particles = kept;
  }

  private readonly draw = (now: number) => {
    this.frame = requestAnimationFrame(this.draw);
    const trails = this.trails.getContext("2d");
    const precip = this.precip.getContext("2d");
    if (!trails || !precip || !this.field) return;
    const dt = Math.min(MAX_FRAME_S, (now - this.last) / 1000);
    this.last = now;

    if (this.moving) {
      this.clear(this.trails);
    } else {
      trails.globalCompositeOperation = "destination-in";
      trails.fillStyle = `rgb(0 0 0 / ${TRAIL_KEEP})`;
      trails.fillRect(0, 0, this.trails.width, this.trails.height);
      trails.globalCompositeOperation = "source-over";
    }
    this.clear(this.precip);

    const degPerPx = 360 / (WORLD_PX * 2 ** this.map.getZoom());
    const wind = [new Path2D(), new Path2D()]; // moderate, strong
    const rain = [new Path2D(), new Path2D()]; // fading in or out, full
    const snow = [new Path2D(), new Path2D()];

    for (const p of this.particles) {
      p.age += dt;
      const latScale = Math.cos((p.lat * Math.PI) / 180); // Mercator: 1° of lat is taller
      if (p.kind === "wind") {
        const vx = this.sample(this.field.windX, p.lon, p.lat);
        const vy = this.sample(this.field.windY, p.lon, p.lat);
        const mph = Math.hypot(vx, vy);
        if (p.age > p.life || !(mph >= SHOWN_FROM.windMph * 0.8)) {
          this.spawn(p, false);
          continue;
        }
        const from = this.map.project([p.lon, p.lat]);
        const k = WIND_PX_PER_S_PER_MPH * dt * degPerPx;
        p.lon += vx * k;
        p.lat -= vy * k * latScale;
        const to = this.map.project([p.lon, p.lat]);
        const path = wind[mph < 40 ? 0 : 1];
        path.moveTo(from.x, from.y);
        path.lineTo(to.x, to.y);
        continue;
      }

      const amount = this.sample(
        p.kind === "rain" ? this.field.rain : this.field.snow,
        p.lon,
        p.lat,
      );
      const from = p.kind === "rain" ? SHOWN_FROM.rainInHr : SHOWN_FROM.snowInHr;
      if (p.age > p.life || !(amount >= from * 0.6)) {
        this.spawn(p, false);
        continue;
      }
      // Lean with the wind, so rain and wind tell one story.
      const vx = this.sample(this.field.windX, p.lon, p.lat) || 0;
      const fall = p.kind === "rain" ? RAIN_FALL_PX_S : SNOW_FALL_PX_S;
      const sway = p.kind === "snow" ? Math.sin(p.age * 1.1 + p.phase) * 8 : 0;
      const dx = (vx * (p.kind === "rain" ? 1.2 : 0.6) + sway) * dt;
      p.lon += dx * degPerPx;
      p.lat -= fall * dt * degPerPx * latScale;
      const at = this.map.project([p.lon, p.lat]);
      // Soft in and out over the particle's life, and where the rain or snow thins.
      const t = p.age / p.life;
      const strong = t > 0.15 && t < 0.85 && amount >= from;
      if (p.kind === "rain") {
        const path = rain[strong ? 1 : 0];
        const lean = vx * 0.05;
        path.moveTo(at.x, at.y);
        path.lineTo(at.x - lean, at.y - 9);
      } else {
        const path = snow[strong ? 1 : 0];
        path.moveTo(at.x + 1.8, at.y);
        path.arc(at.x, at.y, 1.8, 0, Math.PI * 2);
      }
    }

    trails.lineCap = "round";
    trails.lineWidth = 1.4;
    trails.strokeStyle = "rgb(240 248 255 / 0.55)";
    trails.stroke(wind[0]);
    trails.strokeStyle = "rgb(240 248 255 / 0.9)";
    trails.stroke(wind[1]);

    precip.lineCap = "round";
    precip.lineWidth = 1.3;
    precip.strokeStyle = "rgb(125 190 255 / 0.35)";
    precip.stroke(rain[0]);
    precip.strokeStyle = "rgb(125 190 255 / 0.8)";
    precip.stroke(rain[1]);
    precip.fillStyle = "rgb(255 255 255 / 0.45)";
    precip.fill(snow[0]);
    precip.fillStyle = "rgb(255 255 255 / 0.95)";
    precip.fill(snow[1]);
  };

  /** A value at a point, blended from the four nearest lattice spots; NaN outside the corridor. */
  private sample(values: Float32Array, lon: number, lat: number): number {
    const grid = this.grid!;
    const x = (lon - grid.west) / grid.cellDeg - 0.5;
    const y = (grid.north - lat) / grid.cellDeg - 0.5;
    const col = Math.floor(x);
    const row = Math.floor(y);
    let sum = 0;
    let weight = 0;
    for (let dr = 0; dr <= 1; dr++) {
      for (let dc = 0; dc <= 1; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
        const value = values[r * grid.cols + c];
        if (Number.isNaN(value)) continue;
        const w = (1 - Math.abs(x - c)) * (1 - Math.abs(y - r));
        sum += value * w;
        weight += w;
      }
    }
    return weight < 0.25 ? Number.NaN : sum / weight;
  }

  /** Somewhere in a cell that has this kind of weather now; the first start part-way through. */
  private spawn(p: Particle, staggered: boolean): Particle {
    const { heatmap } = this;
    const sources = this.sources[p.kind];
    const [min, max] =
      p.kind === "wind" ? WIND_LIFE_S : p.kind === "rain" ? RAIN_LIFE_S : SNOW_LIFE_S;
    p.life = min + Math.random() * (max - min);
    p.age = staggered ? Math.random() * p.life : 0;
    p.phase = Math.random() * Math.PI * 2;
    if (heatmap && sources.length) {
      const cell = heatmap.cells[sources[Math.floor(Math.random() * sources.length)]];
      p.lon = cell.lon + (Math.random() - 0.5) * heatmap.cell_deg;
      p.lat = cell.lat + (Math.random() - 0.5) * heatmap.cell_deg;
    } else {
      // Nothing of this kind this hour: park it until the pool shrinks or weather returns.
      p.lon = Number.NaN;
      p.lat = Number.NaN;
    }
    return p;
  }
}
