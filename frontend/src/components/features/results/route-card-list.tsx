import type { ReactNode } from "react";

import { RiskStrip } from "@/components/features/results/risk-strip";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { PlannedRoute, SafetyGrade } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDateTime, formatDuration, formatMiles } from "@/utils/format";

const GRADE_BADGE: Record<SafetyGrade, BadgeVariant> = {
  A: "low",
  B: "moderate",
  C: "high",
  D: "severe",
  F: "no_travel",
};

interface RouteCardListProps {
  routes: PlannedRoute[];
  recommendedId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}

/** Native radios styled as cards: arrow keys and screen readers work without extra code. */
export function RouteCardList({ routes, recommendedId, selectedId, onSelect }: RouteCardListProps) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold">Routes, best first</legend>
      {routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          recommended={route.id === recommendedId}
          selected={route.id === selectedId}
          onSelect={() => onSelect(route.id)}
        />
      ))}
    </fieldset>
  );
}

interface RouteCardProps {
  route: PlannedRoute;
  recommended: boolean;
  selected: boolean;
  onSelect: () => void;
}

function RouteCard({ route, recommended, selected, onSelect }: RouteCardProps) {
  const { summary } = route;
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-3 rounded-card border bg-surface p-4 shadow-card transition-colors",
        "has-focus-visible:ring-2 has-focus-visible:ring-ring/40",
        selected ? "border-primary" : "border-border hover:border-muted-foreground",
      )}
    >
      <input
        type="radio"
        name="route"
        value={route.id}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Route {route.id}</span>
        {route.via_town && <Badge variant="outline">via {route.via_town}</Badge>}
        {recommended && <Badge variant="primary">Recommended</Badge>}
      </span>
      <span className="grid grid-cols-2 gap-2 text-sm tabular-nums sm:grid-cols-4">
        <Stat label="Distance" value={formatMiles(route.distance_mi)} />
        <Stat label="Drive time" value={formatDuration(route.duration_s)} />
        <Stat label="Avg risk" value={`${summary.avg_risk.toFixed(2)} / 4`} />
        <Stat
          label="Safety"
          value={
            <Badge variant={GRADE_BADGE[summary.grade]}>
              <span aria-hidden="true">
                {summary.grade} · {summary.safety_score}
              </span>
              <span className="sr-only">
                grade {summary.grade}, score {summary.safety_score} of 100
              </span>
            </Badge>
          }
        />
      </span>
      <span className="text-xs text-muted-foreground">Arrives {formatDateTime(route.arrival)}</span>
      <RiskStrip summary={summary} />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
