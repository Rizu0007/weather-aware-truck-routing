import { ConditionFlags, SkySummary } from "@/components/features/results/conditions";
import { Badge } from "@/components/ui/badge";
import { RISK_LABELS } from "@/constants/risk";
import type { Checkpoint } from "@/types/api";
import { formatVisibility } from "@/utils/conditions";
import { formatDateTime, formatReading } from "@/utils/format";

function value(reading: number | null, decimals: number, unit: string): string {
  return reading === null ? "no data" : `${formatReading(reading, decimals)} ${unit}`;
}

/** Contents of the map popup for one checkpoint (rendered into MapLibre's popup). */
export function CheckpointPopup({
  routeId,
  checkpoint,
}: {
  routeId: string;
  checkpoint: Checkpoint;
}) {
  const { conditions } = checkpoint;
  const readings: [string, string][] = [
    ["Wind", value(checkpoint.wind_mph, 0, "mph")],
    ["Gusts", value(conditions.gust_mph, 0, "mph")],
    ["Across road", value(conditions.crosswind_mph, 0, "mph")],
    ["Rain", value(checkpoint.rain_in_hr, 2, "in/hr")],
    ["Snow", value(checkpoint.snow_in_hr, 1, "in/hr")],
    [
      "Visibility",
      conditions.visibility_mi === null ? "no data" : formatVisibility(conditions.visibility_mi),
    ],
  ];
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-3 pr-6">
        <p className="font-semibold">
          Route {routeId} · mile {Math.round(checkpoint.mile)}
        </p>
        <Badge variant={checkpoint.level}>{RISK_LABELS[checkpoint.level]}</Badge>
      </div>
      <p className="text-muted-foreground">Truck arrives {formatDateTime(checkpoint.eta)}</p>
      <p className="flex flex-wrap items-center gap-x-2">
        <SkySummary conditions={conditions} className="font-medium" />
        {conditions.precip_probability !== null && conditions.precip_probability > 0 && (
          <span className="text-muted-foreground">
            {conditions.precip_probability}% chance of rain or snow
          </span>
        )}
      </p>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 tabular-nums">
        {readings.map(([label, reading]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>{reading}</dd>
          </div>
        ))}
      </dl>
      <ConditionFlags conditions={conditions} />
      {checkpoint.reasons.length > 0 && (
        <p>
          <span className="text-muted-foreground">Risk from: </span>
          {checkpoint.reasons.join("; ")}
        </p>
      )}
    </div>
  );
}
