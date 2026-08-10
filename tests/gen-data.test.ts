import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".codex", ".git", "coverage", "dist", "node_modules"]);

interface FileSnapshot {
  path: string;
  sha256: string;
}

function repositorySnapshot(directory = repositoryRoot): FileSnapshot[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !(entry.isDirectory() && ignoredDirectories.has(entry.name)))
    .flatMap((entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return repositorySnapshot(path);
      }

      if (!entry.isFile()) {
        return [];
      }

      return [
        {
          path: relative(repositoryRoot, path),
          sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
        },
      ];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

describe("gen:data T002 scaffold", () => {
  it("reports structured no-op output without changing repository files", () => {
    const before = repositorySnapshot();
    const result = spawnSync(process.execPath, ["scripts/gen-data.mjs"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    const after = repositorySnapshot();

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
