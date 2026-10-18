import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api/client";
import type { MapHandle } from "@/components/features/map/map-view";
import { HeatmapControls } from "@/components/features/heatmap/heatmap-controls";
import { CheckpointTable } from "@/components/features/results/checkpoint-table";
import { PlanError } from "@/components/features/results/plan-error";
import { PlanSkeleton } from "@/components/features/results/plan-skeleton";
import { PlanWarnings } from "@/components/features/results/plan-warnings";
import { Recommendation } from "@/components/features/results/recommendation";
import { RiskInfoPanel } from "@/components/features/results/risk-info-panel";
import { RiskProfile } from "@/components/features/results/risk-profile";
import { RouteCardList } from "@/components/features/results/route-card-list";
import { TripForm } from "@/components/features/trip-form/trip-form";
import { TripSummary } from "@/components/features/trip-form/trip-summary";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { useTripParams } from "@/hooks/use-trip-params";
import { useHeatmap, useTripPlan } from "@/hooks/use-trip-plan";
import { nextFullHour } from "@/utils/format";
import type { TripParams } from "@/utils/trip-params";
import { serverFieldErrors } from "@/utils/validate-trip";

const SLOW_PLAN_MS = 10_000;

// MapLibre is the largest dependency: load it after the form, in its own chunk.
const loadMap = () => import("@/components/features/map/map-view");
const MapView = lazy(loadMap);

/** A checkpoint mile that only applies to the plan and route it was chosen on. */
type ScopedMile = { scope: string; mile: number } | null;

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
  const [heatmapVisible, setHeatmapVisible] = useState(true);
  const scope = `${plan.dataUpdatedAt}:${selected?.id}`;
  const [active, setActive] = useState<ScopedMile>(null);
  const [hover, setHover] = useState<ScopedMile>(null);
  const activeMile = active?.scope === scope ? active.mile : null;
  const hoverMile = hover?.scope === scope ? hover.mile : null;

  // Fetch the map code while the user fills in the form.
  useEffect(() => {
    if (backend === "ready") void loadMap();
  }, [backend]);

  function planTrip(next: TripParams) {
    focusResults.current = true;
    setEditing(false);
    setTrip(next);
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
    <div className="mx-auto grid w-full max-w-screen-2xl flex-1 items-start gap-6 px-4 py-6 lg:grid-cols-[400px_1fr]">
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
              `${data.routes.length} routes found. Recommended: route ${data.recommended_route_id}.`}
          </p>
          {plan.isFetching && <PlanSkeleton />}
          {!plan.isFetching && error && (
            <PlanError
              error={error}
              errorAt={plan.errorUpdatedAt}
              onRetry={() => void plan.refetch()}
              onUseDeparture={(departure) => trip && planTrip({ ...trip, departure })}
            />
          )}
          {data && selected && (
            <>
              <Recommendation plan={data} />
              <PlanWarnings warnings={data.warnings} />
              <RouteCardList
                routes={data.routes}
                recommendedId={data.recommended_route_id}
                selectedId={selected.id}
                onSelect={setRouteId}
              />
            </>
          )}
        </section>
        <RiskInfoPanel />
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        {!trip && (
          <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border p-6">
            <p className="text-muted-foreground">
              Choose two places, a departure time and the load to compare up to three routes by
              forecast weather risk and travel time.
            </p>
            <Button variant="secondary" onClick={() => planTrip(exampleTrip())}>
              Try Dallas → Houston
            </Button>
          </div>
        )}
        {data && selected && (
          <section aria-label="Map" className="h-[55svh] min-h-80 lg:h-[60vh]">
            <Suspense
              fallback={
                <Skeleton className="flex h-full items-center justify-center rounded-card text-sm text-muted-foreground" />
              }
            >
              <MapView
                ref={mapHandle}
                heatmap={heatmap.data}
                heatmapVisible={heatmapVisible}
                initialHour={hour}
                routes={data.routes}
                selectedId={selected.id}
                activeMile={activeMile}
                hoverMile={hoverMile}
                onSelectRoute={setRouteId}
                onActivateCheckpoint={(mile) => setActive(mile === null ? null : { scope, mile })}
              />
            </Suspense>
          </section>
        )}
        {data && (
          <HeatmapControls
            // A new plan starts from its own hour (from the URL, else 0).
            key={plan.dataUpdatedAt}
            heatmap={heatmap.data}
            loading={heatmap.isFetching}
            error={heatmap.error}
            onRetry={() => void heatmap.refetch()}
            visible={heatmapVisible}
            onVisibleChange={setHeatmapVisible}
            initialHour={hour}
            onHourChange={(next) => mapHandle.current?.setHeatmapHour(next)}
            onHourCommit={setHour}
          />
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
              activeMile={activeMile}
              onHover={(mile) => setHover(mile === null ? null : { scope, mile })}
              onActivate={(mile) => setActive({ scope, mile })}
            />
            <CheckpointTable
              route={selected}
              activeMile={activeMile}
              onActivate={(mile) => setActive({ scope, mile })}
              onHover={(mile) => setHover(mile === null ? null : { scope, mile })}
            />
          </section>
        )}
      </div>
    </div>
  );
}
