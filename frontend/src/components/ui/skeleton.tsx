import type { ComponentProps } from "react";

import { cn } from "@/utils/cn";

/** Placeholder shape while content loads; hidden from screen readers (announce loading elsewhere). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-control bg-surface-raised", className)}
      {...props}
    />
  );
}
