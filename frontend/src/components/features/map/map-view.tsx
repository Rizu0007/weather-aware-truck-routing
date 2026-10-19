import "maplibre-gl/dist/maplibre-gl.css";
import "@/components/features/map/map-view.css";

import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONFeature,
} from "maplibre-gl";
import type { GeoJSON } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";

import { CheckpointPopup } from "@/components/features/map/checkpoint-popup";
import {
  boundsOf,
  checkpointIndex,
  checkpointPoints,
  endpoints,
  labelPoint,
  otherCheckpointPoints,
  riskSegments,
  routeLines,
  truckAt,
} from "@/components/features/map/map-data";
import {
  BASEMAP_STYLE,
  LAYERS,
  routeLayers,
  selectionPaint,
  sortKey,
  SOURCES,
} from "@/components/features/map/map-style";
import { RiskField } from "@/components/features/map/risk-field";
import { WeatherFlow } from "@/components/features/map/weather-flow";
import { formatDuration, formatMiles } from "@/utils/format";
import { prefersReducedMotion } from "@/utils/motion";
import type { Heatmap, PlannedRoute } from "@/types/api";

// Vite needs the worker's URL spelled out (MapLibre docs, "Vite").
setWorkerUrl(workerUrl);

const FIT_PADDING = 48;
const TRUCK_GLIDE_MS = 900; // a little under playback's hour-a-second, so it arrives each step

/** The truck badge: lucide's truck in a turquoise disc (decorative; the timeline says where). */
function truckElement(): HTMLElement {
  const element = document.createElement("div");
  element.className = "truck-marker";
  element.setAttribute("aria-hidden", "true");
  element.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/>' +
    '<path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>' +
    '<circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
  return element;
}

/** A route's summary pinned to the map: id, drive time, distance and safety grade.
 *  Decorative for screen readers; the route cards say the same. */
function routeLabelElement(route: PlannedRoute, recommended: boolean): HTMLElement {
  const element = document.createElement("div");
  element.className = "route-label";
  element.dataset.grade = route.summary.grade;
  element.setAttribute("aria-hidden", "true");
  const part = (className: string, text: string) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    element.append(span);
  };
  part("route-label-id", route.id);
  if (recommended) part("route-label-best", "Best");
  part(
    "route-label-stats",
    `${formatDuration(route.duration_s)} · ${formatMiles(route.distance_mi)}`,
  );
  part("route-label-grade", `${route.summary.grade} ${route.summary.safety_score}`);
  return element;
}

/** The part of a GeoJSON source we use (v6 doesn't export the class type). */
interface GeoJSONSourceLike {
  setData(data: GeoJSON): Promise<void>;
}

/** Imperative controls, so scrubbing the heatmap doesn't re-render React. */
export interface MapHandle {
  setHeatmapHour: (hour: number) => void;
}

export interface MapViewProps {
  ref?: Ref<MapHandle>;
  routes: PlannedRoute[];
  selectedId: string;
  /** Mile of the checkpoint whose popup is open. */
  activeMile: number | null;
  /** Mile of the checkpoint hovered in the table: its marker grows, no popup. */
  hoverMile: number | null;
  onSelectRoute: (id: string) => void;
  onActivateCheckpoint: (mile: number | null) => void;
  heatmap?: Heatmap;
  heatmapVisible?: boolean;
  /** Wind, rain and snow animated over the corridor (only while the heatmap shows). */
  weatherMotion?: boolean;
  /** Hour shown when the heatmap first appears; later changes go through the handle. */
  initialHour?: number;
  /** Pixels the page's panels cover at the map's top and bottom, so routes are framed clear of them. */
  fitInsets?: () => { top: number; bottom: number };
}

