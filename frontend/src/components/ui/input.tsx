import type { ComponentProps } from "react";

import { cn } from "@/utils/cn";

// Shared by Input, Select and Combobox so every field looks the same.
export const fieldClassName =
  "h-10 w-full rounded-control border border-input bg-surface px-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive-inline aria-invalid:focus-visible:ring-destructive-inline/30";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClassName, "tabular-nums", className)} {...props} />;
}
