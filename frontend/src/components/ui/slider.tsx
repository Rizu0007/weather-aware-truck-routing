import { Slider as SliderPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/utils/cn";

/** Single-thumb slider on Radix (keyboard, ARIA and touch handled), styled with our tokens. */
export function Slider({
  className,
  "aria-label": ariaLabel,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex h-6 w-full touch-none items-center select-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-pill bg-surface-raised">
        <SliderPrimitive.Range className="absolute h-full bg-linear-90 from-primary to-primary-end" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="block size-5 rounded-full border-2 border-primary bg-background shadow-card transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
      />
    </SliderPrimitive.Root>
  );
}
