import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/client";
import type { MapHandle } from "@/components/features/map/map-view";
import { HeatmapControls } from "@/components/features/heatmap/heatmap-controls";
import { HeatmapLegend } from "@/components/features/heatmap/heatmap-legend";
import { CheckpointTable } from "@/components/features/results/checkpoint-table";
import { DepartureAdvice } from "@/components/features/results/departure-advice";
import { PlanError } from "@/components/features/results/plan-error";
import { PlanSkeleton } from "@/components/features/results/plan-skeleton";
import { PlanWarnings } from "@/components/features/results/plan-warnings";
import { Recommendation } from "@/components/features/results/recommendation";
import { RiskInfoPanel } from "@/components/features/results/risk-info-panel";
import { RiskProfile } from "@/components/features/results/risk-profile";
import { RouteCardList } from "@/components/features/results/route-card-list";
import { TripBriefing } from "@/components/features/results/trip-briefing";
import { TripForm } from "@/components/features/trip-form/trip-form";
import { TripSummary } from "@/components/features/trip-form/trip-summary";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { useCheckpointSelection } from "@/hooks/use-checkpoint-selection";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { useTripParams } from "@/hooks/use-trip-params";
import { useHeatmap, useTripPlan } from "@/hooks/use-trip-plan";
import { nextFullHour } from "@/utils/format";
import { prefersReducedMotion } from "@/utils/motion";
import type { TripParams } from "@/utils/trip-params";
import { serverFieldErrors } from "@/utils/validate-trip";

const SLOW_PLAN_MS = 10_000;

const HOW_IT_WORKS = [
  ["Enter the trip", "Two places, when you leave, and the load."],
  [
    "We check every route",
    "Up to three routes, with the forecast at each checkpoint for when the truck gets there.",
  ],
  [
    "Pick the safest",
    "Compare risk on the map, play the next 48 hours of weather, take the recommended route.",
  ],
] as const;

// MapLibre is the largest dependency: load it after the form, in its own chunk.
const loadMap = () => import("@/components/features/map/map-view");
const MapView = lazy(loadMap);
const BasemapPreview = lazy(() => loadMap().then((module) => ({ default: module.BasemapPreview })));

function exampleTrip(): TripParams {
  return {
    origin: { label: "Dallas, Texas", lat: 32.7767, lon: -96.797 },
    destination: { label: "Houston, Texas", lat: 29.7604, lon: -95.3698 },
    departure: nextFullHour().toISOString(),
    loadLb: 35_000,
    intervalMi: 10,
  };
}

