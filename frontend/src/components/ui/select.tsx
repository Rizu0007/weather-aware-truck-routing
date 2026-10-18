import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { fieldClassName } from "@/components/ui/input";
import { cn } from "@/utils/cn";

/** Native select: keyboard, screen-reader and mobile pickers work out of the box. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(fieldClassName, "appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
