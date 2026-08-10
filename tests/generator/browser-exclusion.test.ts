import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const textBundleExtensions = new Set([".html", ".js", ".css"]);

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return textBundleExtensions.has(extname(path)) ? [path] : [];
  });
}

describe("generated catalog browser exclusion", () => {
  it("keeps generated data and Node-only tooling out of the production bundle", () => {
    const build = spawnSync("npm", ["run", "build"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);

    const bundle = filesUnder(resolve(repositoryRoot, "dist"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const forbidden of [
      "forge__burn_01__still_01",
      "PENDING_2026_08_21",
      "canonical-v1",
      "fictor.materials",
      "tsx scripts/gen-data",
    ]) {
      expect(bundle).not.toContain(forbidden);
    }
  });
});
