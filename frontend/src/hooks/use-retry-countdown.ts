import { useEffect, useState } from "react";

/**
 * Seconds left before a retry makes sense, counting down from `seconds`.
 * A new `startedAt` (e.g. the error's time) restarts the count.
 */
export function useRetryCountdown(seconds: number | undefined, startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!seconds) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current - startedAt >= seconds * 1_000) clearInterval(timer);
    }, 1_000);
    return () => clearInterval(timer);
  }, [seconds, startedAt]);

  if (!seconds) return 0;
  return Math.max(0, Math.ceil(seconds - (now - startedAt) / 1_000));
}
