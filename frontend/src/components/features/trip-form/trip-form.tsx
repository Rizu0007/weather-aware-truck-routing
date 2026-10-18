import { ArrowDownUp } from "lucide-react";
import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import { PlaceCombobox } from "@/components/features/trip-form/place-combobox";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DEFAULT_INTERVAL, INTERVALS } from "@/constants/limits";
import type { Interval } from "@/types/api";
import { describeTimeZone, nextFullHour, toLocalInputValue } from "@/utils/format";
import type { TripParams } from "@/utils/trip-params";
import { validateTrip, type TripErrors, type TripFormValues } from "@/utils/validate-trip";

interface TripFormProps {
  /** Pre-fills the form, e.g. from a shared link. */
  initialTrip?: TripParams | null;
  onSubmit: (trip: TripParams) => void;
  /** Field errors from a 400 response. */
  serverErrors?: TripErrors;
  submitting?: boolean;
  /** e.g. while the backend is waking up. */
  submitDisabled?: boolean;
}

function initialValues(trip: TripParams | null | undefined): TripFormValues {
  if (!trip) {
    return {
      origin: null,
      destination: null,
      departure: toLocalInputValue(nextFullHour()),
      load: "",
      interval: DEFAULT_INTERVAL,
    };
  }
  return {
    origin: trip.origin,
    destination: trip.destination,
    departure: toLocalInputValue(new Date(trip.departure)),
    load: String(trip.loadLb),
    interval: trip.intervalMi,
  };
}

export function TripForm({
  initialTrip,
  onSubmit,
  serverErrors = {},
  submitting = false,
  submitDisabled = false,
}: TripFormProps) {
  const [values, setValues] = useState(() => initialValues(initialTrip));
  const [errors, setErrors] = useState<TripErrors>({});
  // Bumped when places swap, so both comboboxes reload their text.
  const [placesVersion, setPlacesVersion] = useState(0);
  const shown: TripErrors = { ...serverErrors, ...errors };

  function update<K extends keyof TripFormValues>(field: K, value: TripFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    // Once a field changes, its old error no longer applies.
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = validateTrip(values);
    // Render the errors now, so the first invalid field can take focus.
    flushSync(() => setErrors(result.errors ?? {}));
    if (result.trip) onSubmit(result.trip);
    else focusFirstInvalid(form);
  }

  function swapPlaces() {
    setValues((current) => ({
      ...current,
      origin: current.destination,
      destination: current.origin,
    }));
    setErrors((current) => ({ ...current, origin: undefined, destination: undefined }));
    setPlacesVersion((version) => version + 1);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Trip details"
      className="flex flex-col gap-4"
    >
      <div className="relative flex flex-col gap-4">
        <FormField label="Origin" error={shown.origin}>
          {(control) => (
            <PlaceCombobox
              key={`origin-${placesVersion}`}
              control={control}
              value={values.origin}
              onChange={(place) => update("origin", place)}
            />
          )}
        </FormField>
        <FormField label="Destination" error={shown.destination}>
          {(control) => (
            <PlaceCombobox
              key={`destination-${placesVersion}`}
              control={control}
              value={values.destination}
              onChange={(place) => update("destination", place)}
            />
          )}
        </FormField>
        <Button
          variant="ghost"
          size="icon"
          onClick={swapPlaces}
          aria-label="Swap origin and destination"
          className="absolute top-0 right-0 size-8"
        >
          <ArrowDownUp />
        </Button>
      </div>

      <FormField
        label="Departure"
        hint={`Your time zone: ${describeTimeZone()}`}
        error={shown.departure}
      >
        {(control) => (
          <Input
            {...control}
            type="datetime-local"
            value={values.departure}
            onChange={(event) => update("departure", event.target.value)}
          />
        )}
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Load (lb)" error={shown.load}>
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              placeholder="e.g. 35,000"
              value={values.load}
              onChange={(event) => update("load", event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Weather every" error={shown.interval}>
          {(control) => (
            <Select
              {...control}
              value={values.interval}
              onChange={(event) => update("interval", Number(event.target.value) as Interval)}
            >
              {INTERVALS.map((miles) => (
                <option key={miles} value={miles}>
                  {miles} miles
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>

      <Button type="submit" size="lg" loading={submitting} disabled={submitDisabled}>
        {submitting ? "Planning…" : "Plan trip"}
      </Button>
    </form>
  );
}

function focusFirstInvalid(form: HTMLFormElement) {
  form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
