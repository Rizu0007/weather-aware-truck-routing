import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeatmapControls } from "@/components/features/heatmap/heatmap-controls";
import { ApiError } from "@/api/client";
import heatmapFixture from "@/test/fixtures/heatmap.json";
import type { Heatmap } from "@/types/api";

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
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(onHourChange).toHaveBeenLastCalledWith(48);
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(onHourChange).toHaveBeenLastCalledWith(0); // loops

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onHourCommit).toHaveBeenLastCalledWith(0);
    onHourChange.mockClear();
    await act(() => vi.advanceTimersByTimeAsync(1_200));
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
      "LowModerateHighSevereNo Travel",
    );
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
