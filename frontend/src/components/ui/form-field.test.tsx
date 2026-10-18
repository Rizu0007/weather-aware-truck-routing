import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

describe("FormField", () => {
  it("labels the control and describes it with the hint", () => {
    render(
      <FormField label="Load (lb)" hint="Up to 80,000 lb">
        {(control) => <Input {...control} />}
      </FormField>,
    );

    const input = screen.getByLabelText("Load (lb)");
    expect(input).toHaveAccessibleDescription("Up to 80,000 lb");
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("replaces the hint with the error and marks the control invalid", () => {
    render(
      <FormField label="Load (lb)" hint="Up to 80,000 lb" error="Enter a whole number.">
        {(control) => <Input {...control} />}
      </FormField>,
    );

    const input = screen.getByLabelText("Load (lb)");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a whole number.");
    expect(screen.queryByText("Up to 80,000 lb")).not.toBeInTheDocument();
  });

  it("works with the native Select", () => {
    render(
      <FormField label="Weather every">
        {(control) => (
          <Select {...control} defaultValue="25">
            <option value="10">10 miles</option>
            <option value="25">25 miles</option>
          </Select>
        )}
      </FormField>,
    );

    expect(screen.getByLabelText("Weather every")).toHaveValue("25");
  });
});
