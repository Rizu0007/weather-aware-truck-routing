import { useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/utils/cn";

export interface FieldControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  /** Receives the props that tie the control to its label, hint and error. */
  children: (control: FieldControlProps) => ReactNode;
}

export function FormField({ label, hint, error, className, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint && !error ? `${id}-hint` : undefined; // the error replaces the hint
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hintId && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive-inline">
          {error}
        </p>
      )}
    </div>
  );
}
