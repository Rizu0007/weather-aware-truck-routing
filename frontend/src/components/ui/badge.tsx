import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-surface-raised text-foreground",
        primary: "bg-secondary text-secondary-foreground",
        outline: "border border-border text-muted-foreground",
        low: "bg-risk-low text-risk-foreground",
        moderate: "bg-risk-moderate text-risk-foreground",
        high: "bg-risk-high text-risk-foreground",
        severe: "bg-risk-severe text-risk-foreground",
        no_travel: "bg-risk-no-travel text-risk-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
