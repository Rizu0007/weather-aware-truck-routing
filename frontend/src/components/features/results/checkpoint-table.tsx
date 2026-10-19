import { MapPin } from "lucide-react";
import { useEffect, useRef } from "react";

import { ConditionFlags, SkySummary } from "@/components/features/results/conditions";
import { Badge } from "@/components/ui/badge";
import { RISK_LABELS } from "@/constants/risk";
import type { PlannedRoute } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatClock, timeZoneAbbreviation } from "@/utils/format";

function reading(value: number | null, decimals: number) {
  return value === null ? (
    <span title="No forecast data" className="text-muted-foreground">
      —
    </span>
  ) : (
    value.toFixed(decimals)
  );
}

interface CheckpointTableProps {
  route: PlannedRoute;
  /** Checkpoint shown on the map; its row is highlighted and scrolled into view. */
  activeMile?: number | null;
  onActivate?: (mile: number) => void;
  onHover?: (mile: number | null) => void;
  className?: string;
}

/** Every checkpoint of the selected route: the same data as the map, in text. */
export function CheckpointTable({
  route,
  activeMile = null,
  onActivate,
  onHover,
  className,
}: CheckpointTableProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const activeRow = useRef<HTMLTableRowElement>(null);

  // Scroll the table, never the page: a click on the map must leave the map in view.
  useEffect(() => {
    const box = scroller.current;
    const row = activeRow.current;
    if (!box || !row) return;
    const header = box.querySelector("thead")?.offsetHeight ?? 0;
    const visible =
      row.offsetTop >= box.scrollTop + header &&
      row.offsetTop + row.offsetHeight <= box.scrollTop + box.clientHeight;
    if (!visible) box.scrollTo?.({ top: row.offsetTop - header, behavior: "smooth" });
  }, [activeMile]);

  return (
    <div
      ref={scroller}
      className={cn(
        "relative max-h-[28rem] overflow-auto rounded-card border border-border",
        className,
      )}
    >
      <table className="w-full text-left text-sm tabular-nums">
        <caption className="sr-only">
          Weather at each checkpoint on route {route.id}, at the truck's estimated arrival time
        </caption>
        <thead className="sticky top-0 z-10 bg-surface text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Mile
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              ETA ({timeZoneAbbreviation(new Date(route.checkpoints[0].eta))})
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Risk
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Conditions
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Wind (gust) mph
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Rain in/hr
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Snow in/hr
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Why
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {route.checkpoints.map((checkpoint, index) => (
            <tr
              key={checkpoint.mile}
              ref={checkpoint.mile === activeMile ? activeRow : undefined}
              aria-current={checkpoint.mile === activeMile || undefined}
              onMouseEnter={() => onHover?.(checkpoint.mile)}
              onMouseLeave={() => onHover?.(null)}
              className={cn(checkpoint.mile === activeMile && "bg-secondary/60")}
            >
              <th scope="row" className="px-3 py-2 font-medium">
                {onActivate ? (
                  <button
                    type="button"
                    onClick={() => onActivate(checkpoint.mile)}
                    aria-label={`Mile ${Math.round(checkpoint.mile)}: show on map`}
                    className="inline-flex items-center gap-1.5 rounded-control hover:text-primary"
                  >
                    <MapPin aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    {Math.round(checkpoint.mile)}
                  </button>
                ) : (
                  Math.round(checkpoint.mile)
                )}
              </th>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatClock(checkpoint.eta, route.checkpoints[index - 1]?.eta)}
              </td>
              <td className="px-3 py-2">
                <Badge variant={checkpoint.level}>{RISK_LABELS[checkpoint.level]}</Badge>
              </td>
              <td className="px-3 py-2">
                <span className="flex flex-col gap-1">
                  <SkySummary conditions={checkpoint.conditions} />
                  <ConditionFlags conditions={checkpoint.conditions} />
                </span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {reading(checkpoint.wind_mph, 0)}
                {checkpoint.conditions.gust_mph !== null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({Math.round(checkpoint.conditions.gust_mph)})
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right">{reading(checkpoint.rain_in_hr, 2)}</td>
              <td className="px-3 py-2 text-right">{reading(checkpoint.snow_in_hr, 1)}</td>
              <td className="min-w-64 px-3 py-2 text-muted-foreground">
                {checkpoint.reasons.join("; ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
