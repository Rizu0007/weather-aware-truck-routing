import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RISK_LABELS, RISK_LEVELS } from "@/constants/risk";

// The brief's threshold table, one row per level so it fits a narrow panel.
const THRESHOLDS = {
  low: ["< 25", "< 0.10", "< 0.5"],
  moderate: ["25–34", "0.10–0.25", "0.5–1.0"],
  high: ["35–44", "0.25–0.50", "1.0–2.0"],
  severe: ["45–54", "0.50–1.00", "2.0–3.0"],
  no_travel: ["≥ 55", "> 1.00", "> 3.0"],
};

/** How a checkpoint's risk and the recommendation are worked out, in plain words. */
export function RiskInfoPanel() {
  return (
    <details className="group rounded-card border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold">
        How risk is scored
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
        <div>
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="sr-only">Risk level for each weather condition</caption>
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-2 font-medium">
                  Level
                </th>
                <th scope="col" className="px-2 py-1 font-medium">
                  Wind mph
                </th>
                <th scope="col" className="px-2 py-1 font-medium">
                  Rain in/hr
                </th>
                <th scope="col" className="px-2 py-1 font-medium">
                  Snow in/hr
                </th>
              </tr>
            </thead>
            <tbody>
              {RISK_LEVELS.map((level) => (
                <tr key={level} className="border-t border-border">
                  <th scope="row" className="py-1.5 pr-2">
                    <Badge variant={level}>{RISK_LABELS[level]}</Badge>
                  </th>
                  {THRESHOLDS[level].map((band) => (
                    <td key={band} className="px-2 py-1.5 whitespace-nowrap">
                      {band}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="font-medium">Heavy loads make wind worse</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            <li>Wind 55 mph or more: No Travel for any load.</li>
            <li>Wind 45–54 mph with more than 30,000 lb: No Travel.</li>
            <li>Wind 35–44 mph with more than 40,000 lb: Severe.</li>
          </ul>
        </div>
        <div>
          <p className="font-medium">Which route is recommended</p>
          <ol className="mt-1 list-decimal pl-5 text-muted-foreground">
            <li>Fewest No Travel miles</li>
            <li>Fewest Severe miles</li>
            <li>Fewest High miles</li>
            <li>Lowest average risk (mile-weighted, Low 0 … No Travel 4)</li>
            <li>Shortest travel time</li>
          </ol>
        </div>
        <p className="text-xs text-muted-foreground">
          Weather is read at each checkpoint for the hour the truck gets there (sustained wind, not
          gusts). Each checkpoint stands for the road half-way to its neighbours. Drive times are
          the routing service's, capped at 65 mph, without rest breaks.
        </p>
      </div>
    </details>
  );
}