function supportsWebGL(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

export default function MapView({
  ref,
  routes,
  selectedId,
  activeMile,
  hoverMile,
  onSelectRoute,
  onActivateCheckpoint,
  heatmap,
  heatmapVisible = true,
  weatherMotion = false,
  initialHour = 0,
  fitInsets,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const field = useRef<RiskField | null>(null);
  const wind = useRef<WeatherFlow | null>(null);
  const [popupNode] = useState(() => document.createElement("div"));
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(() => !supportsWebGL());
  const selected = routes.find((route) => route.id === selectedId) ?? routes[0];
  const hour = useRef(initialHour);

  useImperativeHandle(ref, () => ({
    setHeatmapHour(next: number) {
      hour.current = next;
      field.current?.setHour(next);
      wind.current?.setHour(next);
      moveTruck(true);
    },
  }));

  // Handlers registered once on the map read the latest props through refs.
  const latest = useRef({ onSelectRoute, onActivateCheckpoint, selected, heatmap, fitInsets });
  useEffect(() => {
    latest.current = { onSelectRoute, onActivateCheckpoint, selected, heatmap, fitInsets };
  });

  function fitPadding() {
    const insets = latest.current.fitInsets?.() ?? { top: 0, bottom: 0 };
    return {
      top: FIT_PADDING + insets.top,
      bottom: FIT_PADDING + insets.bottom,
      left: FIT_PADDING,
      right: FIT_PADDING,
    };
  }

  const truck = useRef<{ marker: Marker; shownAt: number; frame: number } | null>(null);
  const labels = useRef(new Map<string, Marker>());

  /** The truck's time at the slider's hour: from the heatmap's start, else from departure. */
  function truckTime(): number {
    const { selected: route, heatmap: grid } = latest.current;
    const start = grid ? Date.parse(grid.start) : Date.parse(route.checkpoints[0].eta);
    return start + hour.current * 3_600_000;
  }

  /** Put the truck at the slider's hour; `glide` drives it there along the road instead. */
  function moveTruck(glide: boolean) {
    const current = truck.current;
    if (!current) return;
    cancelAnimationFrame(current.frame);
    const { selected: route } = latest.current;
    const target = truckTime();
    const place = (time: number) => {
      current.shownAt = time;
      current.marker.setLngLat(truckAt(route, time).lonLat);
    };
    if (!glide || prefersReducedMotion()) return place(target);
    const from = current.shownAt;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / TRUCK_GLIDE_MS);
      place(from + (target - from) * t);
      if (t < 1) current.frame = requestAnimationFrame(step);
    };
    current.frame = requestAnimationFrame(step);
  }

  // Create the map once.
  useEffect(() => {
    if (failed || !container.current) return;
    const instance = new MapLibreMap({
      container: container.current,
      style: BASEMAP_STYLE,
      bounds: boundsOf(routes),
      fitBoundsOptions: { padding: fitPadding() },
      // Touch screens: one finger scrolls the page, two move the map. A mouse wheel zooms.
      cooperativeGestures: matchMedia("(pointer: coarse)").matches,
      // Top-right, under the zoom buttons: the forecast timeline covers the bottom.
      attributionControl: false,
    });
    map.current = instance;
    instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
    instance.addControl(new AttributionControl({ compact: true }), "top-right");
    // The basemap style references a few POI icons it doesn't ship; draw them as nothing.
    instance.setMissingStyleImageResolver((id) => {
      if (!instance.hasImage(id)) {
        instance.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });

    instance.on("load", () => {
      // Compact attribution starts expanded and covers the map's corner on phones; the
      // ⓘ button still opens it, and the page footer lists every source.
      container.current
        ?.querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show");
      const { selected: route } = latest.current;
      instance.addSource(SOURCES.segments, { type: "geojson", data: riskSegments(routes) });
      instance.addSource(SOURCES.routes, { type: "geojson", data: routeLines(routes) });
      instance.addSource(SOURCES.checkpoints, { type: "geojson", data: checkpointPoints(route) });
      instance.addSource(SOURCES.otherCheckpoints, {
        type: "geojson",
        data: otherCheckpointPoints(routes, route.id),
      });
      instance.addSource(SOURCES.endpoints, { type: "geojson", data: endpoints(route) });
      for (const layer of routeLayers(route.id)) instance.addLayer(layer);
      // Under the routes, so they stay readable over any weather.
      field.current = new RiskField(instance, LAYERS.casing);
      // A DOM marker, so gliding it each frame costs nothing on the map's side.
      truck.current = {
        marker: new Marker({ element: truckElement() })
          .setLngLat(route.geometry[0])
          .addTo(instance),
        shownAt: 0,
        frame: 0,
      };
      wind.current = new WeatherFlow(instance);
      setLoaded(true);
    });
    let styleLoaded = false;
    instance.once("style.load", () => (styleLoaded = true));
    instance.on("error", (event) => {
      // Only a basemap that never loads leaves the map unusable; tile and style
      // hiccups after that are logged, and the map keeps working.
      if (!styleLoaded) setFailed(true);
      console.warn("Map error", event.error);
    });

    const pointer = () => (instance.getCanvas().style.cursor = "pointer");
    const reset = () => (instance.getCanvas().style.cursor = "");
    for (const layer of [LAYERS.checkpoints, LAYERS.hit]) {
      instance.on("mouseenter", layer, pointer);
      instance.on("mouseleave", layer, reset);
    }
    instance.on("click", LAYERS.checkpoints, (event) => {
      const mile = (event.features?.[0] as GeoJSONFeature | undefined)?.properties.mile as number;
      latest.current.onActivateCheckpoint(mile);
    });
    instance.on("click", LAYERS.hit, (event) => {
      // A checkpoint sits on top of its route; let that click win.
      if (instance.queryRenderedFeatures(event.point, { layers: [LAYERS.checkpoints] }).length)
        return;
      const routeId = event.features?.[0]?.properties.routeId as string | undefined;
      if (routeId) latest.current.onSelectRoute(routeId);
    });

    return () => {
      if (truck.current) cancelAnimationFrame(truck.current.frame);
      truck.current = null;
      wind.current?.destroy();
      wind.current = null;
      field.current = null;
      instance.remove();
      map.current = null;
    };
    // Created once; later data arrives through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  // A new plan: new routes, reframed.
  useEffect(() => {
    const instance = map.current;
    if (!loaded || !instance) return;
    void source(instance, SOURCES.segments)?.setData(riskSegments(routes));
    void source(instance, SOURCES.routes)?.setData(routeLines(routes));
    instance.fitBounds(new LngLatBounds(...boundsOf(routes)), {
      padding: fitPadding(),
      duration: 600,
    });
  }, [loaded, routes]);

  // Selection: the chosen route's checkpoints and endpoints; it draws wider and on top.
  useEffect(() => {
    const instance = map.current;
    if (!loaded || !instance) return;
    void source(instance, SOURCES.checkpoints)?.setData(checkpointPoints(selected));
    void source(instance, SOURCES.endpoints)?.setData(endpoints(selected));
    void source(instance, SOURCES.otherCheckpoints)?.setData(
      otherCheckpointPoints(routes, selected.id),
    );
    for (const [id, marker] of labels.current) {
      marker.getElement().classList.toggle("route-label-selected", id === selected.id);
    }
    const { casing, risk } = selectionPaint(selected.id);
    instance.setPaintProperty(LAYERS.casing, "line-width", casing["line-width"]);
    instance.setPaintProperty(LAYERS.casing, "line-opacity", casing["line-opacity"]);
    instance.setPaintProperty(LAYERS.risk, "line-width", risk["line-width"]);
    instance.setPaintProperty(LAYERS.risk, "line-opacity", risk["line-opacity"]);
    for (const layer of [LAYERS.casing, LAYERS.risk]) {
      instance.setLayoutProperty(layer, "line-sort-key", sortKey(selected.id));
    }
    // `routes` changes only with `selected` (a new plan selects anew), so it needn't be listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selected]);

  // A summary label per route, placed where it doesn't share road with the others.
  useEffect(() => {
    const instance = map.current;
    if (!loaded || !instance) return;
    const placed = labels.current;
    for (const route of routes) {
      const element = routeLabelElement(route, route.id === routes[0].id);
      element.classList.toggle("route-label-selected", route.id === latest.current.selected.id);
      element.addEventListener("click", () => latest.current.onSelectRoute(route.id));
      const others = routes.filter((other) => other.id !== route.id);
      placed.set(
        route.id,
        new Marker({ element, anchor: "bottom", offset: [0, -8] })
          .setLngLat(labelPoint(route, others))
          .addTo(instance),
      );
    }
    return () => {
      for (const marker of placed.values()) marker.remove();
      placed.clear();
    };
  }, [loaded, routes]);

  // Heatmap data arrives after the plan; it's loaded once, then each hour only redraws.
  useEffect(() => {
    if (!loaded || !heatmap) return;
    // Weather drawing is extra: if it fails, keep the routes, the map and the page working.
    try {
      field.current?.setHour(hour.current);
      field.current?.setHeatmap(heatmap);
      wind.current?.setHour(hour.current);
      wind.current?.setHeatmap(heatmap);
    } catch (error) {
      console.warn("Weather layer failed", error);
    }
  }, [loaded, heatmap]);

  useEffect(() => {
    if (loaded) moveTruck(false);
    // moveTruck reads the latest props through refs, so a new render's copy changes nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, heatmap, selected]);

  useEffect(() => {
    if (!loaded) return;
    field.current?.setVisible(heatmapVisible);
    wind.current?.setEnabled(weatherMotion && heatmapVisible && Boolean(heatmap));
  }, [loaded, weatherMotion, heatmapVisible, heatmap]);

  // Hovered or active checkpoint: enlarged marker.
  useEffect(() => {
    const instance = map.current;
    if (!loaded || !instance) return;
    instance.removeFeatureState({ source: SOURCES.checkpoints });
    const index = checkpointIndex(selected, hoverMile ?? activeMile);
    if (index >= 0)
      instance.setFeatureState({ source: SOURCES.checkpoints, id: index }, { active: true });
  }, [loaded, selected, hoverMile, activeMile]);

  // Active checkpoint: a popup, rendered by React into `popupNode`.
  useEffect(() => {
    const instance = map.current;
    if (!loaded || !instance) return;
    const checkpoint = selected.checkpoints[checkpointIndex(selected, activeMile)];
    if (!checkpoint) return;
    const opened = new Popup({ closeButton: true, maxWidth: "280px", offset: 12 })
      .setLngLat([checkpoint.lon, checkpoint.lat])
      .setDOMContent(popupNode)
      .addTo(instance);
    let closedByUs = false;
    opened.on("close", () => {
      if (!closedByUs) latest.current.onActivateCheckpoint(null);
    });
    return () => {
      closedByUs = true;
      opened.remove();
    };
  }, [loaded, selected, activeMile, popupNode]);

  const activeCheckpoint = selected.checkpoints[checkpointIndex(selected, activeMile)];

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center rounded-card border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
        The map couldn't load in this browser. The routes and checkpoint table show the same
        information.
      </div>
    );
  }

  return (
    <>
      <div
        ref={container}
        role="region"
        aria-label={`Map of ${routes.length} routes; route ${selected.id} highlighted. The checkpoint table below has the same data.`}
        className="h-full w-full overflow-hidden rounded-card border border-border"
      />
      {activeCheckpoint &&
        createPortal(
          <CheckpointPopup routeId={selected.id} checkpoint={activeCheckpoint} />,
          popupNode,
        )}
    </>
  );
}

function source(instance: MapLibreMap, id: string): GeoJSONSourceLike | undefined {
  return instance.getSource(id) as GeoJSONSourceLike | undefined;
}
