import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CheckpointTable } from "@/components/features/results/checkpoint-table";
import { RiskStrip } from "@/components/features/results/risk-strip";
import tripPlan from "@/test/fixtures/trip-plan.json";
import type { PlannedRoute, TripPlan } from "@/types/api";

const PLAN = tripPlan as TripPlan;
const ROUTE_A = PLAN.routes.find((route) => route.id === "A")!;

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

  it("shows a dash for missing forecast values", () => {
    const route: PlannedRoute = {
      ...ROUTE_A,
      checkpoints: [{ ...ROUTE_A.checkpoints[0], wind_mph: null }],
    };
    render(<CheckpointTable route={route} />);

    expect(screen.getByTitle("No forecast data")).toHaveTextContent("—");
  });
});
