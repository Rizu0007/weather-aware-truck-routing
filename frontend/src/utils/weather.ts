import type { Heatmap, HeatmapCell } from "@/types/api";

// Where the map draws wind, rain and snow: the brief's Moderate thresholds, so what moves on
// the map is exactly what raises risk.
export const SHOWN_FROM = { windMph: 25, rainInHr: 0.1, snowInHr: 0.5 } as const;

export interface CellWeather {
  wind: boolean;
  rain: boolean;
  snow: boolean;
}

export function cellWeather(cell: HeatmapCell, hour: number): CellWeather {
  return {
    wind: (cell.wind_mph[hour] ?? 0) >= SHOWN_FROM.windMph,
    rain: (cell.rain_in_hr[hour] ?? 0) >= SHOWN_FROM.rainInHr,
    snow: (cell.snow_in_hr[hour] ?? 0) >= SHOWN_FROM.snowInHr,
  };
}

/** How many cells have wind, rain and snow worth showing, for each hour. */
export function weatherCounts(heatmap: Heatmap): { wind: number; rain: number; snow: number }[] {
  return Array.from({ length: heatmap.hours }, (_, hour) => {
    const counts = { wind: 0, rain: 0, snow: 0 };
    for (const cell of heatmap.cells) {
      const weather = cellWeather(cell, hour);
      if (weather.wind) counts.wind++;
      if (weather.rain) counts.rain++;
      if (weather.snow) counts.snow++;
    }
    return counts;
  });
}

/** "wind 25+ mph in 4 areas · rain in 2 areas", so the map's lines and streaks have names. */
export function describeWeather(counts: { wind: number; rain: number; snow: number }): string {
  const areas = (n: number) => `${n} area${n === 1 ? "" : "s"}`;
  const parts = [
    counts.wind && `wind ${SHOWN_FROM.windMph}+ mph in ${areas(counts.wind)}`,
    counts.rain && `rain in ${areas(counts.rain)}`,
    counts.snow && `snow in ${areas(counts.snow)}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "no strong wind, rain or snow";
}
