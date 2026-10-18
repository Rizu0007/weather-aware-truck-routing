import { RISK_LABELS, type RiskLevel } from "@/constants/risk";
import type { PlannedRoute } from "@/types/api";
import { formatMiles } from "@/utils/format";

/** "Risk along route A: Low for 189 mi; No Travel for 50 mi, from mile 88 to 138." */
export function describeRisk(route: PlannedRoute): string {
  const stretches: { level: RiskLevel; start: number; end: number }[] = [];
  for (const checkpoint of route.checkpoints) {
    const last = stretches[stretches.length - 1];
    if (last?.level === checkpoint.level) last.end = checkpoint.covers[1];
    else
      stretches.push({
        level: checkpoint.level,
        start: checkpoint.covers[0],
        end: checkpoint.covers[1],
      });
  }
  const risky = stretches.filter((s) => s.level !== "low");
  const lowMiles = route.summary.miles_by_level.low;
  if (risky.length === 0)
    return `Risk along route ${route.id}: Low for all ${formatMiles(route.distance_mi)}.`;
  const parts = risky.map(
    (s) =>
      `${RISK_LABELS[s.level]} for ${formatMiles(s.end - s.start)}, from mile ${Math.round(s.start)} to ${Math.round(s.end)}`,
  );
  return `Risk along route ${route.id}: Low for ${formatMiles(lowMiles)}; ${parts.join("; ")}.`;
}
