import { MapPin } from "lucide-react";
import { useEffect, useRef } from "react";

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
}

/** Every checkpoint of the selected route: the same data as the map, in text. */
export function CheckpointTable({
  route,
  activeMile = null,
  onActivate,
  onHover,
}: CheckpointTableProps) {
  const activeRow = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    activeRow.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeMile]);

  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-left text-sm tabular-nums">
        <caption className="sr-only">
          Weather at each checkpoint on route {route.id}, at the truck's estimated arrival time
        </caption>
        <thead className="bg-surface text-xs text-muted-foreground">
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
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Wind mph
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
              <td className="px-3 py-2 text-right">{reading(checkpoint.wind_mph, 0)}</td>
              <td className="px-3 py-2 text-right">{reading(checkpoint.rain_in_hr, 2)}</td>
              <td className="px-3 py-2 text-right">{reading(checkpoint.snow_in_hr, 1)}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {checkpoint.reasons.join("; ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