export function PlannerPage() {
  const backend = useBackendHealth();
  const { trip, invalidLink, routeId, hour, setTrip, setRouteId, setHour } = useTripParams();
  const plan = useTripPlan(trip);
  const slowPlan = useDelayedFlag(plan.isFetching, SLOW_PLAN_MS);
  const [editing, setEditing] = useState(trip === null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const focusResults = useRef(false);

  const error = plan.error instanceof ApiError ? plan.error : null;
  const fieldErrors = error?.kind === "validation" ? serverFieldErrors(error.fieldErrors) : {};
  const showForm = !trip || editing || error?.kind === "validation";
  const data = plan.isFetching ? undefined : plan.data;
  const selected = data?.routes.find((route) => route.id === routeId) ?? data?.routes[0];
  const heatmap = useHeatmap(data);
  const mapHandle = useRef<MapHandle>(null);
  const legendPanel = useRef<HTMLDivElement>(null);
  const [heatmapVisible, setHeatmapVisible] = useState(true);
  // Off by default for users who asked their system for less motion.
  const [weatherMotion, setWeatherMotion] = useState(() => !prefersReducedMotion());
  const legendMotion = weatherMotion && heatmapVisible && Boolean(heatmap.data);
  const checkpoint = useCheckpointSelection(`${plan.dataUpdatedAt}:${selected?.id}`);

  // Fetch the map code while the user fills in the form.
  useEffect(() => {
    if (backend === "ready") void loadMap();
  }, [backend]);

  // A plan that failed because the server was asleep is tried again once it wakes up.
  const backendWasDown = useRef(false);
  useEffect(() => {
    if (backend !== "ready") {
      backendWasDown.current = true;
      return;
    }
    if (!backendWasDown.current) return;
    backendWasDown.current = false;
    if (error && ["server", "network", "timeout"].includes(error.kind)) void plan.refetch();
  }, [backend, error, plan]);

  function planTrip(next: TripParams) {
    focusResults.current = true;
    setEditing(false);
    setTrip(next);
  }

  function planWithDeparture(departure: string) {
    if (trip) planTrip({ ...trip, departure });
  }

  // The submit button disappears with the form, so focus falls to the page; give it to
  // the results instead. Never take it from a field the user has moved on to.
  useEffect(() => {
    if (plan.isSuccess && focusResults.current) {
      focusResults.current = false;
      const focusLost = !document.activeElement || document.activeElement === document.body;
      if (focusLost) resultsHeading.current?.focus();
    }
  }, [plan.isSuccess, plan.dataUpdatedAt]);

  return (
    <div className="mx-auto grid w-full max-w-screen-2xl flex-1 items-start gap-6 px-4 py-6 lg:grid-cols-[360px_1fr]">
      <title>Weather-Aware Truck Routing</title>

      <aside aria-label="Trip and routes" className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Plan a trip</h1>
        {invalidLink && (
          <Alert variant="warning" title="This link is incomplete">
            Some trip details in the address couldn't be read. Fill in the form to plan again.
          </Alert>
        )}
        {showForm ? (
          <TripForm
            // Remount when the URL's trip changes (e.g. Back), so the fields show it.
            key={trip ? JSON.stringify(trip) : "new"}
            initialTrip={trip}
            onSubmit={planTrip}
            serverErrors={fieldErrors}
            submitting={plan.isFetching}
            submitDisabled={backend !== "ready"}
            onCancel={trip && editing ? () => setEditing(false) : undefined}
          />
        ) : (
          <TripSummary
            trip={trip}
            onEdit={() => {
              focusResults.current = false;
              setEditing(true);
            }}
          />
        )}

        <section
          aria-labelledby="results-heading"
          aria-busy={plan.isFetching}
          className="flex flex-col gap-4"
        >
          <h2 id="results-heading" ref={resultsHeading} tabIndex={-1} className="sr-only">
            Results
          </h2>
          <p
            role="status"
            className={plan.isFetching ? "text-sm text-muted-foreground" : "sr-only"}
          >
            {plan.isFetching &&
              (slowPlan
                ? "Still working: the free routing and weather servers are slow right now…"
                : "Finding routes and checking the forecast along each one…")}
            {data &&
              `${data.routes.length} route${data.routes.length === 1 ? "" : "s"} found. ` +
                `Recommended: route ${data.recommended_route_id}.`}
          </p>
          {plan.isFetching && <PlanSkeleton />}
          {!plan.isFetching && error && (
            <PlanError
              error={error}
              errorAt={plan.errorUpdatedAt}
              onRetry={() => void plan.refetch()}
              onUseDeparture={planWithDeparture}
            />
          )}
          {data && selected && (
            <>
              <Recommendation plan={data} />
              <DepartureAdvice plan={data} onUseDeparture={planWithDeparture} />
              <PlanWarnings warnings={data.warnings} />
              <RouteCardList
                routes={data.routes}
                recommendedId={data.recommended_route_id}
                selectedId={selected.id}
                onSelect={setRouteId}
              />
              {trip && (
                <TripBriefing
                  route={selected}
                  from={trip.origin.label}
                  to={trip.destination.label}
                  activeMile={checkpoint.activeMile}
                  onActivate={checkpoint.activate}
                />
              )}
            </>
          )}
        </section>
        <RiskInfoPanel />
      </aside>

      {/* Large screens: the map column stays in view while the left side scrolls, so table,
          strip and timeline always show their effect on the map. */}
      <div className="flex min-w-0 flex-col gap-4">
        {!trip && (
          <section
            aria-labelledby="how-heading"
            className="relative flex min-h-80 flex-col justify-end overflow-hidden rounded-card border border-border bg-surface lg:h-[68vh]"
          >
            {/* The product's own map, so the first screen already looks like it. */}
            <div className="absolute inset-0">
              <Suspense fallback={null}>
                <BasemapPreview />
              </Suspense>
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-linear-to-t from-background via-background/70 to-background/0"
            />
            <div className="relative flex flex-col items-start gap-4 p-6">
              <h2 id="how-heading" className="text-base font-semibold">
                How it works
              </h2>
              <ol className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                {HOW_IT_WORKS.map(([title, text], index) => (
                  <li key={title} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                      {index + 1}
                    </span>
                    <span>
                      <span className="block font-medium text-foreground">{title}</span>
                      {text}
                    </span>
                  </li>
                ))}
              </ol>
              <Button variant="secondary" onClick={() => planTrip(exampleTrip())}>
                Try Dallas → Houston
              </Button>
            </div>
          </section>
        )}
        {trip && plan.isFetching && (
          <Skeleton className="h-[60svh] min-h-80 rounded-card lg:h-[68vh] lg:min-h-[28rem]" />
        )}
        {data && selected && (
          <section aria-label="Map" className="flex flex-col gap-4">
            {/* The main feature: as large as fits with the timeline still in view below it. */}
            <div className="relative h-[60svh] min-h-80 lg:h-[68vh] lg:min-h-[28rem]">
              <Suspense
                fallback={
                  <Skeleton className="flex h-full items-center justify-center rounded-card text-sm text-muted-foreground" />
                }
              >
                <MapView
                  ref={mapHandle}
                  heatmap={heatmap.data}
                  heatmapVisible={heatmapVisible}
                  weatherMotion={weatherMotion}
                  initialHour={hour}
                  routes={data.routes}
                  selectedId={selected.id}
                  activeMile={checkpoint.activeMile}
                  hoverMile={checkpoint.hoverMile}
                  onSelectRoute={setRouteId}
                  onActivateCheckpoint={checkpoint.activate}
                  fitInsets={() => ({ top: legendPanel.current?.offsetHeight ?? 0, bottom: 0 })}
                />
              </Suspense>
              {/* On the map only where it's wide enough; on phones it would cover popups. */}
              <div
                ref={legendPanel}
                className="absolute top-3 left-3 z-10 hidden max-w-[calc(100%-5rem)] rounded-card border border-border bg-map-panel px-3 py-2 shadow-card lg:block"
              >
                <HeatmapLegend motion={legendMotion} />
              </div>
            </div>
            <HeatmapLegend motion={legendMotion} className="-mt-2 lg:hidden" />
            <HeatmapControls
              // A new plan starts from its own hour (from the URL, else 0).
              key={plan.dataUpdatedAt}
              heatmap={heatmap.data}
              loading={heatmap.isFetching}
              error={heatmap.error}
              onRetry={() => void heatmap.refetch()}
              visible={heatmapVisible}
              onVisibleChange={setHeatmapVisible}
              route={selected}
              motion={weatherMotion}
              onMotionChange={setWeatherMotion}
              initialHour={hour}
              onHourChange={(next) => mapHandle.current?.setHeatmapHour(next)}
              onHourCommit={setHour}
            />
          </section>
        )}
        {data && selected && (
          <section aria-labelledby="checkpoints-heading" className="flex flex-col gap-3">
            <h2 id="checkpoints-heading" className="text-base font-semibold">
              Checkpoints on route {selected.id}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                weather at the truck's arrival time
              </span>
            </h2>
            <RiskProfile
              route={selected}
              activeMile={checkpoint.activeMile}
              onHover={checkpoint.hover}
              onActivate={checkpoint.activate}
            />
            <CheckpointTable
              route={selected}
              activeMile={checkpoint.activeMile}
              onActivate={checkpoint.activate}
              onHover={checkpoint.hover}
            />
          </section>
        )}
      </div>
    </div>
  );
}
