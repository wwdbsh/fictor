import { readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".codex", ".git", "coverage", "dist", "node_modules"]);

function generatedJsonFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((entry) => !ignoredDirectories.has(entry))
    .flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? generatedJsonFiles(path) : [path];
    })
    .filter((path) => extname(path) === ".json" && path.endsWith(".generated.json"))
    .map((path) => relative(repositoryRoot, path))
    .sort();
}

describe("gen:data T002 scaffold", () => {
  it("reports structured no-op output without writing generated JSON", () => {
    const before = generatedJsonFiles(repositoryRoot);
    const result = spawnSync(process.execPath, ["scripts/gen-data.mjs"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    const after = generatedJsonFiles(repositoryRoot);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      command: "gen:data",
      stage: "T002-scaffold",
      generated: false,
      writtenFiles: [],
      replacementTask: "T004",
    });
    expect(after).toEqual(before);
  });
});
