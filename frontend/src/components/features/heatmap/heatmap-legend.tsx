import { RISK_BG, RISK_LABELS, RISK_LEVELS } from "@/constants/risk";
import { cn } from "@/utils/cn";
import { SHOWN_FROM } from "@/utils/weather";

export function HeatmapLegend() {
  return (
    <div className="flex flex-col gap-1.5">
      <ul
        aria-label="Risk colours"
        className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
        {RISK_LEVELS.map((level, index) => (
          <li key={level} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "size-3 rounded-sm",
                // Low is left clear on the map.
                index === 0 ? "border border-muted-foreground" : RISK_BG[level],
              )}
            />
            {index === 0 ? `${RISK_LABELS[level]} (clear)` : RISK_LABELS[level]}
          </li>
        ))}
      </ul>
      <ul
        aria-label="What moves on the map"
        className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-white/80" />
          Wind {SHOWN_FROM.windMph}+ mph
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-0.5 rotate-12 rounded-full bg-sky-300" />
          Rain {SHOWN_FROM.rainInHr}+ in/hr
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-white" />
          Snow {SHOWN_FROM.snowInHr}+ in/hr
        </li>
      </ul>
    </div>
  );
}
