import { Outlet } from "react-router";

import { AppFooter } from "@/components/layout/app-footer";
import { AppHeader } from "@/components/layout/app-header";

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-primary px-3 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppHeader />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
}
