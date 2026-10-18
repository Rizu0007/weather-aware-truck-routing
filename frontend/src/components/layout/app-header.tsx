import { Link } from "react-router";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-4">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-control font-semibold tracking-tight"
          aria-label="Weather-Aware Truck Routing, home"
        >
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>
            Weather-Aware <span className="text-primary">Truck Routing</span>
          </span>
        </Link>
      </div>
    </header>
  );
}
