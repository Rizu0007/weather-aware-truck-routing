import { useEffect, useRef, useState } from "react";

const FRAME_MS = 600;
const REDUCED_MOTION_FRAME_MS = 1_500;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Steps through the hours while playing, looping back to the start. */
export function useHeatmapPlayback(hours: number, hour: number, onHour: (hour: number) => void) {
  const [playing, setPlaying] = useState(false);
  const current = useRef({ hour, onHour });

  useEffect(() => {
    current.current = { hour, onHour };
  });

  useEffect(() => {
    if (!playing) return;
    // Slower frames when the user asked for less motion; still steps, never animates.
    const timer = setInterval(
      () => current.current.onHour((current.current.hour + 1) % hours),
      prefersReducedMotion() ? REDUCED_MOTION_FRAME_MS : FRAME_MS,
    );
    return () => clearInterval(timer);
  }, [playing, hours]);

  return { playing, toggle: () => setPlaying((value) => !value), pause: () => setPlaying(false) };
}
