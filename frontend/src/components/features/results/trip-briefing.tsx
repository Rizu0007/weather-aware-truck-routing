import type { PlannedRoute } from "@/types/api";
import { tripBriefing, type BriefingTone } from "@/utils/briefing";
import { cn } from "@/utils/cn";
import { formatClock } from "@/utils/format";

// Literal class names, so Tailwind can find them.
const DOT: Record<BriefingTone, string> = {
  good: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-destructive-inline",
};

interface TripBriefingProps {
  route: PlannedRoute;
  /** Place names as the user picked them, e.g. "Dallas, Texas". */
  from: string;
  to: string;
  activeMile: number | null;
  onActivate: (mile: number) => void;
}

/** What to expect along the selected route, in driving order; each line shows its spot on the map. */
export function TripBriefing({ route, from, to, activeMile, onActivate }: TripBriefingProps) {
  const items = tripBriefing(route, shortName(from), shortName(to));
  const quiet = items.length === 2 && items.every((item) => item.tone === "good");
  return (
    <section aria-labelledby="briefing-heading" className="flex flex-col gap-2">
      <h2 id="briefing-heading" className="text-sm font-semibold">
        Trip briefing · route {route.id}
      </h2>
      <ol className="relative flex flex-col rounded-card border border-border bg-surface py-1">
        {/* The road: a line through the dots. */}
        <span
          aria-hidden="true"
          className="absolute top-5 bottom-5 left-[1.375rem] w-px bg-border"
        />
        {items.map((item) => (
          <li key={`${item.kind}-${item.mile}`}>
            <button
              type="button"
              onClick={() => onActivate(item.mile)}
              aria-current={item.mile === activeMile || undefined}
              className={cn(
                "relative flex w-full gap-3 rounded-control px-3 py-1.5 text-left text-sm hover:bg-surface-raised",
                item.mile === activeMile && "bg-secondary/60",
              )}
            >
              {/* Numbered like the pins on the map; start and arrival are its end markers. */}
              <span aria-hidden="true" className="flex w-5 shrink-0 justify-center pt-0.5">
                {item.number ? (
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-risk-foreground ring-4 ring-surface",
                      DOT[item.tone],
                    )}
                  >
                    {item.number}
                  </span>
                ) : (
                  <span
                    className={cn("mt-1 size-2.5 rounded-full ring-4 ring-surface", DOT[item.tone])}
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatClock(item.eta)} · mile {Math.round(item.mile)}
                </span>
                <span>{item.text}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {quiet && (
        <p className="text-xs text-muted-foreground">Nothing changes worth noting along the way.</p>
      )}
    </section>
  );
}

/** "Dallas, Texas" → "Dallas". */
function shortName(label: string): string {
  return label.split(",")[0].trim() || label;
}
