import { Badge } from "@/components/ui/badge";
import { RISK_LABELS } from "@/constants/risk";
import type { Checkpoint } from "@/types/api";
import { formatDateTime } from "@/utils/format";

function value(reading: number | null, decimals: number, unit: string): string {
  return reading === null ? "no data" : `${reading.toFixed(decimals)} ${unit}`;
}

/** Contents of the map popup for one checkpoint (rendered into MapLibre's popup). */
export function CheckpointPopup({
  routeId,
  checkpoint,
}: {
  routeId: string;
  checkpoint: Checkpoint;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-3 pr-6">
        <p className="font-semibold">
          Route {routeId} · mile {Math.round(checkpoint.mile)}
        </p>
        <Badge variant={checkpoint.level}>{RISK_LABELS[checkpoint.level]}</Badge>
      </div>
      <p className="text-muted-foreground">Truck arrives {formatDateTime(checkpoint.eta)}</p>
      <dl className="grid grid-cols-3 gap-2 tabular-nums">
        <div>
          <dt className="text-xs text-muted-foreground">Wind</dt>
          <dd>{value(checkpoint.wind_mph, 0, "mph")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Rain</dt>
          <dd>{value(checkpoint.rain_in_hr, 2, "in/hr")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Snow</dt>
          <dd>{value(checkpoint.snow_in_hr, 1, "in/hr")}</dd>
        </div>
      </dl>
      {checkpoint.reasons.length > 0 && <p>{checkpoint.reasons.join("; ")}</p>}
    </div>
  );
}
