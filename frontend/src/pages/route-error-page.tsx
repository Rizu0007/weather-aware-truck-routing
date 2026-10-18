import { isRouteErrorResponse, Link, useRouteError } from "react-router";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";

/** Route error boundary: an unexpected render error, or a thrown route response. */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (import.meta.env.DEV) console.error(error);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center"
    >
      <title>Something went wrong · Weather-Aware Truck Routing</title>
      <h1 className="text-2xl font-semibold tracking-tight">
        {notFound ? "This page doesn't exist" : "Something went wrong"}
      </h1>
      <p className="text-muted-foreground">
        {notFound
          ? "The link may be old or mistyped."
          : "The page hit an unexpected error. Reloading usually fixes it."}
      </p>
      <div className="flex gap-2">
        {!notFound && <Button onClick={() => window.location.reload()}>Reload</Button>}
        <Link to="/" className={buttonVariants({ variant: notFound ? "primary" : "outline" })}>
          Go to the planner
        </Link>
      </div>
    </div>
  );
}
