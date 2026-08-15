import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

function currentIndexAssets(distDirectory: string): string[] {
  const indexHtml = readFileSync(resolve(distDirectory, "index.html"), "utf8");
  const references = [...indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((reference) => /\.(?:js|css)(?:[?#]|$)/.test(reference));

  expect(references.length).toBeGreaterThan(0);
  expect(references).toEqual(references.filter((reference) => /^\.\/assets\/[^/?#]+\.(?:js|css)$/.test(reference)));
  expect(new Set(references).size, "dist/index.html must not contain duplicate JS/CSS asset references").toBe(references.length);

  return references.map((reference) => {
    const path = resolve(distDirectory, reference);
    expect(existsSync(path), `referenced bundle asset is missing: ${reference}`).toBe(true);
    expect(statSync(path).isFile(), `referenced bundle asset is not a file: ${reference}`).toBe(true);
    return path;
  });
}

describe("canonical catalog browser exclusion", () => {
  // 60s timeout: this test spawns a real `npm run build`, which loses to
  // vitest's default 5s budget under full-suite parallel load (the T015 v4
  // asset suites add ~60s of concurrent work). Standalone it runs in ~1-2s.
  it("keeps generated data and Node-only tooling out of the production bundle", { timeout: 60_000 }, () => {
    const build = spawnSync("npm", ["run", "build"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      // Vitest runs with NODE_ENV=test, which otherwise bundles React's development
      // runtime and does not represent the production artifact governed by this budget.
      env: { ...process.env, NODE_ENV: "production" },
    });
    expect(build.status, build.stderr).toBe(0);

    const bundle = filesUnder(resolve(repositoryRoot, "dist"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const forbidden of [
      "forge__burn_01__still_01",
      "cards.generated.json",
      "equipment.generated.json",
      "content_hash",
      "fictor.materials",
      "tsx scripts/gen-data",
      "t022-m2-assets-audit-v1.json",
    ]) {
      expect(bundle).not.toContain(forbidden);
    }
    expect(bundle).toContain("fictor-browser-runtime-packet-v1");

    // Budget only the current entrypoint graph. Vite may leave unrelated hashed
    // files behind during concurrent/stale builds, but index.html is authoritative.
    const builtFiles = currentIndexAssets(resolve(repositoryRoot, "dist"));
    const javascriptBytes = builtFiles.filter((path) => extname(path) === ".js").reduce((sum, path) => sum + statSync(path).size, 0);
    const cssBytes = builtFiles.filter((path) => extname(path) === ".css").reduce((sum, path) => sum + statSync(path).size, 0);
    expect(javascriptBytes).toBeLessThanOrEqual(409_600);
    expect(cssBytes).toBeLessThanOrEqual(32_768);
  });
});
