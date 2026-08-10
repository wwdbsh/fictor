import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateCatalogPayloads, type GeneratedEquipmentDetail } from "../src/data/generator/generate-catalog";
import {
  assertNoDuplicateJsonKeys,
  buildNameReview,
  makeInitialNameReviewDecisions,
  makeNameReviewTarget,
  parseCsv,
  renderNameReviewDecisions,
  validateNameReviewDecisions,
  NAME_REVIEW_HEADERS,
  NAME_REVIEW_VERSION,
  type NameReviewDecisions,
} from "../src/data/generator/name-review";
import {
  calculateSourceHash,
  renderCatalog,
  type GeneratedEnvelope,
} from "../src/data/generator/render-generated";
import type { Law, Material, ResultClass } from "../src/data/schema/contracts";
import { validateGeneratedCatalog } from "../src/data/schema/validate-generated-catalog";
import { validateSourceSchemas, type SourceData } from "../src/data/schema/validate-source-data";
import { validateSourceSemantics } from "../src/data/schema/validate-source-semantics";
import type { GeneratedCard } from "../src/domain/forge";

export interface RunNameReviewOptions {
  repositoryRoot: string;
  checkOnly: boolean;
  requireClosed: boolean;
}

function readUtf8(path: string): string {
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error(`file is not valid UTF-8: ${path}`);
  if (text.startsWith("\uFEFF")) throw new Error(`UTF-8 BOM is not allowed: ${path}`);
  return text;
}

function readJson<T>(path: string): { text: string; value: T } {
  const text = readUtf8(path);
  return { text, value: JSON.parse(text) as T };
}

function fail(label: string, details: unknown): never {
  throw new Error(`${label}: ${JSON.stringify(details, null, 2)}`);
}

