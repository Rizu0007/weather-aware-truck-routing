import { useState } from "react";

type ScopedMile = { scope: string; mile: number } | null;

/** Opened and hovered checkpoint, shared by map, table and profile; a new `scope` clears both. */
export function useCheckpointSelection(scope: string) {
  const [active, setActive] = useState<ScopedMile>(null);
  const [hover, setHover] = useState<ScopedMile>(null);
  const scoped = (mile: number | null): ScopedMile => (mile === null ? null : { scope, mile });

  return {
    activeMile: active?.scope === scope ? active.mile : null,
    hoverMile: hover?.scope === scope ? hover.mile : null,
    activate: (mile: number | null) => setActive(scoped(mile)),
    hover: (mile: number | null) => setHover(scoped(mile)),
  };
}
