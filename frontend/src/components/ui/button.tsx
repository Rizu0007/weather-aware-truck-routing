import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/utils/cn";

interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