function atomicWrite(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function checkBytes(path: string, expected: string): void {
  let actual: string;
  try {
    actual = readUtf8(path);
  } catch (error) {
    throw new Error(`generated review file is missing or unreadable: ${path}`, { cause: error });
  }
  if (actual !== expected) throw new Error(`generated review file is stale or tampered: ${path}`);
}

export function runNameReview(options: RunNameReviewOptions) {
  const sourceRoot = resolve(options.repositoryRoot, "src/data/source");
  const generatedRoot = resolve(options.repositoryRoot, "src/data/generated");
  const reviewsRoot = resolve(options.repositoryRoot, "docs/reviews");
  const paths = {
    materials: resolve(sourceRoot, "materials.json"),
    laws: resolve(sourceRoot, "laws.json"),
    resultClasses: resolve(sourceRoot, "resultClasses.json"),
    cards: resolve(generatedRoot, "cards.generated.json"),
    equipment: resolve(generatedRoot, "equipment.generated.json"),
    csv: resolve(reviewsRoot, "name-review.generated.csv"),
    decisions: resolve(reviewsRoot, "name-review.decisions.json"),
  };

  const materials = readJson<Material[]>(paths.materials).value;
  const laws = readJson<Law[]>(paths.laws).value;
  const resultClasses = readJson<ResultClass[]>(paths.resultClasses).value;
  const cardsFile = readJson<GeneratedEnvelope<GeneratedCard>>(paths.cards);
  const equipmentFile = readJson<GeneratedEnvelope<GeneratedEquipmentDetail>>(paths.equipment);
  const source: SourceData = { materials, laws, resultClasses };

  const sourceSchema = validateSourceSchemas(source);
  if (!sourceSchema.valid) fail("source schema validation failed", sourceSchema.errors);
  const sourceSemantics = validateSourceSemantics(source);
  if (!sourceSemantics.valid) fail("source semantic validation failed", sourceSemantics.errors);

  const catalogValidation = validateGeneratedCatalog(cardsFile.value, equipmentFile.value, source);
  if (!catalogValidation.valid) fail("generated catalog validation failed", catalogValidation);
  const sourceHash = calculateSourceHash([materials, laws, resultClasses]);
  const expectedPayloads = generateCatalogPayloads(materials, { laws, resultClasses });
  const expectedCatalog = renderCatalog(expectedPayloads.cards, expectedPayloads.equipment, sourceHash);
  if (cardsFile.text !== expectedCatalog.cardsText) {
    throw new Error(`generated catalog file is stale or tampered: ${paths.cards}`);
  }
  if (equipmentFile.text !== expectedCatalog.equipmentText) {
    throw new Error(`generated catalog file is stale or tampered: ${paths.equipment}`);
  }

  const built = buildNameReview({
    materials,
    laws,
    cards: cardsFile.value.items,
    equipment: equipmentFile.value.items,
  });
  const target = makeNameReviewTarget(
    cardsFile.value.generator_version,
    sourceHash,
    cardsFile.value.content_hash,
    cardsFile.text,
    built,
  );

  let decisionsText: string | undefined;
  let decisionsCreated = false;
  try {
    decisionsText = readUtf8(paths.decisions);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? (error as { cause?: NodeJS.ErrnoException }).cause?.code;
    if (code !== "ENOENT") throw error;
  }
  if (decisionsText === undefined) {
    if (options.checkOnly) throw new Error(`human decisions file is missing: ${paths.decisions}`);
    if (options.requireClosed) throw new Error("cannot require a closed review before decisions exist");
    decisionsText = renderNameReviewDecisions(makeInitialNameReviewDecisions(target));
    decisionsCreated = true;
  } else {
    assertNoDuplicateJsonKeys(decisionsText);
    const decisions = JSON.parse(decisionsText) as NameReviewDecisions;
    validateNameReviewDecisions(decisions, target, built.rows, options.requireClosed);
  }

  if (options.checkOnly) {
    checkBytes(paths.csv, built.csvText);
    const parsed = parseCsv(readUtf8(paths.csv));
    if (parsed.length !== built.rows.length + 1) throw new Error("review CSV row count mismatch");
    if (JSON.stringify(parsed[0]) !== JSON.stringify(NAME_REVIEW_HEADERS)) {
      throw new Error("review CSV header mismatch");
    }
  } else {
    atomicWrite(paths.csv, built.csvText);
    if (decisionsCreated) atomicWrite(paths.decisions, decisionsText);
  }

  return {
    command: options.checkOnly ? "review:names:check" : "review:names",
    review_version: NAME_REVIEW_VERSION,
    source_hash: target.source_hash,
    cards_content_hash: target.cards_content_hash,
    cards_file_hash: target.cards_file_hash,
    review_rows_hash: target.review_rows_hash,
    review_csv_hash: target.review_csv_hash,
    rows: built.rows.length,
    branches: Object.fromEntries(
      ["LAW", "CATALYST", "EQUIPMENT"].map((branch) => [
        branch,
        built.rows.filter((row) => row.branch === branch).length,
      ]),
    ),
    flag_counts: built.flagCounts,
    flagged_rows: built.rows
      .filter((row) => Number(row.flag_count) > 0)
      .map((row) => ({
        card_id: row.card_id,
        generated_name_ko: row.generated_name_ko,
        flags: row.flags.split("|"),
      })),
    require_closed: options.requireClosed,
    written: options.checkOnly
      ? []
      : [paths.csv, ...(decisionsCreated ? [paths.decisions] : [])].map((path) =>
          path.slice(options.repositoryRoot.length + 1),
        ),
  };
}

function parseArguments(argumentsList: readonly string[]): { checkOnly: boolean; requireClosed: boolean } {
  const supported = new Set(["--check", "--require-closed"]);
  const unknown = argumentsList.filter((argument) => !supported.has(argument));
  if (unknown.length > 0 || new Set(argumentsList).size !== argumentsList.length) {
    throw new Error("usage: npm run review:names [-- --check] [--require-closed]");
  }
  return {
    checkOnly: argumentsList.includes("--check"),
    requireClosed: argumentsList.includes("--require-closed"),
  };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  console.log(JSON.stringify(runNameReview({ repositoryRoot, ...parseArguments(process.argv.slice(2)) })));
}
