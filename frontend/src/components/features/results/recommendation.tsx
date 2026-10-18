import { ShieldCheck } from "lucide-react";

import type { TripPlan } from "@/types/api";

export function Recommendation({ plan }: { plan: TripPlan }) {
  const best = plan.routes.find((route) => route.id === plan.recommended_route_id);
  return (
    <div className="flex gap-3 rounded-card border border-primary/40 bg-secondary p-4">
      <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-secondary-foreground">
          Take route {plan.recommended_route_id}
          {best?.via_town && <span className="font-normal"> via {best.via_town}</span>}
        </p>
        <p className="text-sm text-foreground/90">{plan.recommendation.reason}</p>
      </div>
    </div>
  );
}
