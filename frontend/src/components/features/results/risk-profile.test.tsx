import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RiskInfoPanel } from "@/components/features/results/risk-info-panel";
import { RiskProfile } from "@/components/features/results/risk-profile";
import tripPlan from "@/test/fixtures/trip-plan.json";
import type { TripPlan } from "@/types/api";
import { describeRisk } from "@/utils/describe-risk";

const PLAN = tripPlan as TripPlan;
const ROUTE_A = PLAN.routes.find((route) => route.id === "A")!;
const ROUTE_B = PLAN.routes.find((route) => route.id === "B")!;

function renderProfile() {
  const onHover = vi.fn<(mile: number | null) => void>();
  const onActivate = vi.fn<(mile: number) => void>();
  const { container } = render(
    <RiskProfile route={ROUTE_A} activeMile={null} onHover={onHover} onActivate={onActivate} />,
  );
  const svg = container.querySelector("svg")!;
  // jsdom has no layout: give the strip a width of 1000 px so x = mile / total * 1000.
  svg.getBoundingClientRect = () => ({ left: 0, width: 1000, top: 0, height: 64 }) as DOMRect;
  return { svg, onHover, onActivate, container };
}

const xFor = (mile: number) => (mile / ROUTE_A.distance_mi) * 1000;

describe("RiskProfile", () => {
  it("has one bar per checkpoint stretch, taller where the risk is higher", () => {
    const { container } = renderProfile();

    const bars = [...container.querySelectorAll("rect")];
    expect(bars).toHaveLength(ROUTE_A.checkpoints.length);
    const heightOf = (level: string) =>
      Number(bars[ROUTE_A.checkpoints.findIndex((c) => c.level === level)].getAttribute("height"));
    expect(heightOf("no_travel")).toBeGreaterThan(heightOf("low"));
    expect(bars[0]).toHaveClass("fill-risk-low");
  });

  it("describes the route's risk in words for screen readers", () => {
    renderProfile();

    expect(screen.getByRole("img")).toHaveAccessibleName(describeRisk(ROUTE_A));
    expect(describeRisk(ROUTE_A)).toMatch(
      /^Risk along route A: Low for 189 mi; No Travel for 50 mi, from mile \d+ to \d+\.$/,
    );
    expect(describeRisk(ROUTE_B)).toBe("Risk along route B: Low for all 279 mi.");
  });

  it("pointing at the strip reports that checkpoint, and clicking opens it", async () => {
    const { svg, onHover, onActivate } = renderProfile();
    const stormy = ROUTE_A.checkpoints.find((c) => c.level === "no_travel")!;

    fireEvent.pointerMove(svg, { clientX: xFor(stormy.mile) });
    expect(onHover).toHaveBeenLastCalledWith(stormy.mile);
    expect(
      screen.getByText(new RegExp(`Mile ${Math.round(stormy.mile)} · No Travel`)),
    ).toBeInTheDocument();

    fireEvent.click(svg, { clientX: xFor(stormy.mile) });
    expect(onActivate).toHaveBeenCalledWith(stormy.mile);

    fireEvent.pointerLeave(svg);
    expect(onHover).toHaveBeenLastCalledWith(null);
    await userEvent.unhover(svg);
  });
});

describe("RiskInfoPanel", () => {
  it("opens to show the brief's thresholds, load rules and ranking order", async () => {
    render(<RiskInfoPanel />);
    expect(screen.queryByRole("table")).not.toBeVisible();

    await userEvent.click(screen.getByText("How risk is scored"));

    expect(
      screen.getByRole("table", { name: "Risk level for each weather condition" }),
    ).toBeVisible();
    expect(
      screen.getByText("Wind 45–54 mph with more than 30,000 lb: No Travel."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toContain(
      "Fewest No Travel miles",
    );
  });
});
