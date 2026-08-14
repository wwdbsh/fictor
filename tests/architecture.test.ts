import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = join(repositoryRoot, "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? sourceFiles(path) : [path];
    })
    .filter((path) => [".ts", ".tsx"].includes(extname(path)));
}

describe("current source architecture", () => {
  it("keeps the domain boundary free of framework, layer, and browser dependencies", () => {
    const domainFiles = sourceFiles(join(sourceRoot, "domain"));
    expect(domainFiles.length).toBeGreaterThan(0);

    for (const file of domainFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(repositoryRoot, file)).not.toMatch(
        /(?:from\s+["'](?:react|react-dom)(?:\/[^"']*)?["']|import\s*\(\s*["'](?:react|react-dom)(?:\/[^"']*)?["']\s*\))/,
      );
      expect(source, relative(repositoryRoot, file)).not.toMatch(
        /(?:from\s+["'][^"']*(?:presentation|application|persistence|data|assets)(?:\/[^"']*)?["']|import\s*\(\s*["'][^"']*(?:presentation|application|persistence|data|assets)(?:\/[^"']*)?["']\s*\))/,
      );
      expect(source, relative(repositoryRoot, file)).not.toMatch(
        /\b(?:document|window|localStorage|fetch|WebSocket)\b/,
      );
      expect(source, relative(repositoryRoot, file)).not.toMatch(
        /(?:from\s+["']node:|import\s*\(\s*["']node:|\b(?:crypto|fs|path)\b)/,
      );
      expect(source, relative(repositoryRoot, file)).not.toMatch(
        /\b(?:Math\.random|Date|setTimeout|setInterval)\b/,
      );
    }
  });

  it("keeps React DOM mounting in main.tsx as the composition root", () => {
    const mainPath = join(sourceRoot, "main.tsx");
    const mainSource = readFileSync(mainPath, "utf8");

    expect(mainSource).toMatch(/from\s+["']react-dom\/client["']/);
    expect(mainSource).toMatch(/from\s+["']\.\/presentation\/App["']/);
    expect(mainSource).toContain("createRoot(rootElement).render");

    for (const file of sourceFiles(sourceRoot).filter((path) => path !== mainPath)) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(repositoryRoot, file)).not.toMatch(/react-dom\/client|\bcreateRoot\s*\(/);
    }
  });

  it("keeps source data, schemas, generators, and generated catalogs out of the browser graph", () => {
    const browserRoots = [
      join(sourceRoot, "main.tsx"),
      ...["application", "assets", "persistence", "presentation"].flatMap((directory) =>
        sourceFiles(join(sourceRoot, directory)),
      ),
    ];

    for (const file of browserRoots) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(repositoryRoot, file)).not.toMatch(
        /(?:data\/(?:source|schema|generator|generated)|\.generated\.json|\bajv\b|\btsx\b)/i,
      );
    }
  });

  it("keeps combat implementation helpers out of the root domain API", () => {
    const combatIndex = readFileSync(join(sourceRoot, "domain", "combat", "index.ts"), "utf8");
    expect(combatIndex).not.toMatch(
      /\b(?:nextUint32|nextBoundedUint32|shuffleInstanceIds|canonicalSerialize|fnv1a32|isSafeCount|isFiniteNonnegative)\b/,
    );
  });

  it("keeps forge runtime on the shared resolver and out of canonical catalogs", () => {
    const runtimeRoot = join(sourceRoot, "domain", "forge-runtime");
    const runtimeFiles = sourceFiles(runtimeRoot);
    const combined = runtimeFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(combined.match(/resolveForgeCard\s*\(/g)).toHaveLength(2);
    expect(combined).not.toMatch(/from\s+["'][^"']*(?:data\/(?:source|generated)|\.generated\.json|unstable)[^"']*["']/i);
    expect(combined).not.toMatch(/function\s+(?:resolve|makeTier2|deriveStats)/);

    const runtimeIndex = readFileSync(join(runtimeRoot, "index.ts"), "utf8");
    expect(runtimeIndex).toContain("FORGE_RUNTIME_SOURCE_HASH");
    expect(runtimeIndex).not.toMatch(/(?:sha256Hex|canonicalSerialize|projectionHash|PROJECTION_HASH)/);
  });

  it("keeps run flow and reward authority browser-safe", () => {
    const roots = [
      join(sourceRoot, "application", "run"),
      join(sourceRoot, "domain", "rewards"),
      join(sourceRoot, "domain", "events"),
    ];
    const combined = roots.flatMap(sourceFiles).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toMatch(/data\/(?:source|generated)|\.generated\.json/i);
    expect(combined).not.toMatch(/\b(?:Math\.random|Date|localStorage|fetch|WebSocket)\b/);
  });
});
