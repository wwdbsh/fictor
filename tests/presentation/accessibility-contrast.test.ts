import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/presentation/styles.css"), "utf8");

function declaredColor(name: string) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`missing CSS color token: ${name}`);
  return match[1];
}

function luminance(hex: string) {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`invalid RGB hex: ${hex}`);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(left: string, right: string) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("presentation color contrast", () => {
  it("keeps the enemy intent accent at WCAG AA text contrast", () => {
    expect(contrast("#e2642c", "#102e35")).toBeLessThan(4.5);
    expect(contrast(declaredColor("intent-accent"), "#102e35")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the global focus ring distinguishable on likely light and dark surfaces", () => {
    const focus = declaredColor("focus-ring");
    for (const surface of ["#eee8d9", "#f6f1e6", "#c9dde3", "#151617", "#102e35"]) {
      expect(contrast(focus, surface), `${focus} on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });
});
