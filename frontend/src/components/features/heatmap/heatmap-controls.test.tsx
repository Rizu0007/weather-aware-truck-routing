import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeatmapControls } from "@/components/features/heatmap/heatmap-controls";
import { ApiError } from "@/api/client";
import heatmapFixture from "@/test/fixtures/heatmap.json";
import type { Heatmap } from "@/types/api";
import { describeWeather } from "@/utils/weather";

const HEATMAP: Heatmap = heatmapFixture;

function renderControls(props: Partial<Parameters<typeof HeatmapControls>[0]> = {}) {
  const handlers = {
    onHourChange: vi.fn<(hour: number) => void>(),
    onHourCommit: vi.fn<(hour: number) => void>(),
    onVisibleChange: vi.fn<(visible: boolean) => void>(),
    onRetry: vi.fn(),
  };
  render(
    <HeatmapControls
      heatmap={HEATMAP}
      loading={false}
      error={null}
      visible
      initialHour={0}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

/** The fixture grid with every hour of cell `i` at level `level(i)`. */
function withRisk(level: (i: number) => number): Heatmap {
  const cells = HEATMAP.cells.map((cell, i) => ({ ...cell, risk: cell.risk.map(() => level(i)) }));
  return { ...HEATMAP, cells };
}

const slider = () => screen.getByRole("slider", { name: "Forecast hour after departure" });

afterEach(() => vi.useRealTimers());

describe("HeatmapControls", () => {
  it("scrubs hour by hour with the keyboard and reads the time out", async () => {
    const { onHourChange, onHourCommit } = renderControls();
    expect(slider()).toHaveAttribute("aria-valuemax", "48");
    expect(slider()).toHaveAttribute("aria-valuetext", expect.stringMatching(/^\+0 h · /));

    slider().focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");

    expect(onHourChange).toHaveBeenLastCalledWith(2);
    expect(onHourCommit).toHaveBeenLastCalledWith(2);
    expect(slider()).toHaveAttribute("aria-valuetext", expect.stringMatching(/^\+2 h · /));
  });

  it("starts at the hour from the URL", () => {
    renderControls({ initialHour: 12 });

    expect(slider()).toHaveAttribute("aria-valuenow", "12");
  });

  it("plays through the hours, looping, and pausing keeps the hour", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { onHourChange, onHourCommit } = renderControls({ initialHour: 47 });

    await userEvent.click(screen.getByRole("button", { name: "Play through the hours" }));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(onHourChange).toHaveBeenLastCalledWith(48);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(onHourChange).toHaveBeenLastCalledWith(0); // loops

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onHourCommit).toHaveBeenLastCalledWith(0);
    onHourChange.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(onHourChange).not.toHaveBeenCalled();
  });

  it("can be hidden from the map, which disables scrubbing", async () => {
    const { onVisibleChange } = renderControls({ visible: false });

    await userEvent.click(screen.getByRole("checkbox", { name: "Show on map" }));

    expect(onVisibleChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Play through the hours" })).toBeDisabled();
  });

  it("shows a legend with every level named", () => {
    renderControls();

    expect(screen.getByRole("list", { name: "Risk colours" })).toHaveTextContent(
      "Low (clear)ModerateHighSevereNo Travel",
    );
    expect(screen.getByRole("list", { name: "What moves on the map" })).toHaveTextContent(
      "Wind 25+ mphRain 0.1+ in/hrSnow 0.5+ in/hr",
    );
  });

  it("the animation switch follows the heatmap: off and disabled when the heatmap is hidden", async () => {
    const onMotionChange = vi.fn<(motion: boolean) => void>();
    const { rerender } = render(
      <HeatmapControls
        heatmap={HEATMAP}
        loading={false}
        error={null}
        visible
        onVisibleChange={() => {}}
        motion
        onMotionChange={onMotionChange}
        initialHour={0}
        onHourChange={() => {}}
        onHourCommit={() => {}}
        onRetry={() => {}}
      />,
    );
    const toggle = screen.getByRole("checkbox", { name: "Moving wind & rain" });

    await userEvent.click(toggle);
    expect(onMotionChange).toHaveBeenCalledWith(false);

    rerender(
      <HeatmapControls
        heatmap={HEATMAP}
        loading={false}
        error={null}
        visible={false}
        onVisibleChange={() => {}}
        motion
        onMotionChange={onMotionChange}
        initialHour={0}
        onHourChange={() => {}}
        onHourCommit={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(toggle).toBeDisabled();
  });

  it("says when an hour is all Low, since Low cells are clear on the map", () => {
    renderControls({ heatmap: withRisk(() => 0) });

    expect(screen.getByText(/^All Low along the corridor/)).toBeInTheDocument();
  });

  it("counts the areas at Moderate or worse for the chosen hour", () => {
    renderControls({ heatmap: withRisk((i) => (i < 2 ? 2 : 0)) });

    expect(screen.getByText(/^2 areas Moderate or worse/)).toBeInTheDocument();
  });

  it("loading and error states", async () => {
    const { rerender } = render(
      <HeatmapControls
        heatmap={undefined}
        loading
        error={null}
        visible
        initialHour={0}
        onRetry={() => {}}
        onVisibleChange={() => {}}
        onHourChange={() => {}}
        onHourCommit={() => {}}
      />,
    );
    expect(screen.getByText("Loading the forecast grid…")).toBeInTheDocument();

    const onRetry = vi.fn();
    rerender(
      <HeatmapControls
        heatmap={undefined}
        loading={false}
        error={new ApiError("busy", "The weather service is busy.", 503)}
        visible
        initialHour={0}
        onRetry={onRetry}
        onVisibleChange={() => {}}
        onHourChange={() => {}}
        onHourCommit={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The weather service is busy.");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("describeWeather", () => {
  it("names what moves on the map, and where", () => {
    expect(describeWeather({ wind: 4, rain: 1, snow: 0 })).toBe(
      "wind 25+ mph in 4 areas · rain in 1 area",
    );
    expect(describeWeather({ wind: 0, rain: 0, snow: 2 })).toBe("snow in 2 areas");
    expect(describeWeather({ wind: 0, rain: 0, snow: 0 })).toBe("no strong wind, rain or snow");
  });
});
