import { RISK_BG, RISK_LABELS, RISK_LEVELS } from "@/constants/risk";
import type { RouteSummary } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatMiles } from "@/utils/format";

/** Share of the route's miles at each risk level, with the same numbers as text. */
export function RiskStrip({ summary, className }: { summary: RouteSummary; className?: string }) {
  const levels = RISK_LEVELS.filter((level) => summary.miles_by_level[level] > 0);
  const total = levels.reduce((sum, level) => sum + summary.miles_by_level[level], 0);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex h-2 overflow-hidden rounded-pill bg-surface-raised" aria-hidden="true">
        {levels.map((level) => (
          <div
            key={level}
            className={RISK_BG[level]}
            style={{ width: `${(summary.miles_by_level[level] / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {levels.map((level) => (
          <li key={level} className="flex items-center gap-1.5 tabular-nums">
            <span aria-hidden="true" className={cn("size-2 rounded-full", RISK_BG[level])} />
            {RISK_LABELS[level]} {formatMiles(summary.miles_by_level[level])}
          </li>
        ))}
      </ul>
    </div>
  );
}
