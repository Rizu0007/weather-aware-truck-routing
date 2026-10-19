import { TriangleAlert } from "lucide-react";

import type { Conditions } from "@/types/api";
import { cn } from "@/utils/cn";
import { describeFlag, describeSky, formatTemperature } from "@/utils/conditions";

/** Weather icon, its name and the temperature: "☁ Overcast · 54 °F". */
export function SkySummary({
  conditions,
  className,
}: {
  conditions: Conditions;
  className?: string;
}) {
  const sky = describeSky(conditions.weather_code);
  const parts = [
    sky?.label,
    conditions.temperature_f === null ? null : formatTemperature(conditions.temperature_f),
  ].filter(Boolean);
  if (!parts.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      {sky && <sky.Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
      {parts.join(" · ")}
    </span>
  );
}

/** Crosswind, ice and fog warnings as chips; nothing when there are none. */
export function ConditionFlags({ conditions }: { conditions: Conditions }) {
  if (!conditions.flags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {conditions.flags.map((flag) => (
        <span
          key={flag}
          className="inline-flex items-center gap-1 rounded-pill bg-warning-surface px-2 py-0.5 text-xs font-medium whitespace-nowrap text-warning"
        >
          <TriangleAlert aria-hidden="true" className="size-3" />
          {describeFlag(flag, conditions)}
        </span>
      ))}
    </span>
  );
}
