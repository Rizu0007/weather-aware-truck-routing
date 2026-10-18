import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("is a non-submitting button by default and handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Plan trip</Button>);

    const button = screen.getByRole("button", { name: "Plan trip" });
    await userEvent.click(button);

    expect(button).toHaveAttribute("type", "button");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled and busy while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Planning…
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Planning…" });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies variant and size classes, letting className override", () => {
    render(
      <Button variant="outline" size="sm" className="px-6">
        Edit
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).toHaveClass("border-input", "h-8", "px-6");
    expect(button).not.toHaveClass("px-3");
  });
});
