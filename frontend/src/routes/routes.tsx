import type { RouteObject } from "react-router";

import { AppLayout } from "@/components/layout/app-layout";
import { PlannerPage } from "@/pages/planner-page";
import { RouteErrorPage } from "@/pages/route-error-page";

export const pageRoutes: RouteObject[] = [
  // Eager: the planner is the first paint (LCP).
  { index: true, Component: PlannerPage },
  {
    path: "*",
    lazy: { Component: async () => (await import("@/pages/not-found-page")).NotFoundPage },
  },
];

export function createRoutes(pages: RouteObject[] = pageRoutes): RouteObject[] {
  return [
    {
      path: "/",
      Component: AppLayout,
      // Last resort if the layout itself fails.
      ErrorBoundary: RouteErrorPage,
      // Shown on a first visit while a lazy page's code loads (a few ms); matches the page background.
      HydrateFallback: () => <div aria-busy="true" className="min-h-dvh bg-background" />,
      // Pathless child: page errors render inside the layout, so header and footer stay.
      children: [{ ErrorBoundary: RouteErrorPage, children: pages }],
    },
  ];
}
