import { Check } from "lucide-react";

import { RiskStrip } from "@/components/features/results/risk-strip";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { PlannedRoute, SafetyGrade } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatClock, formatDuration, formatMiles } from "@/utils/format";

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
  const recommended = routes.find((route) => route.id === recommendedId) ?? routes[0];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold">Routes, best first</legend>
      {routes.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          recommended={route.id === recommended.id}
          slowerBy={route.duration_s - recommended.duration_s}
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
  /** Seconds longer than the recommended route (negative when faster). */
  slowerBy: number;
  selected: boolean;
  onSelect: () => void;
}

function RouteCard({ route, recommended, slowerBy, selected, onSelect }: RouteCardProps) {
  const { summary } = route;
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-2 rounded-card border-2 px-3 py-2.5 shadow-card transition-colors",
        "has-focus-visible:ring-2 has-focus-visible:ring-ring/40",
        selected
          ? "border-primary bg-secondary/50 shadow-glow"
          : "border-border bg-surface hover:border-muted-foreground",
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
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              selected ? "bg-primary text-primary-foreground" : "bg-surface-raised",
            )}
          >
            {selected ? <Check className="size-3.5" strokeWidth={3} /> : route.id}
          </span>
          <span className="font-semibold">Route {route.id}</span>
          {recommended && <Badge variant="primary">Best</Badge>}
          {selected && <span className="text-xs font-medium text-primary">On the map</span>}
        </span>
        <Badge variant={GRADE_BADGE[summary.grade]} className="shrink-0">
          <span aria-hidden="true">
            Grade {summary.grade} · {summary.safety_score}
          </span>
          <span className="sr-only">
            grade {summary.grade}, score {summary.safety_score} of 100
          </span>
        </Badge>
      </span>
      {/* One line instead of labelled columns: time, then what it costs against the best. */}
      <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm tabular-nums">
        <span className="font-semibold">{formatDuration(route.duration_s)}</span>
        {!recommended && Math.abs(slowerBy) >= 60 && (
          <span className="text-xs text-warning">
            {`${slowerBy > 0 ? "+" : "−"}${formatDuration(Math.abs(slowerBy))}`}
          </span>
        )}
        <span className="text-muted-foreground">
          · {formatMiles(route.distance_mi)} · arrives {formatClock(route.arrival)}
        </span>
      </span>
      {route.via_town && (
        <span className="-mt-1 truncate text-xs text-muted-foreground">via {route.via_town}</span>
      )}
      <RiskStrip summary={summary} />
    </label>
  );
}
