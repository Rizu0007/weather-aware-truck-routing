import "maplibre-gl/dist/maplibre-gl.css";
import "@/components/features/map/map-view.css";

import {
  LngLatBounds,
  Map as MapLibreMap,
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
  heatmapCells,
  riskSegments,
  routeLines,
} from "@/components/features/map/map-data";
import {
  BASEMAP_STYLE,
  heatmapLayer,
  heatmapPaint,
  LAYERS,
  routeLayers,
  selectionPaint,
  sortKey,
  SOURCES,
} from "@/components/features/map/map-style";
import type { Heatmap, PlannedRoute } from "@/types/api";

// Vite needs the worker's URL spelled out (MapLibre docs, "Vite").
setWorkerUrl(workerUrl);

const FIT_PADDING = 48;

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
  /** Hour shown when the heatmap first appears; later changes go through the handle. */
  initialHour?: number;
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
  initialHour = 0,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [popupNode] = useState(() => document.createElement("div"));
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(() => !supportsWebGL());
  const selected = routes.find((route) => route.id === selectedId) ?? routes[0];
  const hour = useRef(initialHour);

  useImperativeHandle(ref, () => ({
    setHeatmapHour(next: number) {
      hour.current = next;
      const instance = map.current;
      if (!instance?.getLayer(LAYERS.heatmap)) return;
      const paint = heatmapPaint(next);
      instance.setPaintProperty(LAYERS.heatmap, "fill-color", paint["fill-color"]);
      instance.setPaintProperty(LAYERS.heatmap, "fill-opacity", paint["fill-opacity"]);
    },
  }));

  // Handlers registered once on the map read the latest props through refs.
  const latest = useRef({ onSelectRoute, onActivateCheckpoint, selected });
  useEffect(() => {
    latest.current = { onSelectRoute, onActivateCheckpoint, selected };
  });

  // Create the map once.
  useEffect(() => {
    if (failed || !container.current) return;
    const instance = new MapLibreMap({
      container: container.current,
      style: BASEMAP_STYLE,
      bounds: boundsOf(routes),
      fitBoundsOptions: { padding: FIT_PADDING },
      // On touch screens one finger scrolls the page, two move the map. A mouse wheel zooms:
      // making desktop users hold ⌘ felt like the map was broken.
      cooperativeGestures: matchMedia("(pointer: coarse)").matches,
      attributionControl: { compact: true },
    });
    map.current = instance;
    instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
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
      instance.addSource(SOURCES.heatmap, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      instance.addLayer(heatmapLayer(hour.current));
      instance.addSource(SOURCES.segments, { type: "geojson", data: riskSegments(routes) });
      instance.addSource(SOURCES.routes, { type: "geojson", data: routeLines(routes) });
      instance.addSource(SOURCES.checkpoints, { type: "geojson", data: checkpointPoints(route) });
      instance.addSource(SOURCES.endpoints, { type: "geojson", data: endpoints(route) });
      for (const layer of routeLayers(route.id)) instance.addLayer(layer);
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
      padding: FIT_PADDING,
      duration: 600,
    });
  }, [loaded, routes]);

  // Selection: the chosen route's checkpoints and endpoints; it draws wider and on top.
  useEffect(() => {
    const instance = map.current;
    if (!loaded || !instance) return;
    void source(instance, SOURCES.checkpoints)?.setData(checkpointPoints(selected));
    void source(instance, SOURCES.endpoints)?.setData(endpoints(selected));
    const { casing, risk } = selectionPaint(selected.id);
    instance.setPaintProperty(LAYERS.casing, "line-width", casing["line-width"]);
    instance.setPaintProperty(LAYERS.casing, "line-opacity", casing["line-opacity"]);
    instance.setPaintProperty(LAYERS.risk, "line-width", risk["line-width"]);
    instance.setPaintProperty(LAYERS.risk, "line-opacity", risk["line-opacity"]);
    for (const layer of [LAYERS.casing, LAYERS.risk]) {
      instance.setLayoutProperty(layer, "line-sort-key", sortKey(selected.id));
    }
  }, [loaded, selected]);

  // Heatmap data arrives after the plan; it's loaded once and restyled per hour.
  useEffect(() => {
    const instance = map.current;
    if (!loaded || !instance || !heatmap) return;
    void source(instance, SOURCES.heatmap)?.setData(heatmapCells(heatmap));
  }, [loaded, heatmap]);

  useEffect(() => {
    const instance = map.current;
    if (!loaded || !instance) return;
    instance.setLayoutProperty(LAYERS.heatmap, "visibility", heatmapVisible ? "visible" : "none");
  }, [loaded, heatmapVisible]);

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
