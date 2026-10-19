import { RISK_BG, RISK_LABELS, RISK_LEVELS } from "@/constants/risk";
import { cn } from "@/utils/cn";
import { SHOWN_FROM } from "@/utils/weather";

interface HeatmapLegendProps {
  /** Name the moving wind, rain and snow too (only while they're drawn). */
  motion?: boolean;
  className?: string;
}

/** Risk colours for routes and the weather layer, shown on the map. */
export function HeatmapLegend({ motion = false, className }: HeatmapLegendProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-xs text-muted-foreground", className)}>
      <ul aria-label="Risk colours" className="flex flex-wrap gap-x-2.5 gap-y-1">
        {RISK_LEVELS.map((level) => (
          <li key={level} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-2.5 rounded-sm", RISK_BG[level])} />
            {RISK_LABELS[level]}
          </li>
        ))}
      </ul>
      <ul aria-label="On the selected route" className="flex flex-wrap gap-x-2.5 gap-y-1">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="flex size-3.5 items-center justify-center rounded-full bg-info text-[9px] font-bold text-risk-foreground"
          >
            1
          </span>
          Briefing point
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full border-2 border-warning bg-risk-low"
          />
          Crosswind, ice or fog
        </li>
      </ul>
      {motion && (
        <ul aria-label="What moves on the map" className="flex flex-wrap gap-x-2.5 gap-y-1">
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
      )}
    </div>
  );
}
