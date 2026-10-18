import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripForm } from "@/components/features/trip-form/trip-form";
import { createQueryWrapper, mockFetch } from "@/test/api";
import type { Place } from "@/types/api";
import { toLocalInputValue } from "@/utils/format";
import type { TripParams } from "@/utils/trip-params";

const PLACES: Record<string, Place[]> = {
  dal: [
    { label: "Dallas, Texas", lat: 32.7762719, lon: -96.7968559 },
    { label: "Dallas, Georgia", lat: 33.9237141, lon: -84.8407 },
  ],
  hou: [{ label: "Houston, Texas", lat: 29.7589382, lon: -95.3676974 }],
};

beforeEach(() => {
  mockFetch({
    "/api/places": (url: string) => {
      const query = new URL(url, "http://test").searchParams.get("q")!.toLowerCase().slice(0, 3);
      return new Response(JSON.stringify(PLACES[query] ?? []), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });
});

function renderForm(props: Partial<Parameters<typeof TripForm>[0]> = {}) {
  const onSubmit = vi.fn<(trip: TripParams) => void>();
  render(<TripForm onSubmit={onSubmit} {...props} />, { wrapper: createQueryWrapper().wrapper });
  return { onSubmit };
}

async function choosePlace(label: string, query: string, option: string) {
  await userEvent.type(screen.getByRole("combobox", { name: label }), query);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

const submit = () => userEvent.click(screen.getByRole("button", { name: "Plan trip" }));

describe("TripForm", () => {
  it("shows every missing field on submit and focuses the first", async () => {
    const { onSubmit } = renderForm();
    await userEvent.clear(screen.getByLabelText("Departure"));

    await submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Origin" })).toHaveAccessibleDescription(
      "Choose a starting place from the suggestions.",
    );
    expect(screen.getByRole("combobox", { name: "Destination" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Load (lb)")).toHaveAccessibleDescription(
      "Enter the load weight.",
    );
    expect(screen.getByRole("combobox", { name: "Origin" })).toHaveFocus();
  });

  it("submits a complete trip with the departure in UTC", async () => {
    const { onSubmit } = renderForm();
    await choosePlace("Origin", "Dal", "Dallas, Texas");
    await choosePlace("Destination", "Hou", "Houston, Texas");
    fireEvent.change(screen.getByLabelText("Departure"), { target: { value: "2099-01-05T08:00" } });
    await userEvent.type(screen.getByLabelText("Load (lb)"), "35,000");
    await userEvent.selectOptions(screen.getByLabelText("Weather every"), "25");

    // 2099 is beyond the forecast window: the form says so instead of submitting.
    await submit();
    expect(screen.getByLabelText("Departure")).toHaveAccessibleDescription(
      "Forecasts only cover the next 12 days.",
    );

    const tomorrow = new Date(Date.now() + 24 * 3_600_000);
    tomorrow.setHours(8, 0, 0, 0);
    const local = toLocalInputValue(tomorrow);
    fireEvent.change(screen.getByLabelText("Departure"), { target: { value: local } });
    await submit();

    expect(onSubmit).toHaveBeenCalledWith({
      origin: PLACES.dal[0],
      destination: PLACES.hou[0],
      departure: new Date(local).toISOString(),
      loadLb: 35_000,
      intervalMi: 25,
    });
  });

  it("forgets the chosen place when its text is edited", async () => {
    renderForm();
    await choosePlace("Origin", "Dal", "Dallas, Texas");

    await userEvent.type(screen.getByRole("combobox", { name: "Origin" }), "x");
    await submit();

    expect(screen.getByRole("combobox", { name: "Origin" })).toHaveAccessibleDescription(
      "Choose a starting place from the suggestions.",
    );
  });

  it("clears a field's error as soon as it changes", async () => {
    renderForm();
    await submit();
    expect(screen.getByLabelText("Load (lb)")).toHaveAttribute("aria-invalid", "true");

    await userEvent.type(screen.getByLabelText("Load (lb)"), "4");

    expect(screen.getByLabelText("Load (lb)")).toHaveAttribute("aria-invalid", "false");
  });

  it("swaps origin and destination", async () => {
    renderForm();
    await choosePlace("Origin", "Dal", "Dallas, Texas");
    await choosePlace("Destination", "Hou", "Houston, Texas");

    await userEvent.click(screen.getByRole("button", { name: "Swap origin and destination" }));

    expect(screen.getByRole("combobox", { name: "Origin" })).toHaveValue("Houston, Texas");
    expect(screen.getByRole("combobox", { name: "Destination" })).toHaveValue("Dallas, Texas");
  });

  it("pre-fills from a trip, e.g. a shared link", () => {
    renderForm({
      initialTrip: {
        origin: PLACES.dal[0],
        destination: PLACES.hou[0],
        departure: "2026-10-20T19:00:00.000Z",
        loadLb: 42_000,
        intervalMi: 50,
      },
    });

    expect(screen.getByRole("combobox", { name: "Origin" })).toHaveValue("Dallas, Texas");
    expect(screen.getByLabelText("Departure")).toHaveValue("2026-10-20T14:00"); // Chicago
    expect(screen.getByLabelText("Load (lb)")).toHaveValue("42000");
    expect(screen.getByLabelText("Weather every")).toHaveValue("50");
  });

  it("shows field errors returned by the server", () => {
    renderForm({ serverErrors: { load: "Ensure this value is less than or equal to 80000." } });

    expect(screen.getByLabelText("Load (lb)")).toHaveAccessibleDescription(
      "Ensure this value is less than or equal to 80000.",
    );
  });

  it("can't be submitted while disabled or planning", async () => {
    const { rerender } = render(<TripForm onSubmit={() => {}} submitDisabled />, {
      wrapper: createQueryWrapper().wrapper,
    });
    expect(screen.getByRole("button", { name: "Plan trip" })).toBeDisabled();

    rerender(<TripForm onSubmit={() => {}} submitting />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Planning…" })).toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );
  });

  it("shows the browser's time zone next to the departure", () => {
    renderForm();

    expect(screen.getByLabelText("Departure")).toHaveAccessibleDescription(
      /Your time zone: C[DS]T \(America\/Chicago\)/,
    );
  });
});
