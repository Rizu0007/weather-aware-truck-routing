import type { ApiError } from "@/api/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRetryCountdown } from "@/hooks/use-retry-countdown";
import { formatDateTime } from "@/utils/format";

interface PlanErrorProps {
  error: ApiError;
  /** When the error arrived, so a "busy" countdown restarts per error. */
  errorAt: number;
  onRetry: () => void;
  onUseDeparture: (iso: string) => void;
}

/** What went wrong with a plan, and the one action that helps. Field errors show on the form. */
export function PlanError({ error, errorAt, onRetry, onUseDeparture }: PlanErrorProps) {
  const secondsLeft = useRetryCountdown(
    error.kind === "busy" ? error.retryAfterS : undefined,
    errorAt,
  );

  switch (error.kind) {
    case "validation":
      return null;
    case "no_route":
      return (
        <Alert variant="error" title="No road route between these places">
          {error.message} Check both places, or pick ones on the same landmass.
        </Alert>
      );
    case "beyond_forecast": {
      const latest = error.latestDeparture;
      return (
        <Alert
          variant="warning"
          title="Departure is beyond the weather forecast"
          action={
            latest && (
              <Button size="sm" variant="outline" onClick={() => onUseDeparture(latest)}>
                Leave {formatDateTime(latest)} instead
              </Button>
            )
          }
        >
          {error.message}
        </Alert>
      );
    }
    case "busy":
      if (error.resetsAt) {
        return (
          <Alert variant="warning" title="The free weather service's limit is used up">
            {error.message} That's {formatDateTime(error.resetsAt)} for you.
          </Alert>
        );
      }
      // 429 is this app's own per-user limit; 503 is a provider's, shared by everyone.
      return (
        <Alert
          variant="warning"
          title={
            error.status === 429
              ? "Too many trip plans in the last minute"
              : "The weather or routing service is busy"
          }
          action={
            <Button size="sm" variant="outline" onClick={onRetry} disabled={secondsLeft > 0}>
              {secondsLeft > 0 ? `Retry in ${secondsLeft} s` : "Retry"}
            </Button>
          }
        >
          {error.status === 429
            ? "Each person can plan a limited number of trips a minute, to keep the free weather service working for everyone."
            : "Free data services limit how many requests everyone can make per minute."}
        </Alert>
      );
    default:
      return (
        <Alert
          variant="error"
          title={error.message}
          action={
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          }
        />
      );
  }
}
