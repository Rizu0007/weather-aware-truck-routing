import { Alert } from "@/components/ui/alert";

export function PlanWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {warnings.map((warning) => (
        <Alert key={warning} variant="info">
          {warning}
        </Alert>
      ))}
    </div>
  );
}
