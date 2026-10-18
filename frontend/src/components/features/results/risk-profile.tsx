import { useState, type MouseEvent } from "react";

import { RISK_LABELS, RISK_LEVELS, type RiskLevel } from "@/constants/risk";
import type { Checkpoint, PlannedRoute } from "@/types/api";
import { cn } from "@/utils/cn";
import { describeRisk } from "@/utils/describe-risk";
import { formatClock, formatMiles } from "@/utils/format";

const WIDTH = 1000; // viewBox units; the SVG scales to its container
const HEIGHT = 64;
const MIN_BAR = 10; // Low still shows, so the strip reads as one road

// Literal class names, so Tailwind can find them.
const RISK_FILL: Record<RiskLevel, string> = {
  low: "fill-risk-low",
  moderate: "fill-risk-moderate",
  high: "fill-risk-high",
  severe: "fill-risk-severe",
  no_travel: "fill-risk-no-travel",
};

interface RiskProfileProps {
  route: PlannedRoute;
  activeMile: number | null;
  onHover: (mile: number | null) => void;
  onActivate: (mile: number) => void;
}

/** Risk mile by mile along the route, like an elevation profile; linked with the map and table. */
export function RiskProfile({ route, activeMile, onHover, onActivate }: RiskProfileProps) {
  const [hovered, setHovered] = useState<Checkpoint | null>(null);
  const total = route.distance_mi;
  const x = (mile: number) => (mile / total) * WIDTH;
  const shown = hovered ?? route.checkpoints.find((c) => c.mile === activeMile) ?? null;
  // As tall as the worst level needs: an all-Low route is a slim strip, not an empty band.
  const worst = Math.max(...route.checkpoints.map((c) => RISK_LEVELS.indexOf(c.level)));
  const top = HEIGHT - (MIN_BAR + (worst / 4) * (HEIGHT - MIN_BAR));

  function checkpointAt(event: MouseEvent<SVGSVGElement>): Checkpoint | undefined {
    const box = event.currentTarget.getBoundingClientRect();
    const mile = ((event.clientX - box.left) / box.width) * total;
    return route.checkpoints.find((c) => mile >= c.covers[0] && mile <= c.covers[1]);
  }

  return (
    <figure className="flex flex-col gap-1.5">
      <svg
        viewBox={`0 ${top} ${WIDTH} ${HEIGHT - top}`}
        style={{ height: HEIGHT - top }}
        preserveAspectRatio="none"
        role="img"
        aria-label={describeRisk(route)}
        className="w-full cursor-crosshair overflow-visible"
        onPointerMove={(event) => {
          const checkpoint = checkpointAt(event);
          setHovered(checkpoint ?? null);
          onHover(checkpoint?.mile ?? null);
        }}
        onPointerLeave={() => {
          setHovered(null);
          onHover(null);
        }}
        onClick={(event) => {
          const checkpoint = checkpointAt(event);
          if (checkpoint) onActivate(checkpoint.mile);
        }}
      >
        {route.checkpoints.map((checkpoint) => {
          const score = RISK_LEVELS.indexOf(checkpoint.level);
          const height = MIN_BAR + (score / 4) * (HEIGHT - MIN_BAR);
          return (
            <rect
              key={checkpoint.mile}
              data-mile={checkpoint.mile}
              x={x(checkpoint.covers[0])}
              y={HEIGHT - height}
              width={Math.max(1, x(checkpoint.covers[1]) - x(checkpoint.covers[0]))}
              height={height}
              className={cn(
                RISK_FILL[checkpoint.level],
                shown && shown !== checkpoint && "opacity-60",
              )}
            />
          );
        })}
        {shown && (
          <line
            x1={x(shown.mile)}
            x2={x(shown.mile)}
            y1={top}
            y2={HEIGHT}
            className="stroke-foreground"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <figcaption className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>0 mi</span>
        <span aria-live="polite" className="text-foreground">
          {shown
            ? `Mile ${Math.round(shown.mile)} · ${RISK_LABELS[shown.level]} · ${formatClock(shown.eta)}`
            : "Point at the strip to see a checkpoint"}
        </span>
        <span>{formatMiles(total)}</span>
      </figcaption>
    </figure>
  );
}
