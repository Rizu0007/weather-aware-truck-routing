import { useState } from "react";

import { Combobox } from "@/components/ui/combobox";
import type { FieldControlProps } from "@/components/ui/form-field";
import { usePlaceSearch } from "@/hooks/use-place-search";
import type { Place } from "@/types/api";

interface PlaceComboboxProps {
  control: FieldControlProps;
  value: Place | null;
  onChange: (place: Place | null) => void;
  disabled?: boolean;
}

/**
 * Place search for origin/destination. Typing clears the chosen place, so a trip can
 * only be planned from a place picked from the suggestions (it carries coordinates).
 * Parents remount it with a new `key` to load a different value.
 */
export function PlaceCombobox({ control, value, onChange, disabled }: PlaceComboboxProps) {
  const [text, setText] = useState(value?.label ?? "");
  const search = usePlaceSearch(value ? "" : text);

  return (
    <Combobox
      control={control}
      inputValue={text}
      onInputChange={(next) => {
        setText(next);
        if (value) onChange(null);
      }}
      options={search.places}
      showList={!value && search.active}
      getOptionKey={(place) => `${place.label}|${place.lat}|${place.lon}`}
      getOptionLabel={(place) => place.label}
      onSelect={(place) => {
        setText(place.label);
        onChange(place);
      }}
      loading={search.searching}
      error={search.error ?? undefined}
      emptyMessage="No places found in North America"
      placeholder="City or address"
      disabled={disabled}
    />
  );
}
