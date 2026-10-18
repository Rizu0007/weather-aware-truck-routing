import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it } from "vitest";

import { createRoutes } from "@/routes/routes";
import { createQueryWrapper, jsonResponse, mockFetch } from "@/test/api";
import tripPlan from "@/test/fixtures/trip-plan.json";
import { tripSearchParams, type TripParams } from "@/utils/trip-params";

const TRIP: TripParams = {
  origin: { label: "Dallas, Texas", lat: 32.7767, lon: -96.797 },
  destination: { label: "Houston, Texas", lat: 29.7604, lon: -95.3698 },
  departure: new Date(Date.now() + 2 * 3_600_000).toISOString(),
  loadLb: 35_000,
  intervalMi: 25,
};

function renderPlanner(url = "/", routes: Record<string, unknown> = {}) {
  const fetch = mockFetch({ "/api/health": { status: "ok" }, ...routes });
  const router = createMemoryRouter(createRoutes(), { initialEntries: [url] });
  render(<RouterProvider router={router} />, { wrapper: createQueryWrapper().wrapper });
  return { router, fetch };
}

const tripPosts = (fetch: ReturnType<typeof mockFetch>) =>
  fetch.mock.calls.filter(([input]) => input === "/api/trip-plans");

describe("PlannerPage", () => {
  it("invites a first trip, and the example plans Dallas to Houston", async () => {
    const { router, fetch } = renderPlanner("/", { "/api/trip-plans": tripPlan });

    await userEvent.click(await screen.findByRole("button", { name: "Try Dallas → Houston" }));

    expect(await screen.findByText(/Recommended: route B/)).toBeInTheDocument();
    const search = new URLSearchParams(router.state.location.search);
    expect(search.get("fromName")).toBe("Dallas, Texas");
    expect(search.get("load")).toBe("35000");
    expect(tripPosts(fetch)).toHaveLength(1);
    // The form now shows the trip from the URL.
    expect(screen.getByRole("combobox", { name: "Destination" })).toHaveValue("Houston, Texas");
  });

  it("plans the trip in a shared link straight away", async () => {
    const { fetch } = renderPlanner(`/?${tripSearchParams(TRIP).toString()}`, {
      "/api/trip-plans": tripPlan,
    });

    expect(await screen.findByText(/Recommended: route B/)).toBeInTheDocument();
    expect(screen.getByLabelText("Load (lb)")).toHaveValue("35000");
    expect(tripPosts(fetch)).toHaveLength(1);
  });

  it("explains a broken link instead of guessing", async () => {
    renderPlanner("/?from=abc&load=9");

    expect(await screen.findByText("This link is incomplete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Dallas → Houston" })).toBeInTheDocument();
  });

  it("puts server-side field errors on the form", async () => {
    renderPlanner(`/?${tripSearchParams(TRIP).toString()}`, {
      "/api/trip-plans": jsonResponse(
        {
          message: "Invalid input.",
          extra: { fields: { departure: ["Departure can't be in the past."] } },
        },
        400,
      ),
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Departure")).toHaveAccessibleDescription(
        "Departure can't be in the past.",
      ),
    );
  });

  it("shows other plan errors as an alert", async () => {
    renderPlanner(`/?${tripSearchParams(TRIP).toString()}`, {
      "/api/trip-plans": jsonResponse(
        { message: "No drivable route was found between these places.", extra: {} },
        422,
      ),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No drivable route was found between these places.",
    );
  });

  it("keeps Plan trip disabled until the server is awake", () => {
    mockFetch({ "/api/health": () => new Promise<Response>(() => {}) });
    const router = createMemoryRouter(createRoutes(), { initialEntries: ["/"] });
    render(<RouterProvider router={router} />, { wrapper: createQueryWrapper().wrapper });

    expect(screen.getByRole("button", { name: "Plan trip" })).toBeDisabled();
  });
});
