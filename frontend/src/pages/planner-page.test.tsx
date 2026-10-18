import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it, vi } from "vitest";

import type { MapViewProps } from "@/components/features/map/map-view";
import { createRoutes } from "@/routes/routes";
import { createQueryWrapper, jsonResponse, mockFetch } from "@/test/api";
import tripPlan from "@/test/fixtures/trip-plan.json";
import { tripSearchParams, type TripParams } from "@/utils/trip-params";

// MapLibre needs WebGL, which jsdom lacks; a stand-in shows what the map is given and
// lets tests "click" it, so the map <-> table wiring is still tested.
vi.mock("@/components/features/map/map-view", () => ({
  default: (props: MapViewProps) => (
    <div
      data-testid="map"
      data-selected={props.selectedId}
      data-active={props.activeMile ?? ""}
      data-hover={props.hoverMile ?? ""}
    >
      <button onClick={() => props.onSelectRoute("A")}>map: click route A</button>
      <button
        onClick={() =>
          props.onActivateCheckpoint(
            props.routes.find((r) => r.id === props.selectedId)!.checkpoints[2].mile,
          )
        }
      >
        map: click checkpoint 3
      </button>
    </div>
  ),
}));

const TRIP: TripParams = {
  origin: { label: "Dallas, Texas", lat: 32.7767, lon: -96.797 },
  destination: { label: "Houston, Texas", lat: 29.7604, lon: -95.3698 },
  departure: new Date(Date.now() + 2 * 3_600_000).toISOString(),
  loadLb: 35_000,
  intervalMi: 25,
};
const SHARED = `/?${tripSearchParams(TRIP).toString()}`;

function renderPlanner(url = "/", routes: Record<string, unknown> = {}) {
  const fetch = mockFetch({ "/api/health": { status: "ok" }, ...routes });
  const router = createMemoryRouter(createRoutes(), { initialEntries: [url] });
  render(<RouterProvider router={router} />, { wrapper: createQueryWrapper().wrapper });
  return { router, fetch };
}

const tripPosts = (fetch: ReturnType<typeof mockFetch>) =>
  fetch.mock.calls.filter(([input]) => input === "/api/trip-plans");

const errorBody = (message: string, extra: Record<string, unknown> = {}) => ({ message, extra });

