import { ArrowRight, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime, formatPounds } from "@/utils/format";
import type { TripParams } from "@/utils/trip-params";

/** The submitted trip, collapsed to one card so results get the space. */
export function TripSummary({ trip, onEdit }: { trip: TripParams; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 font-semibold">
          <span>{trip.origin.label}</span>
          <ArrowRight aria-label="to" className="size-4 text-muted-foreground" />
          <span>{trip.destination.label}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(trip.departure)} · {formatPounds(trip.loadLb)} · weather every{" "}
          {trip.intervalMi} mi
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil aria-hidden="true" />
        Edit
      </Button>
    </div>
  );
}
