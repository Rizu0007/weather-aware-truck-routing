import type { Map as MapLibreMap } from "maplibre-gl";

import type { Heatmap, HeatmapCell } from "@/types/api";

// Particles per 100 × 100 px of cell on screen, so density holds at any zoom.
const DROPS_PER_IN_HR = 100; // 0.25 in/hr (High) gives 25
const MAX_DROPS = 50;
const FLAKES_PER_IN_HR = 6; // 1 in/hr (High) gives 6
const MAX_FLAKES = 14;
const WIND_FROM_MPH = 15; // calmer air isn't drawn
const MPH_PER_STREAK = 8;
const MAX_STREAKS = 6;
// Keeps a frame well under 4 ms even with every cell in view and raining.
const MAX_PARTICLES = 1_500;
const MAX_FRAME_S = 0.05; // after a stall, don't jump particles across cells
// Particles fade out over this share of the cell's edge, so weather has no hard square borders.
const EDGE_FADE = 0.18;
// Opacity steps: one path per step and kind keeps drawing to a few calls per frame.
const ALPHA_STEPS = 4;

/** What moves in one cell at one hour: densities, and where the wind blows (screen axes). */
export interface CellMotion {
  drops: number;
  flakes: number;
  streaks: number;
  windMph: number;
  /** Unit vector the wind blows towards; x right, y down. */
  toward: [number, number];
}

export function cellMotion(cell: HeatmapCell, hour: number): CellMotion {
  const rain = cell.rain_in_hr[hour] ?? 0;
  const snow = cell.snow_in_hr[hour] ?? 0;
  const windMph = cell.wind_mph[hour] ?? 0;
  const from = cell.wind_from_deg[hour];
  // Meteorological: the direction it blows from, clockwise from north. Unknown: from the west.
  const towardRad = (((from ?? 270) + 180) * Math.PI) / 180;
  return {
    drops: rain < 0.01 ? 0 : Math.min(MAX_DROPS, Math.max(1, rain * DROPS_PER_IN_HR)),
    flakes: snow < 0.05 ? 0 : Math.min(MAX_FLAKES, Math.max(1, snow * FLAKES_PER_IN_HR)),
    streaks:
      windMph < WIND_FROM_MPH
        ? 0
        : Math.min(MAX_STREAKS, 1 + (windMph - WIND_FROM_MPH) / MPH_PER_STREAK),
    windMph,
    toward: [Math.sin(towardRad), -Math.cos(towardRad)],
  };
}

type Kind = "drops" | "flakes" | "streaks";
const KINDS: Kind[] = ["drops", "flakes", "streaks"];

interface Look {
  /** Seconds a particle lives, as [min, max]. */
  life: [number, number];
  color: string;
  width: number;
}

const LOOKS: Record<Kind, Look> = {
  drops: { life: [0.45, 0.8], color: "rgb(165 205 255)", width: 1.1 },
  flakes: { life: [2.5, 4.5], color: "rgb(255 255 255)", width: 0 },
  streaks: { life: [1.2, 2.2], color: "rgb(235 245 255)", width: 1.4 },
};
const PEAK_ALPHA: Record<Kind, number> = { drops: 0.85, flakes: 0.9, streaks: 0.45 };

/** One particle, positioned in its cell (0-1 on each axis; it may drift out and fade). */
interface Particle {
  u: number;
  v: number;
  age: number;
  life: number;
  /** Per-particle variety: 0.75-1.25 times the base speed and size. */
  speed: number;
  size: number;
  phase: number;
  active: boolean;
}

/**
 * Rain, snow and wind drawn on a canvas over the map, inside the heatmap cells of one hour.
 * Particles live in cell coordinates, so panning and zooming carry them along. Each fades in
 * and out over its short life, so nothing pops, and an hour change cross-fades.
 */
export class WeatherMotion {
  private readonly canvas = document.createElement("canvas");
  private readonly context: CanvasRenderingContext2D | null;
  private readonly map: MapLibreMap;
  private cells: HeatmapCell[] = [];
  private half = 0;
  private hour = 0;
  private enabled = false;
  private frame = 0;
  private last = 0;
  private motion: CellMotion[] = [];
  // Per cell and kind, grown on demand and reused, so frames allocate nothing.
  private particles = new Map<string, Particle[]>();

  constructor(map: MapLibreMap) {
    this.map = map;
    this.canvas.className = "weather-motion";
    this.canvas.setAttribute("aria-hidden", "true");
    map.getCanvasContainer().appendChild(this.canvas);
    this.context = this.canvas.getContext("2d");
    map.on("resize", this.resize);
    this.resize();
  }

  setHeatmap(heatmap: Heatmap | undefined) {
    this.cells = heatmap?.cells ?? [];
    this.half = (heatmap?.cell_deg ?? 0) / 2;
    this.particles.clear();
    this.setHour(this.hour);
  }

  /** Particles already in flight finish their life, so the old hour fades into the new. */
  setHour(hour: number) {
    this.hour = hour;
    this.motion = this.cells.map((cell) => cellMotion(cell, hour));
    this.update();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.update();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.map.off("resize", this.resize);
    this.canvas.remove();
  }

