import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { Slider } from "@/components/ui/slider";

it("is a labelled slider that moves with the keyboard", async () => {
  const onValueChange = vi.fn();
  render(
    <Slider
      aria-label="Forecast hour"
      min={0}
      max={48}
      step={1}
      defaultValue={[6]}
      onValueChange={onValueChange}
    />,
  );

  const thumb = screen.getByRole("slider", { name: "Forecast hour" });
  expect(thumb).toHaveAttribute("aria-valuenow", "6");
  expect(thumb).toHaveAttribute("aria-valuemax", "48");

  thumb.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(onValueChange).toHaveBeenLastCalledWith([7]);

  await userEvent.keyboard("{End}");
  expect(onValueChange).toHaveBeenLastCalledWith([48]);
});
