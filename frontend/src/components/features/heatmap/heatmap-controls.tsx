import { Pause, Play } from "lucide-react";
import { useMemo, useState } from "react";

import { ApiError } from "@/api/client";
import { truckAt } from "@/components/features/map/map-data";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { HEATMAP_MAX_HOUR } from "@/constants/limits";
import { useHeatmapPlayback } from "@/hooks/use-heatmap-playback";
import type { Heatmap, PlannedRoute } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDateTime } from "@/utils/format";
import { describeWeather, weatherCounts } from "@/utils/weather";

interface HeatmapControlsProps {
  heatmap: Heatmap | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  /** The selected route: the hour line says where its truck is then. */
  route?: PlannedRoute;
  /** Wind, rain and snow animated on the map. */
  motion?: boolean;
  onMotionChange?: (motion: boolean) => void;
  initialHour: number;
  /** Every change while scrubbing or playing: update the map, nothing else. */
  onHourChange: (hour: number) => void;
  /** When scrubbing ends: e.g. save the hour in the URL. */
  onHourCommit: (hour: number) => void;
  className?: string;
}

export function HeatmapControls({
  heatmap,
  loading,
  error,
  onRetry,
  visible,
  onVisibleChange,
  route,
  motion = false,
  onMotionChange,
  initialHour,
  onHourChange,
  onHourCommit,
  className,
}: HeatmapControlsProps) {
  const [hour, setHour] = useState(initialHour);
  const hours = heatmap?.hours ?? HEATMAP_MAX_HOUR + 1;

  function show(next: number) {
    setHour(next);
    onHourChange(next);
  }
  // The hour the truck arrives: playback stops there once, so the trip plays as one story;
  // play again to see the rest of the forecast.
  const start = heatmap ? Date.parse(heatmap.start) : 0;
  const arrivalHour =
    heatmap && route
      ? Math.min(hours - 1, Math.ceil((Date.parse(route.arrival) - start) / 3_600_000))
      : null;
  const playback = useHeatmapPlayback(hours, hour, show, arrivalHour);
  // Low cells are clear on the map, so say when an hour has nothing to show.
  const riskyCells = useMemo(
    () =>
      Array.from(
        { length: hours },
        (_, h) => heatmap?.cells.filter((cell) => cell.risk[h] > 0).length ?? 0,
      ),
    [heatmap, hours],
  );
  const risky = riskyCells[hour] ?? 0;
  const weather = useMemo(() => (heatmap ? weatherCounts(heatmap) : []), [heatmap]);

  const time = heatmap
    ? formatDateTime(new Date(Date.parse(heatmap.start) + hour * 3_600_000).toISOString())
    : "";
  const truck =
    heatmap && route ? truckAt(route, Date.parse(heatmap.start) + hour * 3_600_000) : null;
  const truckText = !truck
    ? ""
    : truck.state === "waiting"
      ? "the truck hasn't left yet"
      : truck.state === "driving" && truck.mile < 1
        ? `the truck is setting off on route ${route!.id}`
        : truck.state === "arrived"
          ? `the truck has arrived (route ${route!.id})`
          : `the truck is at mile ${Math.round(truck.mile)} on route ${route!.id}`;
  const label = `+${hour} h · ${time}${truckText ? ` · ${truckText}` : ""}`;

  return (
    <section
      aria-labelledby="heatmap-heading"
      className={cn(
        "flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="heatmap-heading" className="text-sm font-semibold">
          Forecast timeline
          <span className="ml-2 font-normal text-muted-foreground">
            the weather hour by hour, and where your truck is
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {onMotionChange && (
            <label className="flex cursor-pointer items-center gap-2 has-disabled:cursor-default has-disabled:opacity-50">
              <input
                type="checkbox"
                checked={motion}
                disabled={!visible}
                onChange={(event) => onMotionChange(event.target.checked)}
                className="size-4 accent-primary"
              />
              Moving wind & rain
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={visible}
              onChange={(event) => onVisibleChange(event.target.checked)}
              className="size-4 accent-primary"
            />
            Show on map
          </label>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col gap-2" role="status">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading the forecast grid…
          </span>
          <Skeleton className="h-6" />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          {error instanceof ApiError ? error.message : "The forecast grid couldn't be loaded."}
          {error instanceof ApiError && error.resetsAt ? (
            // A used-up quota: say when it's back instead of offering a pointless retry.
            <span className="text-muted-foreground">
              That's {formatDateTime(error.resetsAt)} for you.
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      )}

      {heatmap && !loading && (
        <>
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => {
                if (playback.playing) onHourCommit(hour); // keep the paused hour in the URL
                playback.toggle();
              }}
              aria-label={playback.playing ? "Pause" : "Play through the hours"}
              aria-pressed={playback.playing}
              disabled={!visible}
              className="shrink-0"
            >
              {playback.playing ? <Pause /> : <Play />}
            </Button>
            <Slider
              aria-label="Forecast hour after departure"
              valueText={label}
              min={0}
              max={hours - 1}
              step={1}
              value={[hour]}
              disabled={!visible}
              onValueChange={([next]) => {
                playback.pause();
                show(next);
              }}
              onValueCommit={([next]) => onHourCommit(next)}
              span={
                arrivalHour
                  ? {
                      from: 0,
                      to: arrivalHour,
                      label: `Truck on the road · arrives +${arrivalHour} h`,
                    }
                  : undefined
              }
            />
            <p aria-hidden="true" className="shrink-0 text-sm whitespace-nowrap tabular-nums">
              <span className="font-semibold">+{hour} h</span>{" "}
              <span className="text-muted-foreground">· {time}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
            {truckText && (
              <p className="font-medium text-primary">
                <span aria-hidden="true">● </span>
                {truckText[0].toUpperCase() + truckText.slice(1)}
              </p>
            )}
            <p className="text-muted-foreground">
              {risky === 0
                ? "All Low along the corridor"
                : `${risky} area${risky === 1 ? "" : "s"} Moderate or worse`}
              {" · "}
              {describeWeather(weather[hour] ?? { wind: 0, rain: 0, snow: 0 })}
            </p>
          </div>
          {heatmap.warnings.map((warning) => (
            <p key={warning} className="text-xs text-muted-foreground">
              {warning}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
