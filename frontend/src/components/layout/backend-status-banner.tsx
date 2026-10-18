import { Spinner } from "@/components/ui/spinner";

export type BackendStatus = "checking" | "waking" | "ready";

/** Shown while the free Render instance wakes up (it sleeps after 15 min idle). */
export function BackendStatusBanner({ status }: { status: BackendStatus }) {
  if (status === "ready") return null;
  return (
    <div role="status" className="border-b border-border bg-info-surface text-sm text-info">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-2 px-4 py-2">
        <Spinner />
        {status === "waking"
          ? "Waking the server. Free hosting sleeps when idle, so this can take up to a minute…"
          : "Connecting to the server…"}
      </div>
    </div>
  );
}
