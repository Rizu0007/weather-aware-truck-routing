import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { TripPlan } from "@/types/api";
import { formatDateTime } from "@/utils/format";

interface DepartureAdviceProps {
  plan: TripPlan;
  onUseDeparture: (iso: string) => void;
}

/** Suggests waiting when a departure in the next 24 h has fewer High-or-worse miles. */
export function DepartureAdvice({ plan, onUseDeparture }: DepartureAdviceProps) {
  const advice = plan.departure_advice;
  if (!advice) return null;
  const hoursLater = Math.round(
    (Date.parse(advice.departure) - Date.parse(plan.departure)) / 3_600_000,
  );
  return (
    <Alert
      variant="info"
      title={`Safer to leave ${hoursLater} h later`}
      action={
        <Button size="sm" variant="outline" onClick={() => onUseDeparture(advice.departure)}>
          Leave {formatDateTime(advice.departure)} instead
        </Button>
      }
    >
      On route {advice.route_id}. {advice.reason}
    </Alert>
  );
}
