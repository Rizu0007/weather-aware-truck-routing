import { RiskStrip } from "@/components/features/results/risk-strip";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { RISK_BG, RISK_LABELS, RISK_LEVELS } from "@/constants/risk";
import type { PlannedRoute, RouteSummary, SafetyGrade } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDateTime, formatDuration, formatMiles } from "@/utils/format";

const GRADE_BADGE: Record<SafetyGrade, BadgeVariant> = {
  A: "low",
  B: "moderate",
  C: "high",
  D: "severe",
  F: "no_travel",
};

// Literal class names, so Tailwind can find them.
const COLUMNS = ["grid-cols-1", "grid-cols-2", "grid-cols-3"];

interface RouteCardListProps {
  routes: PlannedRoute[];
  recommendedId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}

/** Routes side by side to compare at a glance, with the selected one's detail below.
 *  Native radios styled as cards: arrow keys and screen readers work without extra code. */
export function RouteCardList({ routes, recommendedId, selectedId, onSelect }: RouteCardListProps) {
  const recommended = routes.find((route) => route.id === recommendedId) ?? routes[0];
  const selected = routes.find((route) => route.id === selectedId) ?? routes[0];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold">Routes, best first</legend>
      <div className={cn("grid gap-2", COLUMNS[routes.length - 1] ?? "grid-cols-3")}>
        {routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            recommended={route.id === recommended.id}
            slowerBy={route.duration_s - recommended.duration_s}
            selected={route.id === selected.id}
            onSelect={() => onSelect(route.id)}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
        <p className="text-sm">
          <span className="font-semibold">Route {selected.id}</span>
          {selected.via_town && (
            <span className="text-muted-foreground"> via {selected.via_town}</span>
          )}
          <span className="text-muted-foreground">
            {" "}
            · arrives {formatDateTime(selected.arrival)}
          </span>
        </p>
        <RiskStrip summary={selected.summary} />
      </div>
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
        "flex min-w-0 cursor-pointer flex-col gap-2 rounded-card border bg-surface p-3 shadow-card transition-colors",
        "has-focus-visible:ring-2 has-focus-visible:ring-ring/40",
        selected ? "border-primary bg-secondary/40" : "border-border hover:border-muted-foreground",
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
      <span className="flex flex-wrap items-center justify-between gap-1">
        <span className="font-semibold">Route {route.id}</span>
        {recommended && <Badge variant="primary">Best</Badge>}
      </span>
      <span>
        <Badge variant={GRADE_BADGE[summary.grade]}>
          <span aria-hidden="true">
            {summary.grade} · {summary.safety_score}
          </span>
          <span className="sr-only">
            grade {summary.grade}, score {summary.safety_score} of 100
          </span>
        </Badge>
      </span>
      <span className="flex flex-col text-sm tabular-nums">
        <span className="font-medium">{formatDuration(route.duration_s)}</span>
        <span className="text-xs text-muted-foreground">
          {formatMiles(route.distance_mi)}
          {!recommended && Math.abs(slowerBy) >= 60 && (
            <> · {`${slowerBy > 0 ? "+" : "−"}${formatDuration(Math.abs(slowerBy))}`}</>
          )}
        </span>
      </span>
      <RiskBar summary={summary} />
    </label>
  );
}

/** Just the coloured bar; the selected route's detail below names the miles. */
function RiskBar({ summary }: { summary: RouteSummary }) {
  const levels = RISK_LEVELS.filter((level) => summary.miles_by_level[level] > 0);
  const total = levels.reduce((sum, level) => sum + summary.miles_by_level[level], 0);
  return (
    <>
      <span
        className="flex h-1.5 overflow-hidden rounded-pill bg-surface-raised"
        aria-hidden="true"
      >
        {levels.map((level) => (
          <span
            key={level}
            className={RISK_BG[level]}
            style={{ width: `${(summary.miles_by_level[level] / total) * 100}%` }}
          />
        ))}
      </span>
      <span className="sr-only">worst risk {RISK_LABELS[summary.max_level]}</span>
    </>
  );
}
