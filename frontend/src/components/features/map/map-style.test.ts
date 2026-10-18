import { expect, it } from "vitest";

import { heatmapPaint } from "@/components/features/map/map-style";

it("heatmap colour and opacity read the hour's property", () => {
  const paint = JSON.stringify(heatmapPaint(17));

  expect(paint).toContain('["get","h17"]');
  expect(paint).not.toContain('"h0"');
});
