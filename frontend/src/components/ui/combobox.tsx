import { useId, useState, type KeyboardEvent } from "react";

import type { FieldControlProps } from "@/components/ui/form-field";
import { fieldClassName } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/utils/cn";

interface ComboboxProps<T> {
  /** id/aria props from FormField, so the label and error text are wired up. */
  control: FieldControlProps;
  inputValue: string;
  onInputChange: (value: string) => void;
  options: T[];
  getOptionKey: (option: T) => string;
  getOptionLabel: (option: T) => string;
  onSelect: (option: T) => void;
  /** Hide the list (e.g. until enough characters are typed). */
  showList?: boolean;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Editable combobox with a listbox popup, following the WAI-ARIA APG pattern:
 * focus stays in the input and aria-activedescendant points at the highlighted option.
 * Options come from the caller, so it works with server-side search.
 */
export function Combobox<T>({
  control,
  inputValue,
  onInputChange,
  options,
  getOptionKey,
  getOptionLabel,
  onSelect,
  showList = true,
  loading = false,
  error,
  emptyMessage = "No results",
  placeholder,
  disabled,
}: ComboboxProps<T>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const expanded = open && showList;
  const active = expanded && highlighted >= 0 && highlighted < options.length ? highlighted : -1;
  const optionId = (index: number) => `${listId}-option-${index}`;

  function choose(option: T) {
    onSelect(option);
    setOpen(false);
    setHighlighted(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        setOpen(true);
        if (options.length === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlighted((index) => {
          if (index < 0) return step === 1 ? 0 : options.length - 1;
          return (index + step + options.length) % options.length;
        });
        break;
      }
      case "Enter":
        if (active >= 0) {
          event.preventDefault(); // don't submit the form while choosing
          choose(options[active]);
        }
        break;
      case "Escape":
        if (expanded) {
          event.preventDefault();
          setOpen(false);
        } else {
          onInputChange("");
        }
        break;
    }
  }

  const status = loading
    ? "Searching"
    : error
      ? error
      : options.length === 0
        ? emptyMessage
        : `${options.length} result${options.length === 1 ? "" : "s"} available`;

  return (
    <div className="relative">
      <input
        {...control}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          onInputChange(event.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={cn(fieldClassName, loading && "pr-9")}
      />
      {loading && (
        <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />
      )}

      <ul
        id={listId}
        role="listbox"
        hidden={!expanded}
        className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-control border border-border bg-surface-raised py-1 text-sm shadow-card"
      >
        {options.map((option, index) => (
          <li
            key={getOptionKey(option)}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            // mousedown, not click: it fires before the input's blur closes the list.
            onMouseDown={(event) => {
              event.preventDefault();
              choose(option);
            }}
            onMouseMove={() => setHighlighted(index)}
            className={cn(
              "cursor-pointer px-3 py-2",
              index === active && "bg-secondary text-secondary-foreground",
            )}
          >
            {getOptionLabel(option)}
          </li>
        ))}
        {options.length === 0 && (
          <li
            role="presentation"
            className={cn("px-3 py-2", error ? "text-destructive-inline" : "text-muted-foreground")}
          >
            {loading ? "Searching…" : (error ?? emptyMessage)}
          </li>
        )}
      </ul>

      <span aria-live="polite" className="sr-only">
        {expanded ? status : ""}
      </span>
    </div>
  );
}
