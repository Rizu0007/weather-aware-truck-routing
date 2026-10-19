import { useEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "@/utils/motion";

const FRAME_MS = 1_000; // an hour a second: time to see each hour's weather
const REDUCED_MOTION_FRAME_MS = 2_000;

/** Steps through the hours while playing, looping back to the start; pauses on reaching
 *  `stopAt` (e.g. the truck's arrival), and carries on past it when played again. */
export function useHeatmapPlayback(
  hours: number,
  hour: number,
  onHour: (hour: number) => void,
  stopAt: number | null = null,
) {
  const [playing, setPlaying] = useState(false);
  const current = useRef({ hour, onHour, stopAt });

  useEffect(() => {
    current.current = { hour, onHour, stopAt };
  });

  useEffect(() => {
    if (!playing) return;
    // Slower frames when the user asked for less motion; still steps, never animates.
    const timer = setInterval(
      () => {
        const next = (current.current.hour + 1) % hours;
        current.current.onHour(next);
        if (next === current.current.stopAt) setPlaying(false);
      },
      prefersReducedMotion() ? REDUCED_MOTION_FRAME_MS : FRAME_MS,
    );
    return () => clearInterval(timer);
  }, [playing, hours]);

  return { playing, toggle: () => setPlaying((value) => !value), pause: () => setPlaying(false) };
}
