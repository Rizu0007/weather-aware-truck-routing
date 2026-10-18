import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it, vi } from "vitest";

import { createRoutes, pageRoutes } from "@/routes/routes";

function renderAt(path: string, routeTable: RouteObject[] = createRoutes()) {
  const router = createMemoryRouter(routeTable, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

function BrokenPage(): never {
  throw new Error("render failed");
}

describe("routes", () => {
  it("renders the planner inside the layout", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { level: 1, name: "Plan a trip" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", { name: "Open-Meteo.com" }),
    ).toBeInTheDocument();
  });

  it("offers a skip link to the main content", () => {
    renderAt("/");

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });

  it("shows a lazy 404 page for unknown paths, with a way back", async () => {
    const router = renderAt("/no/such/page");

    expect(
      await screen.findByRole("heading", { name: "This page doesn't exist" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Page not found · Weather-Aware Truck Routing");

    await userEvent.click(screen.getByRole("link", { name: "Plan a trip" }));
    expect(router.state.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "Plan a trip" })).toBeInTheDocument();
  });

  it("catches a page error inside the layout, keeping header and footer", () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // React logs the caught error

    renderAt("/broken", createRoutes([{ path: "broken", Component: BrokenPage }, ...pageRoutes]));

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("the header logo links home", async () => {
    const router = renderAt("/no/such/page");
    await screen.findByRole("heading", { name: "This page doesn't exist" });

    await userEvent.click(screen.getByRole("link", { name: "Weather-Aware Truck Routing, home" }));

    expect(router.state.location.pathname).toBe("/");
  });
});