  /** Run while there is something to draw, or still fading out; otherwise stop. */
  private update() {
    if (!this.enabled) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.clear();
      return;
    }
    if (!this.frame && (this.hasWeather() || this.particles.size)) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.draw);
    }
  }

  private hasWeather() {
    return this.motion.some((m) => m.drops > 0 || m.flakes > 0 || m.streaks > 0);
  }

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
    if (!context) return;
    const dt = Math.min(MAX_FRAME_S, (now - this.last) / 1000);
    this.last = now;
    this.clear();

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const paths = Object.fromEntries(
      KINDS.map((kind) => [kind, Array.from({ length: ALPHA_STEPS }, () => new Path2D())]),
    ) as Record<Kind, Path2D[]>;
    let budget = MAX_PARTICLES;
    let alive = 0;

    this.cells.forEach((cell, index) => {
      const motion = this.motion[index];
      const nw = this.map.project([cell.lon - this.half, cell.lat + this.half]);
      const se = this.map.project([cell.lon + this.half, cell.lat - this.half]);
      const w = se.x - nw.x;
      const h = se.y - nw.y;
      const offScreen = w < 2 || h < 2 || se.x < 0 || se.y < 0 || nw.x > width || nw.y > height;
      const area = (w * h) / 10_000;
      const [tx, ty] = motion.toward;
      const windPx = motion.windMph * 2; // px/s: 50 mph crosses a 100 px cell in a second

      for (const kind of KINDS) {
        const wanted = offScreen ? 0 : Math.min(budget, Math.round(motion[kind] * area));
        const points = this.particles.get(`${index}:${kind}`);
        if (!wanted && !points?.some((p) => p.active)) continue;
        budget -= wanted;
        const pool = this.pool(index, kind, wanted);

        for (let i = 0; i < pool.length; i++) {
          const p = pool[i];
          if (!p.active) {
            if (i >= wanted) continue;
            spawn(p, kind, false);
          }
          p.age += dt;
          if (p.age >= p.life) {
            // Beyond the hour's count, a finished particle isn't replaced: the old hour fades out.
            if (i < wanted) spawn(p, kind, false);
            else {
              p.active = false;
              continue;
            }
          }
          alive++;

          const s = p.speed;
          if (kind === "drops") {
            p.u += ((tx * windPx * 0.35 * s) / w) * dt;
            p.v += ((240 * s) / h) * dt;
          } else if (kind === "flakes") {
            p.u += ((Math.sin(p.age * 1.8 + p.phase) * 14 + tx * windPx * 0.25) / w) * dt;
            p.v += ((26 * s) / h) * dt;
          } else {
            p.u += ((tx * windPx * s) / w) * dt;
            p.v += ((ty * windPx * s) / h) * dt;
          }

          const alpha = lifeFade(p.age / p.life) * edgeFade(p.u, p.v);
          if (alpha < 0.05) continue;
          const path = paths[kind][Math.min(ALPHA_STEPS - 1, Math.floor(alpha * ALPHA_STEPS))];
          const x = nw.x + p.u * w;
          const y = nw.y + p.v * h;
          if (kind === "drops") {
            trail(path, x, y, tx * 3 * p.size, 10 * p.size, nw.x, nw.y, se.x, se.y);
          } else if (kind === "flakes") {
            const r = 1.2 + p.size * 0.6;
            path.moveTo(x + r, y);
            path.arc(x, y, r, 0, Math.PI * 2);
          } else {
            const length = (10 + motion.windMph * 0.35) * p.size;
            trail(path, x, y, tx * length, ty * length, nw.x, nw.y, se.x, se.y);
          }
        }
      }
    });

    context.lineCap = "round";
    for (const kind of KINDS) {
      const look = LOOKS[kind];
      context.strokeStyle = look.color;
      context.fillStyle = look.color;
      context.lineWidth = look.width;
      paths[kind].forEach((path, step) => {
        context.globalAlpha = PEAK_ALPHA[kind] * ((step + 1) / ALPHA_STEPS);
        if (kind === "flakes") context.fill(path);
        else context.stroke(path);
      });
    }
    context.globalAlpha = 1;

    if (alive === 0 && !this.hasWeather()) {
      this.particles.clear();
      this.frame = 0;
      return;
    }
    this.frame = requestAnimationFrame(this.draw);
  };

  private pool(index: number, kind: Kind, count: number): Particle[] {
    const key = `${index}:${kind}`;
    let points = this.particles.get(key);
    if (!points) this.particles.set(key, (points = []));
    while (points.length < count) {
      const p = {} as Particle;
      spawn(p, kind, true);
      points.push(p);
    }
    return points;
  }
}

/** A fresh particle somewhere in its cell. The first ones start part-way through their life,
 *  so a cell doesn't fill in one synchronised wave. */
function spawn(p: Particle, kind: Kind, staggered: boolean) {
  const [min, max] = LOOKS[kind].life;
  p.u = Math.random();
  p.v = Math.random();
  p.life = min + Math.random() * (max - min);
  p.age = staggered ? Math.random() * p.life : 0;
  p.speed = 0.75 + Math.random() * 0.5;
  p.size = 0.75 + Math.random() * 0.5;
  p.phase = Math.random() * Math.PI * 2;
  p.active = true;
}

/** 0 → 1 → 0 over a particle's life: in and out without a pop. */
function lifeFade(t: number): number {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
}

/** 1 inside the cell, easing to 0 at its edges and beyond. */
function edgeFade(u: number, v: number): number {
  const d = Math.min(u, 1 - u, v, 1 - v);
  if (d <= 0) return 0;
  const t = Math.min(1, d / EDGE_FADE);
  return t * t * (3 - 2 * t);
}

/** A line back from (x, y) by (dx, dy), cut where it would leave its cell. */
function trail(
  path: Path2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  let k = 1;
  if (dx > 0) k = Math.min(k, (x - left) / dx);
  if (dx < 0) k = Math.min(k, (right - x) / -dx);
  if (dy > 0) k = Math.min(k, (y - top) / dy);
  if (dy < 0) k = Math.min(k, (bottom - y) / -dy);
  if (k <= 0) return;
  path.moveTo(x, y);
  path.lineTo(x - dx * k, y - dy * k);
}
