import { Link } from "react-router";

import { buttonVariants } from "@/components/ui/button-variants";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <title>Page not found · Weather-Aware Truck Routing</title>
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page doesn't exist</h1>
      <p className="text-muted-foreground">The link may be old or mistyped.</p>
      <Link to="/" className={buttonVariants({ size: "lg" })}>
        Plan a trip
      </Link>
    </div>
  );
}
