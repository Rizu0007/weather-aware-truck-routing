import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { BackendStatusBanner } from "@/components/layout/backend-status-banner";

it.each([
  ["checking", "Connecting to the server"],
  ["waking", "Waking the server"],
] as const)("announces the %s state", (status, text) => {
  render(<BackendStatusBanner status={status} />);

  expect(screen.getByRole("status")).toHaveTextContent(text);
});

it("disappears once the server is ready", () => {
  const { container } = render(<BackendStatusBanner status="ready" />);

  expect(container).toBeEmptyDOMElement();
});