describe("PlannerPage: planning", () => {
  it("invites a first trip, and the example plans Dallas to Houston", async () => {
    const { router, fetch } = renderPlanner("/", { "/api/trip-plans": tripPlan });

    await userEvent.click(await screen.findByRole("button", { name: "Try Dallas → Houston" }));

    expect(await screen.findByText("Take route B")).toBeInTheDocument();
    const search = new URLSearchParams(router.state.location.search);
    expect(search.get("fromName")).toBe("Dallas, Texas");
    expect(tripPosts(fetch)).toHaveLength(1);
    // The form collapses to a summary and focus moves to the results.
    expect(screen.queryByRole("form", { name: "Trip details" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Results" })).toHaveFocus();
  });

  it("plans the trip in a shared link straight away", async () => {
    const { fetch } = renderPlanner(SHARED, { "/api/trip-plans": tripPlan });

    expect(await screen.findByText("Take route B")).toBeInTheDocument();
    expect(
      screen.getByText(/Fewest No Travel miles: 0\.0 mi vs 50\.0 mi on route A/),
    ).toBeInTheDocument();
    expect(tripPosts(fetch)).toHaveLength(1);
  });

  it("Edit brings the form back, filled in", async () => {
    renderPlanner(SHARED, { "/api/trip-plans": tripPlan });
    await screen.findByText("Take route B");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("combobox", { name: "Origin" })).toHaveValue("Dallas, Texas");
  });

  it("shows skeletons and a status while planning", async () => {
    renderPlanner(SHARED, { "/api/trip-plans": () => new Promise<Response>(() => {}) });

    expect(
      await screen.findByText("Finding routes and checking the forecast along each one…"),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Results" })).toHaveAttribute("aria-busy", "true");
  });

  it("says it's still working when a plan takes over 10 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPlanner(SHARED, { "/api/trip-plans": () => new Promise<Response>(() => {}) });
      await screen.findByText("Finding routes and checking the forecast along each one…");

      await vi.advanceTimersByTimeAsync(10_000);

      expect(
        screen.getByText(/Still working: the free routing and weather servers are slow/),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("explains a broken link instead of guessing", async () => {
    renderPlanner("/?from=abc&load=9");

    expect(await screen.findByText("This link is incomplete")).toBeInTheDocument();
  });

  it("keeps Plan trip disabled until the server is awake", () => {
    mockFetch({ "/api/health": () => new Promise<Response>(() => {}) });
    const router = createMemoryRouter(createRoutes(), { initialEntries: ["/"] });
    render(<RouterProvider router={router} />, { wrapper: createQueryWrapper().wrapper });

    expect(screen.getByRole("button", { name: "Plan trip" })).toBeDisabled();
  });
});

describe("PlannerPage: results", () => {
  it("lists routes best first, with the recommended one selected", async () => {
    renderPlanner(SHARED, { "/api/trip-plans": tripPlan });
    await screen.findByText("Take route B");

    const routes = within(screen.getByRole("group", { name: "Routes, best first" })).getAllByRole(
      "radio",
    );
    expect(routes.map((radio) => radio.getAttribute("value"))).toEqual(["B", "A"]);
    expect(screen.getByRole("radio", { name: /Route B/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Route A/ })).toHaveAccessibleName(/Worst: No Travel/);
    expect(screen.getByText(/Only 2 distinct routes found/)).toBeInTheDocument();
  });

  it("selecting a route shows its checkpoints and is kept in the URL", async () => {
    const { router } = renderPlanner(SHARED, { "/api/trip-plans": tripPlan });
    await screen.findByText("Take route B");

    await userEvent.click(screen.getByRole("radio", { name: /Route A/ }));

    expect(screen.getByRole("heading", { name: /Checkpoints on route A/ })).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get("route")).toBe("A");
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("No Travel").length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/Wind 50 mph with a 35,000 lb load/).length).toBeGreaterThan(
      0,
    );
  });
});

describe("PlannerPage: errors", () => {
  it("puts server-side field errors on the form", async () => {
    renderPlanner(SHARED, {
      "/api/trip-plans": jsonResponse(
        errorBody("Invalid input.", { fields: { departure: ["Departure can't be in the past."] } }),
        400,
      ),
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Departure")).toHaveAccessibleDescription(
        "Departure can't be in the past.",
      ),
    );
  });

  it("no route: explains, without a retry", async () => {
    renderPlanner(SHARED, {
      "/api/trip-plans": jsonResponse(
        errorBody("No drivable route was found between these places."),
        422,
      ),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No road route between these places",
    );
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("beyond the forecast: offers the latest departure that works", async () => {
    const latest = "2026-10-31T05:00:00+00:00";
    const { router } = renderPlanner(SHARED, {
      "/api/trip-plans": jsonResponse(
        errorBody("Forecasts only reach about 15 days ahead. Choose an earlier departure.", {
          latest_departure: latest,
        }),
        422,
      ),
    });

    await userEvent.click(await screen.findByRole("button", { name: /Leave .* instead/ }));

    expect(new URLSearchParams(router.state.location.search).get("depart")).toBe(latest);
  });

  it("busy: counts down, then allows a retry", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let calls = 0;
      renderPlanner(SHARED, {
        "/api/trip-plans": () =>
          ++calls === 1
            ? jsonResponse(errorBody("Busy.", { provider: "open-meteo", retry_after: 3 }), 503)
            : jsonResponse(tripPlan),
      });

      const retry = await screen.findByRole("button", { name: "Retry in 3 s" });
      expect(retry).toBeDisabled();
      await vi.advanceTimersByTimeAsync(3_000);
      await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

      expect(await screen.findByText("Take route B")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("provider down: offers a retry", async () => {
    let calls = 0;
    renderPlanner(SHARED, {
      "/api/trip-plans": () =>
        ++calls === 1
          ? jsonResponse(
              errorBody("An external service is unavailable. Please try again shortly.", {
                provider: "osrm",
              }),
              502,
            )
          : jsonResponse(tripPlan),
    });

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Take route B")).toBeInTheDocument();
  });
});

describe("PlannerPage: map", () => {
  it("shows the routes on the map, with the selected one highlighted", async () => {
    renderPlanner(SHARED, { "/api/trip-plans": tripPlan });

    const map = await screen.findByTestId("map");
    expect(map).toHaveAttribute("data-selected", "B");
  });

  it("clicking a route on the map selects it, like its card", async () => {
    const { router } = renderPlanner(SHARED, { "/api/trip-plans": tripPlan });

    await userEvent.click(await screen.findByRole("button", { name: "map: click route A" }));

    expect(screen.getByRole("radio", { name: /Route A/ })).toBeChecked();
    expect(new URLSearchParams(router.state.location.search).get("route")).toBe("A");
  });

  it("clicking a checkpoint on the map highlights its table row", async () => {
    renderPlanner(SHARED, { "/api/trip-plans": tripPlan });

    await userEvent.click(await screen.findByRole("button", { name: "map: click checkpoint 3" }));

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[2]).toHaveAttribute("aria-current", "true");
  });

  it("table rows drive the map: hover enlarges the marker, the mile button opens its popup", async () => {
    renderPlanner(SHARED, { "/api/trip-plans": tripPlan });
    const row = (await screen.findAllByRole("row"))[2];

    await userEvent.hover(row);
    expect(screen.getByTestId("map")).toHaveAttribute("data-hover", "25");

    await userEvent.click(screen.getByRole("button", { name: "Mile 25: show on map" }));
    expect(screen.getByTestId("map")).toHaveAttribute("data-active", "25");
  });

  it("forgets the open checkpoint when another route is chosen", async () => {
    renderPlanner(SHARED, { "/api/trip-plans": tripPlan });
    await userEvent.click(await screen.findByRole("button", { name: "Mile 25: show on map" }));

    await userEvent.click(screen.getByRole("radio", { name: /Route A/ }));

    expect(screen.getByTestId("map")).toHaveAttribute("data-active", "");
  });
});
