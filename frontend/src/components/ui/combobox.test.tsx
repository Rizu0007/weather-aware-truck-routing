import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";

interface City {
  name: string;
}

const CITIES: City[] = [
  { name: "Dallas, Texas" },
  { name: "Dallas, Georgia" },
  { name: "Dalhart, Texas" },
];

function Harness({
  options = CITIES,
  loading = false,
  error,
  onSelect = () => {},
}: {
  options?: City[];
  loading?: boolean;
  error?: string;
  onSelect?: (city: City) => void;
}) {
  const [text, setText] = useState("");
  return (
    <FormField label="Origin">
      {(control) => (
        <Combobox
          control={control}
          inputValue={text}
          onInputChange={setText}
          options={text.length >= 3 ? options : []}
          showList={text.length >= 3}
          getOptionKey={(city) => city.name}
          getOptionLabel={(city) => city.name}
          onSelect={(city) => {
            setText(city.name);
            onSelect(city);
          }}
          loading={loading}
          error={error}
          emptyMessage="No places found"
        />
      )}
    </FormField>
  );
}

const input = () => screen.getByRole("combobox", { name: "Origin" });

describe("Combobox", () => {
  it("stays closed until enough text is typed", async () => {
    render(<Harness />);

    await userEvent.type(input(), "Da");
    expect(input()).toHaveAttribute("aria-expanded", "false");

    await userEvent.type(input(), "l");
    expect(input()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByText("3 results available")).toBeInTheDocument();
  });

  it("moves through options with the arrow keys and wraps", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Dal");

    await userEvent.keyboard("{ArrowDown}");
    expect(input()).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0].id);
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowUp}");
    expect(input()).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[2].id);
    expect(input()).toHaveFocus(); // focus never leaves the input
  });

  it("selects the highlighted option with Enter and closes", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await userEvent.type(input(), "Dal");

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledWith({ name: "Dallas, Georgia" });
    expect(input()).toHaveValue("Dallas, Georgia");
    expect(input()).toHaveAttribute("aria-expanded", "false");
  });

  it("does not submit a surrounding form when Enter picks an option", async () => {
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Harness />
      </form>,
    );
    await userEvent.type(input(), "Dal");

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("selects with the mouse", async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await userEvent.type(input(), "Dal");

    await userEvent.click(screen.getByRole("option", { name: "Dalhart, Texas" }));

    expect(onSelect).toHaveBeenCalledWith({ name: "Dalhart, Texas" });
  });

  it("closes on Escape, then clears on a second Escape", async () => {
    render(<Harness />);
    await userEvent.type(input(), "Dal");

    await userEvent.keyboard("{Escape}");
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).toHaveValue("Dal");

    await userEvent.keyboard("{Escape}");
    expect(input()).toHaveValue("");
  });

  it.each([
    [{ options: [] as City[] }, "No places found"],
    [{ options: [] as City[], loading: true }, "Searching…"],
    [{ options: [] as City[], error: "Search failed." }, "Search failed."],
  ])("shows an empty, loading or error row: %o", async (props, text) => {
    render(<Harness {...props} />);

    await userEvent.type(input(), "Dal");

    expect(screen.getByRole("listbox")).toHaveTextContent(text);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
