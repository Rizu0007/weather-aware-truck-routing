import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder shaped like the results; the status text is announced separately. */
export function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-20 rounded-card" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex flex-col gap-3 rounded-card border border-border p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8" />
          <Skeleton className="h-2 rounded-pill" />
        </div>
      ))}
    </div>
  );
}
