import type { ComponentProps } from "react";

import { cn } from "@/utils/cn";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}
