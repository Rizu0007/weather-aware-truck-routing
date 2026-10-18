import { useQuery } from "@tanstack/react-query";

import { checkHealth } from "@/api/endpoints";
import { queryKeys } from "@/api/query-keys";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";

export type BackendStatus = "checking" | "waking" | "ready";

// A free Render instance sleeps after 15 min idle and takes up to ~1 min to wake.
const WAKING_AFTER_MS = 2_000;
const RETRY_EVERY_MS = 3_000;

/** Pings /api/health until it answers; "waking" once that takes noticeably long. */
export function useBackendHealth(): BackendStatus {
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => checkHealth(signal),
    retry: true,
    retryDelay: RETRY_EVERY_MS,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const slow = useDelayedFlag(!health.isSuccess, WAKING_AFTER_MS);

  if (health.isSuccess) return "ready";
  return slow || health.failureCount > 0 ? "waking" : "checking";
}
