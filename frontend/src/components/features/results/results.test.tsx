import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CheckpointTable } from "@/components/features/results/checkpoint-table";
import { Recommendation } from "@/components/features/results/recommendation";
import { RiskStrip } from "@/components/features/results/risk-strip";
import { RouteCardList } from "@/components/features/results/route-card-list";
import tripPlan from "@/test/fixtures/trip-plan.json";
import type { PlannedRoute, TripPlan } from "@/types/api";
import { formatClock, formatDuration } from "@/utils/format";

const PLAN = tripPlan as TripPlan;
const ROUTE_A = PLAN.routes.find((route) => route.id === "A")!;

describe("Recommendation", () => {
  it("says what the recommended route avoids: the worst weather on another route", () => {
    render(<Recommendation plan={PLAN} />);

    const storm = ROUTE_A.checkpoints.find((c) => c.level === "no_travel")!;
    expect(
      screen.getByText(
        `Avoids wind 50 mph with a 35,000 lb load on route A at mile ${Math.round(storm.mile)}, ` +
          `${formatClock(storm.eta)}.`,
      ),
    ).toBeInTheDocument();
  });

  it("says nothing extra when no route is worse than the recommended one", () => {
    const calm = { ...PLAN, routes: PLAN.routes.filter((route) => route.id === "B") };
    render(<Recommendation plan={calm} />);

    expect(screen.queryByText(/^Avoids/)).not.toBeInTheDocument();
  });
});

describe("RouteCardList", () => {
  const renderList = (selectedId: string) =>
    render(
      <RouteCardList
        routes={PLAN.routes}
        recommendedId={PLAN.recommended_route_id}
        selectedId={selectedId}
        onSelect={() => {}}
      />,
    );

  it("shows how much longer each route takes than the recommended one", () => {
    renderList("B");
    const best = PLAN.routes.find((route) => route.id === PLAN.recommended_route_id)!;
    const gap = Math.abs(ROUTE_A.duration_s - best.duration_s);
    const sign = ROUTE_A.duration_s > best.duration_s ? "+" : "−";

    expect(screen.getByRole("radio", { name: /Route A/ })).toHaveAccessibleName(
      new RegExp(`${sign}${formatDuration(gap)}`),
    );
    expect(screen.getByRole("radio", { name: /Route B/ })).toHaveAccessibleName(/Best/);
  });

  it("says which route is on the map, on that card only", () => {
    renderList("A");

    expect(screen.getByRole("radio", { name: /Route A/ })).toHaveAccessibleName(/On the map/);
    expect(screen.getByRole("radio", { name: /Route B/ })).not.toHaveAccessibleName(/On the map/);
  });
});

describe("RiskStrip", () => {
  it("labels only the levels the route has, with their miles", () => {
    render(<RiskStrip summary={ROUTE_A.summary} />);

    const labels = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(labels).toEqual(["Low 189 mi", "No Travel 50 mi"]);
  });

  it("sizes each bar by its share of the miles", () => {
    const { container } = render(<RiskStrip summary={ROUTE_A.summary} />);

    const bars = container.querySelectorAll<HTMLElement>("[aria-hidden='true'] > div");
    expect(bars).toHaveLength(2);
    const widths = [...bars].map((bar) => parseFloat(bar.style.width));
    expect(widths[0] + widths[1]).toBeCloseTo(100);
    expect(widths[1]).toBeCloseTo((50 / 238.7) * 100, 0);
  });
});

describe("CheckpointTable", () => {
  it("has a row per checkpoint, with level names, not just colours", () => {
    render(<CheckpointTable route={ROUTE_A} />);

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(ROUTE_A.checkpoints.length);
    expect(within(rows[0]).getByText("Low")).toBeInTheDocument();
  });

  it("puts Risk right after ETA, so it's visible on a phone without scrolling", () => {
    render(<CheckpointTable route={ROUTE_A} />);

    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers.slice(0, 3)).toEqual(["Mile", expect.stringMatching(/^ETA/), "Risk"]);
  });

  it("shows a dash for missing forecast values", () => {
    const route: PlannedRoute = {
      ...ROUTE_A,
      checkpoints: [{ ...ROUTE_A.checkpoints[0], wind_mph: null }],
    };
    render(<CheckpointTable route={route} />);

    expect(screen.getByTitle("No forecast data")).toHaveTextContent("—");
  });

  it("highlights a row's marker on keyboard focus, as on hover", () => {
    const onHover = vi.fn();
    render(<CheckpointTable route={ROUTE_A} onActivate={() => {}} onHover={onHover} />);
    const mile = ROUTE_A.checkpoints[1].mile;
    const button = screen.getByRole("button", { name: `Mile ${Math.round(mile)}: show on map` });

    act(() => button.focus());
    expect(onHover).toHaveBeenLastCalledWith(mile);
    act(() => button.blur());
    expect(onHover).toHaveBeenLastCalledWith(null);
  });
});
