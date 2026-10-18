import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

const alertVariants = cva("flex gap-3 rounded-card p-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4", {
  variants: {
    variant: {
      info: "bg-info-surface text-info",
      success: "bg-success-surface text-success",
      warning: "bg-warning-surface text-warning",
      error: "bg-destructive-surface text-destructive",
    },
  },
  defaultVariants: { variant: "info" },
});

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };

interface AlertProps extends VariantProps<typeof alertVariants> {
  title?: string;
  children?: ReactNode;
  /** e.g. a Retry button, shown under the message. */
  action?: ReactNode;
  className?: string;
}

export function Alert({ variant, title, children, action, className }: AlertProps) {
  const kind = variant ?? "info";
  const Icon = ICONS[kind];
  return (
    // Errors interrupt (role=alert); everything else is announced politely.
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), className)}
    >
      <Icon aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-foreground/90">{children}</div>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}
