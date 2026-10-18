import { RISK_BG, RISK_LABELS, RISK_LEVELS } from "@/constants/risk";
import { cn } from "@/utils/cn";

export function HeatmapLegend() {
  return (
    <ul
      aria-label="Risk colours"
      className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
    >
      {RISK_LEVELS.map((level, index) => (
        <li key={level} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-3 rounded-sm", RISK_BG[level], index === 0 && "opacity-40")}
          />
          {RISK_LABELS[level]}
        </li>
      ))}
    </ul>
  );
}
