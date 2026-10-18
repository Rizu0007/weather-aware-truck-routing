import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { RISK_LABELS, RISK_LEVELS } from "@/constants/risk";

describe("Alert", () => {
  it("interrupts for errors and shows an action", () => {
    render(
      <Alert variant="error" title="Weather service unavailable" action={<button>Retry</button>}>
        Please try again shortly.
      </Alert>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Weather service unavailable");
    expect(alert).toHaveTextContent("Please try again shortly.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it.each(["info", "success", "warning"] as const)("announces %s politely", (variant) => {
    render(<Alert variant={variant} title="Only 2 distinct routes found" />);

    expect(screen.getByRole("status")).toHaveTextContent("Only 2 distinct routes found");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Badge", () => {
  it.each(RISK_LEVELS)("has a %s risk variant that shows its label", (level) => {
    render(<Badge variant={level}>{RISK_LABELS[level]}</Badge>);

    expect(screen.getByText(RISK_LABELS[level])).toHaveClass("text-risk-foreground");
  });
});

describe("loading placeholders", () => {
  it("hides skeletons from screen readers", () => {
    const { container } = render(<Skeleton className="h-24" />);

    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("announces a labelled spinner", () => {
    render(<Spinner label="Loading heatmap" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading heatmap");
  });
});

it("Card renders a titled section", () => {
  render(
    <Card>
      <CardHeader>
        <CardTitle>Route A</CardTitle>
      </CardHeader>
      <CardContent>238 mi</CardContent>
    </Card>,
  );

  expect(screen.getByRole("heading", { name: "Route A" })).toBeInTheDocument();
});
