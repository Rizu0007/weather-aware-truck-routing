import type { AddLayerObject } from "maplibre-gl";

import { RISK_LEVELS, type RiskLevel } from "@/constants/risk";

// Basemap: free and keyless; attribution is required (shown in the map and the footer).
export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

export const SOURCES = {
  segments: "risk-segments",
  routes: "routes",
  checkpoints: "checkpoints",
  otherCheckpoints: "other-checkpoints",
  endpoints: "endpoints",
} as const;

export const LAYERS = {
  casing: "route-casing",
  risk: "route-risk",
  hit: "route-hit",
  otherCheckpoints: "other-checkpoints",
  checkpoints: "checkpoints",
  endpoints: "endpoints",
} as const;

/** A MapLibre expression (validated at runtime; its tuple types are too strict to infer). */
function expression<T>(value: unknown[]): T {
  return value as T;
}

// Colours come from tokens.css, so the map and the UI can't drift apart.
const FALLBACK: Record<RiskLevel, string> = {
  low: "#22c55e",
  moderate: "#facc15",
  high: "#fb923c",
  severe: "#ef4444",
  no_travel: "#e879f9",
};

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function riskColors(): Record<RiskLevel, string> {
  return Object.fromEntries(
    RISK_LEVELS.map((level) => [
      level,
      token(`--risk-${level.replace("_", "-")}`, FALLBACK[level]),
    ]),
  ) as Record<RiskLevel, string>;
}

/** ["match", ["get", "level"], "low", "#22c55e", …, fallback] */
function levelColor(colors: Record<RiskLevel, string>) {
  return expression<string>([
    "match",
    ["get", "level"],
    ...RISK_LEVELS.flatMap((level) => [level, colors[level]]),
    colors.low,
  ]);
}

const isSelected = (selectedId: string) => ["==", ["get", "routeId"], selectedId];

/** Layers, bottom to top. Width/opacity depend on the selected route (see `selectionPaint`). */
export function routeLayers(selectedId: string): AddLayerObject[] {
  const colors = riskColors();
  const casing = token("--route-casing", "#0d1a2e");
  return [
    {
      id: LAYERS.casing,
      type: "line",
      source: SOURCES.segments,
      layout: { "line-join": "round", "line-cap": "round", "line-sort-key": sortKey(selectedId) },
      paint: selectionPaint(selectedId).casing,
    },
    {
      id: LAYERS.risk,
      type: "line",
      source: SOURCES.segments,
      layout: { "line-join": "round", "line-cap": "round", "line-sort-key": sortKey(selectedId) },
      paint: { "line-color": levelColor(colors), ...selectionPaint(selectedId).risk },
    },
    {
      // Invisible and wide: easier to click or tap a route than its thin line.
      id: LAYERS.hit,
      type: "line",
      source: SOURCES.routes,
      paint: { "line-width": 18, "line-opacity": 0 },
    },
    {
      // Smaller and faded; clicking one selects its route through the hit layer.
      id: LAYERS.otherCheckpoints,
      type: "circle",
      source: SOURCES.otherCheckpoints,
      paint: {
        "circle-color": levelColor(colors),
        "circle-opacity": 0.45,
        "circle-stroke-color": casing,
        "circle-stroke-width": 1.5,
        "circle-stroke-opacity": 0.45,
        "circle-radius": expression<number>(["interpolate", ["linear"], ["zoom"], 4, 2.5, 9, 4]),
      },
    },
    {
      id: LAYERS.checkpoints,
      type: "circle",
      source: SOURCES.checkpoints,
      paint: {
        "circle-color": levelColor(colors),
        // An amber ring where there's a crosswind, ice risk or fog, so a whole stretch shows.
        "circle-stroke-color": expression<string>([
          "case",
          ["boolean", ["get", "warn"], false],
          token("--warning", "#fbbf24"),
          casing,
        ]),
        "circle-stroke-width": expression<number>([
          "case",
          ["boolean", ["get", "warn"], false],
          3,
          2,
        ]),
        // MapLibre allows "zoom" only at the top of an expression, so the
        // active check goes inside each zoom stop.
        "circle-radius": expression<number>([
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          ["case", ["boolean", ["feature-state", "active"], false], 8, 3.5],
          9,
          ["case", ["boolean", ["feature-state", "active"], false], 11, 6],
        ]),
      },
    },
    {
      id: LAYERS.endpoints,
      type: "circle",
      source: SOURCES.endpoints,
      paint: {
        "circle-radius": 7,
        "circle-color": expression<string>(["match", ["get", "kind"], "origin", casing, "#ffffff"]),
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3,
      },
    },
  ];
}

/** Paint values that change with the selection. The selected route gets a white outline and
 *  full strength, so it stands out even when every route is the same risk colour. */
export function selectionPaint(selectedId: string) {
  const pick = <T>(selected: T, other: T) =>
    expression<T>(["case", isSelected(selectedId), selected, other]);
  return {
    casing: {
      "line-color": pick(SELECTED_OUTLINE, token("--route-casing", "#0d1a2e")),
      "line-width": pick(10, 6),
      "line-opacity": pick(1, 0.6),
    },
    // Others stay visible enough that their risky stretches show without selecting them.
    risk: { "line-width": pick(5.5, 3), "line-opacity": pick(1, 0.55) },
  };
}

const SELECTED_OUTLINE = "#ffffff";

/** Draw the selected route on top of the others. */
export function sortKey(selectedId: string) {
  return expression<number>(["case", isSelected(selectedId), 1, 0]);
}
