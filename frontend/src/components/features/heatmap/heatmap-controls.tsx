import { Pause, Play } from "lucide-react";
import { useMemo, useState } from "react";

import { ApiError } from "@/api/client";
import { HeatmapLegend } from "@/components/features/heatmap/heatmap-legend";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { HEATMAP_MAX_HOUR } from "@/constants/limits";
import { useHeatmapPlayback } from "@/hooks/use-heatmap-playback";
import type { Heatmap } from "@/types/api";
import { formatDateTime } from "@/utils/format";

interface HeatmapControlsProps {
  heatmap: Heatmap | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  /** Animated rain, snow and wind on the map. */
  motion?: boolean;
  onMotionChange?: (motion: boolean) => void;
  initialHour: number;
  /** Every change while scrubbing or playing: update the map, nothing else. */
  onHourChange: (hour: number) => void;
  /** When scrubbing ends: e.g. save the hour in the URL. */
  onHourCommit: (hour: number) => void;
}

export function HeatmapControls({
  heatmap,
  loading,
  error,
  onRetry,
  visible,
  onVisibleChange,
  motion = false,
  onMotionChange,
  initialHour,
  onHourChange,
  onHourCommit,
}: HeatmapControlsProps) {
  const [hour, setHour] = useState(initialHour);
  const hours = heatmap?.hours ?? HEATMAP_MAX_HOUR + 1;

  function show(next: number) {
    setHour(next);
    onHourChange(next);
  }
  const playback = useHeatmapPlayback(hours, hour, show);
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

  const time = heatmap
    ? formatDateTime(new Date(Date.parse(heatmap.start) + hour * 3_600_000).toISOString())
    : "";
  const label = `+${hour} h · ${time}`;

  return (
    <section
      aria-labelledby="heatmap-heading"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="heatmap-heading" className="text-base font-semibold">
          Weather along the corridor
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            0–48 h after departure
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          {onMotionChange && (
            <label className="flex cursor-pointer items-center gap-2 text-sm has-disabled:cursor-default has-disabled:opacity-50">
              <input
                type="checkbox"
                checked={motion}
                disabled={!visible}
                onChange={(event) => onMotionChange(event.target.checked)}
                className="size-4 accent-primary"
              />
              Animate rain and wind
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
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
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
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
            />
          </div>
          <p className="text-sm tabular-nums" aria-hidden="true">
            <span className="font-semibold">+{hour} h</span>{" "}
            <span className="text-muted-foreground">· {time}</span>{" "}
            <span className="text-muted-foreground">
              ·{" "}
              {risky === 0
                ? "all Low along the corridor"
                : `${risky} area${risky === 1 ? "" : "s"} Moderate or worse`}
            </span>
          </p>
          <HeatmapLegend />
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
