import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from "lucide-react";

import type { ConditionFlag, Conditions } from "@/types/api";

/** Groups of weather that read the same to a driver; a change between them is news. */
export type SkyKind = "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export interface Sky {
  kind: SkyKind;
  label: string;
  Icon: LucideIcon;
}

const KINDS: Record<SkyKind, { label: string; Icon: LucideIcon }> = {
  clear: { label: "Clear", Icon: Sun },
  cloudy: { label: "Cloudy", Icon: Cloud },
  fog: { label: "Fog", Icon: CloudFog },
  drizzle: { label: "Drizzle", Icon: CloudDrizzle },
  rain: { label: "Rain", Icon: CloudRain },
  snow: { label: "Snow", Icon: CloudSnow },
  storm: { label: "Thunderstorm", Icon: CloudLightning },
};

/** WMO weather interpretation code → what the sky is doing; null when unknown. */
export function describeSky(code: number | null): Sky | null {
  if (code === null) return null;
  const sky = (kind: SkyKind, label = KINDS[kind].label): Sky => ({
    kind,
    label,
    Icon: KINDS[kind].Icon,
  });
  if (code === 0) return sky("clear");
  if (code === 1 || code === 2) return { ...sky("cloudy", "Partly cloudy"), Icon: CloudSun };
  if (code === 3) return sky("cloudy", "Overcast");
  if (code === 45 || code === 48) return sky("fog");
  if (code === 56 || code === 57) return sky("drizzle", "Freezing drizzle");
  if (code >= 51 && code <= 55) return sky("drizzle");
  if (code === 66 || code === 67) return sky("rain", "Freezing rain");
  if (code >= 61 && code <= 65) return sky("rain");
  if (code >= 80 && code <= 82) return sky("rain", "Rain showers");
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return sky("snow");
  if (code >= 95) return sky("storm");
  return null;
}

export const FLAG_LABELS: Record<ConditionFlag, string> = {
  crosswind: "Crosswind",
  freezing: "Ice risk",
  low_visibility: "Low visibility",
};

/** "Crosswind 32 mph", "Ice risk at 30 °F", "Visibility 0.4 mi". */
export function describeFlag(flag: ConditionFlag, conditions: Conditions): string {
  switch (flag) {
    case "crosswind":
      return conditions.crosswind_mph === null
        ? FLAG_LABELS.crosswind
        : `Crosswind ${Math.round(conditions.crosswind_mph)} mph`;
    case "freezing":
      return conditions.temperature_f === null
        ? FLAG_LABELS.freezing
        : `Ice risk at ${formatTemperature(conditions.temperature_f)}`;
    case "low_visibility":
      return conditions.visibility_mi === null
        ? FLAG_LABELS.low_visibility
        : `Visibility ${formatVisibility(conditions.visibility_mi)}`;
  }
}

export function formatTemperature(fahrenheit: number): string {
  return `${Math.round(fahrenheit)} °F`;
}

/** Past 10 mi visibility makes no difference to a driver, so it reads as "10+ mi". */
export function formatVisibility(miles: number): string {
  if (miles >= 10) return "10+ mi";
  return `${miles < 1 ? miles.toFixed(1) : Math.round(miles)} mi`;
}
