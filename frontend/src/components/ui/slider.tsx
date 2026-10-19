import { Slider as SliderPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/utils/cn";

/** Single-thumb slider on Radix (keyboard, ARIA and touch handled), styled with our tokens. */
export function Slider({
  className,
  "aria-label": ariaLabel,
  valueText,
  span,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root> & {
  /** Read out instead of the bare number, e.g. "+6 h, Tue 9:00 PM". */
  valueText?: string;
  /** A stretch of values marked under the track, e.g. the hours a trip takes (decorative). */
  span?: { from: number; to: number; label: string };
}) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const at = (value: number) => `${((value - min) / (max - min)) * 100}%`;
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex h-6 w-full touch-none items-center select-none data-disabled:opacity-50",
        span && "mb-4",
        className,
      )}
      {...props}
    >
      {span && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-full h-4">
          <span
            className="absolute top-0 h-1 rounded-pill bg-primary/50"
            style={{ left: at(span.from), width: `calc(${at(span.to)} - ${at(span.from)})` }}
          />
          <span
            className="absolute top-1 text-[11px] whitespace-nowrap text-primary"
            style={{ left: at(span.from) }}
          >
            {span.label}
          </span>
        </span>
      )}
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-pill bg-surface-raised">
        <SliderPrimitive.Range className="absolute h-full bg-linear-90 from-primary to-primary-end" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        aria-valuetext={valueText}
        className="block size-5 rounded-full border-2 border-primary bg-background shadow-card transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
      />
    </SliderPrimitive.Root>
  );
}
