import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateCatalogPayloads } from "../src/data/generator/generate-catalog";
import { calculateSourceHash, renderCatalog } from "../src/data/generator/render-generated";
import type { Law, Material, ResultClass } from "../src/data/schema/contracts";
import { validateGeneratedCatalog } from "../src/data/schema/validate-generated-catalog";
import { validateSourceSchemas, type SourceData } from "../src/data/schema/validate-source-data";
import { validateSourceSemantics } from "../src/data/schema/validate-source-semantics";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function fail(label: string, details: unknown): never {
  throw new Error(`${label}: ${JSON.stringify(details, null, 2)}`);
}

function atomicWrite(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, contents, { encoding: "utf8", flag: "w" });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function checkBytes(path: string, expected: string): void {
  let actual: string;
  try {
    actual = readFileSync(path, "utf8");
  } catch {
    throw new Error(`generated file is missing: ${path}`);
  }
  if (actual !== expected) throw new Error(`generated file is stale or tampered: ${path}`);
}

export interface RunDataGenerationOptions {
  repositoryRoot: string;
  checkOnly: boolean;
}

export function runDataGeneration(options: RunDataGenerationOptions) {
  const repositoryRoot = resolve(options.repositoryRoot);
  const sourceRoot = resolve(repositoryRoot, "src/data/source");
  const generatedRoot = resolve(repositoryRoot, "src/data/generated");
  const outputPaths = {
    cards: resolve(generatedRoot, "cards.generated.json"),
    equipment: resolve(generatedRoot, "equipment.generated.json"),
  };

  const materials = readJson<Material[]>(resolve(sourceRoot, "materials.json"));
  const laws = readJson<Law[]>(resolve(sourceRoot, "laws.json"));
  const resultClasses = readJson<ResultClass[]>(resolve(sourceRoot, "resultClasses.json"));
  const source: SourceData = { materials, laws, resultClasses };

  const sourceSchema = validateSourceSchemas(source);
  if (!sourceSchema.valid) fail("source schema validation failed", sourceSchema.errors);
  const sourceSemantics = validateSourceSemantics(source);
  if (!sourceSemantics.valid) fail("source semantic validation failed", sourceSemantics.errors);

  const payloads = generateCatalogPayloads(materials, { laws, resultClasses });
  const sourceHash = calculateSourceHash([materials, laws, resultClasses]);
  const rendered = renderCatalog(payloads.cards, payloads.equipment, sourceHash);
  const generatedValidation = validateGeneratedCatalog(
    rendered.cardsEnvelope,
    rendered.equipmentEnvelope,
    source,
  );
  if (!generatedValidation.valid) fail("generated catalog validation failed", generatedValidation);

  if (options.checkOnly) {
    checkBytes(outputPaths.cards, rendered.cardsText);
    checkBytes(outputPaths.equipment, rendered.equipmentText);
  } else {
    atomicWrite(outputPaths.cards, rendered.cardsText);
    atomicWrite(outputPaths.equipment, rendered.equipmentText);
  }

  return {
    command: options.checkOnly ? "gen:data:check" : "gen:data",
    generator_version: "canonical-v1",
    source_hash: sourceHash,
    cards: payloads.cards.length,
    equipment: payloads.equipment.length,
    written: options.checkOnly
      ? []
      : Object.values(outputPaths).map((path) => path.slice(repositoryRoot.length + 1)),
  };
}

function parseArguments(argumentsList: readonly string[]): { checkOnly: boolean } {
  if (argumentsList.length > 1 || (argumentsList.length === 1 && argumentsList[0] !== "--check")) {
    throw new Error("usage: npm run gen:data [-- --check]");
  }
  return { checkOnly: argumentsList[0] === "--check" };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  console.log(JSON.stringify(runDataGeneration({ repositoryRoot, ...parseArguments(process.argv.slice(2)) })));
}
