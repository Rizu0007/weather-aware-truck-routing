import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/client";

const MINUTE = 60_000;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Every plan spends the shared weather budget (~600 locations/min across all users),
        // so nothing refetches on its own.
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // Django already retries providers; only retry a dropped connection, once.
        retry: (failureCount, error) =>
          failureCount < 1 && error instanceof ApiError && error.kind === "network",
        // Matches Django's 15-minute weather cache.
        staleTime: 15 * MINUTE,
      },
    },
  });
}
