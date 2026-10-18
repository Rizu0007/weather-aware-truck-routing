// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// WCAG AA contrast pairs, checked against the real token values.
// Read from disk: Vitest stubs CSS imports, even with ?raw.
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const tokens = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, hex]) => [name, hex]),
);
const DARK_BASEMAP = "#0c0c0c";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const color = (name: string) => {
  const value = tokens[name];
  if (!value) throw new Error(`Missing token --${name}`);
  return value;
};

const TEXT = 4.5;
const NON_TEXT = 3;

const pairs: [foreground: string, background: string, minimum: number][] = [
  ["foreground", "background", TEXT],
  ["foreground", "surface", TEXT],
  ["foreground", "surface-raised", TEXT],
  ["muted-foreground", "background", TEXT],
  ["muted-foreground", "surface", TEXT],
  ["muted-foreground", "surface-raised", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["primary-foreground", "primary-end", TEXT],
  ["primary-foreground", "primary-hover", TEXT],
  ["primary", "surface", TEXT],
  ["secondary-foreground", "secondary", TEXT],
  ["success", "success-surface", TEXT],
  ["warning", "warning-surface", TEXT],
  ["destructive", "destructive-surface", TEXT],
  ["destructive-inline", "surface", TEXT],
  ["info", "info-surface", TEXT],
  ["input", "surface", NON_TEXT],
  ["input", "background", NON_TEXT],
  ["ring", "surface", NON_TEXT],
  ["ring", "background", NON_TEXT],
];

const RISK = ["risk-low", "risk-moderate", "risk-high", "risk-severe", "risk-no-travel"];

describe("design tokens meet WCAG AA", () => {
  it.each(pairs)("%s on %s ≥ %d:1", (foreground, background, minimum) => {
    expect(contrast(color(foreground), color(background))).toBeGreaterThanOrEqual(minimum);
  });

  it.each(RISK)("%s line stands out on the dark basemap (≥ 3:1)", (risk) => {
    expect(contrast(color(risk), DARK_BASEMAP)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it.each(RISK)("badge text on %s is readable (≥ 4.5:1)", (risk) => {
    expect(contrast(color("risk-foreground"), color(risk))).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("contrast()", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
