import { ShieldCheck } from "lucide-react";

import { RISK_LEVELS } from "@/constants/risk";
import type { TripPlan } from "@/types/api";
import { formatClock } from "@/utils/format";

export function Recommendation({ plan }: { plan: TripPlan }) {
  const best = plan.routes.find((route) => route.id === plan.recommended_route_id);
  const avoided = best && avoidedWeather(plan, RISK_LEVELS.indexOf(best.summary.max_level));
  return (
    <div className="flex gap-3 rounded-card border border-primary/40 bg-secondary p-4">
      <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-secondary-foreground">
          Take route {plan.recommended_route_id}
          {best?.via_town && <span className="font-normal"> via {best.via_town}</span>}
        </p>
        <p className="text-sm text-foreground/90">{plan.recommendation.reason}</p>
        {avoided && <p className="text-sm text-foreground/90">{avoided}</p>}
      </div>
    </div>
  );
}

/** The worst weather on another route that the recommended one stays clear of, in words. */
function avoidedWeather(plan: TripPlan, bestScore: number): string | null {
  let worst = null;
  for (const route of plan.routes) {
    for (const checkpoint of route.checkpoints) {
      const score = RISK_LEVELS.indexOf(checkpoint.level);
      if (score > bestScore && (!worst || score > worst.score))
        worst = { route, checkpoint, score };
    }
  }
  if (!worst) return null;
  const { route, checkpoint } = worst;
  const what = checkpoint.reasons.join(" and ").toLowerCase();
  return `Avoids ${what} on route ${route.id} at mile ${Math.round(checkpoint.mile)}, ${formatClock(checkpoint.eta)}.`;
}
