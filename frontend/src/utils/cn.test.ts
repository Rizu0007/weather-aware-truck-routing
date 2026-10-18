import { expect, it } from "vitest";

import { cn } from "@/utils/cn";

it("lets later classes win, including our custom tokens", () => {
  expect(cn("px-2 rounded-control", "px-4 rounded-card")).toBe("px-4 rounded-card");
  expect(cn("shadow-card", undefined, "shadow-glow")).toBe("shadow-glow");
  expect(cn("text-sm text-muted-foreground", "text-foreground")).toBe("text-sm text-foreground");
});
