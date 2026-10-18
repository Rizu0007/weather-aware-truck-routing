import { ApiError } from "@/api/client";
import { TripForm } from "@/components/features/trip-form/trip-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { useTripParams } from "@/hooks/use-trip-params";
import { useTripPlan } from "@/hooks/use-trip-plan";
import { nextFullHour } from "@/utils/format";
import type { TripParams } from "@/utils/trip-params";
import { serverFieldErrors } from "@/utils/validate-trip";

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
  const { trip, invalidLink, setTrip } = useTripParams();
  const plan = useTripPlan(trip);
  const error = plan.error instanceof ApiError ? plan.error : null;
  const fieldErrors = error?.kind === "validation" ? serverFieldErrors(error.fieldErrors) : {};

  return (
    <div className="mx-auto grid w-full max-w-screen-2xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[400px_1fr]">
      <title>Weather-Aware Truck Routing</title>
      <aside aria-labelledby="trip-heading" className="flex flex-col gap-4">
        <h1 id="trip-heading" className="text-xl font-semibold tracking-tight">
          Plan a trip
        </h1>
        {invalidLink && (
          <Alert variant="warning" title="This link is incomplete">
            Some trip details in the address couldn't be read. Fill in the form to plan again.
          </Alert>
        )}
        <TripForm
          // Remount when the URL's trip changes (e.g. Back), so the fields show it.
          key={trip ? JSON.stringify(trip) : "new"}
          initialTrip={trip}
          onSubmit={setTrip}
          serverErrors={fieldErrors}
          submitting={plan.isFetching}
          submitDisabled={backend !== "ready"}
        />
      </aside>

      <section aria-labelledby="results-heading" aria-busy={plan.isFetching} className="min-w-0">
        <h2 id="results-heading" className="sr-only">
          Results
        </h2>
        {!trip && (
          <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border p-6">
            <p className="text-muted-foreground">
              Choose two places, a departure time and the load to compare up to three routes by
              forecast weather risk and travel time.
            </p>
            <Button variant="secondary" onClick={() => setTrip(exampleTrip())}>
              Try Dallas → Houston
            </Button>
          </div>
        )}
        {trip && plan.isFetching && (
          <p role="status" className="text-muted-foreground">
            Finding routes and checking the forecast along each one…
          </p>
        )}
        {trip && error && error.kind !== "validation" && (
          <Alert variant="error" title={error.message} />
        )}
        {plan.data && !plan.isFetching && (
          <p role="status">
            Recommended: route {plan.data.recommended_route_id}. {plan.data.recommendation.reason}
          </p>
        )}
      </section>
    </div>
  );
}
