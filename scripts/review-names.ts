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
  sha256Utf8,
  sortByRawCardId,
  validateNameReviewDecisions,
  NAME_REVIEW_HEADERS,
  NAME_REVIEW_VERSION,
  type NameReviewDecisions,
} from "../src/data/generator/name-review";
import {
  calculateSourceHash,
  canonicalSerialize,
  renderCatalog,
  type GeneratedEnvelope,
} from "../src/data/generator/render-generated";
import type { Law, Material, ResultClass } from "../src/data/schema/contracts";
import { validateGeneratedCatalog } from "../src/data/schema/validate-generated-catalog";
import { validateSourceSchemas, type SourceData } from "../src/data/schema/validate-source-data";
import { validateSourceSemantics } from "../src/data/schema/validate-source-semantics";
import type { GeneratedCard } from "../src/domain/forge";
import { FORGE_TUNING } from "../src/domain/balance";

export const T044_BALANCE_REBIND = {
  currentTarget: {
    generator_version: "canonical-v1",
    source_hash: "be7a99ea52ecd92438ca8171e4d9d397ff68e56cc9ac59b6b33b9b78dc5446de",
    cards_content_hash: "64be1dfff7c218620ab2aa69708331d59e928eecdacf089b50226af68fbae741",
    cards_file_hash: "5f7511623cd1b1890da3dcb8fc85a09deb4909fb713b284805bed3d0962eea9b",
    review_rows_hash: "abe566ce68c9f7abf1b094f88931227bf3fa6c5cd59d0aba52aaeee30f8ee328",
    review_csv_hash: "53543dac48d591402890bc498463ce6353876efb558bc383822b9c2c0702b960",
    review_row_count: 1326,
  },
  historicalTarget: {
    generator_version: "canonical-v1",
    source_hash: "7e05e02b3db844ccba7806067e196d0e4477ea4f7ce2c661440ea3820d87d720",
    cards_content_hash: "283054dfb4e97d4f3420d0711ff7affb0dd2afe9d6140b81c6e77ce71b2c2886",
    cards_file_hash: "71eb299228432f906edc0423f6dc5b90ea546e886f0bf12e7a7ebac6ace6f84f",
    review_rows_hash: "abe566ce68c9f7abf1b094f88931227bf3fa6c5cd59d0aba52aaeee30f8ee328",
    review_csv_hash: "53543dac48d591402890bc498463ce6353876efb558bc383822b9c2c0702b960",
    review_row_count: 1326,
  },
  decisionsFileHash: "de7466939821bdf973c3431332234fcd6ad2fcfe82b49364da3ab0919be9f9cb",
  approvedNamesHash: "92a963544860dab6db3d9e3e8ccf8f33bdf6668e1b145a9eed0e19b0476b2e55",
  currentSourceFileHashes: [
    "607266635b128fe73dcde391362b0f1ea16619e879081db7c3c06eabe136cd8c",
    "d4116f3f0f84d01c178940e64198a522eacd6118f57f8e97b0d36ebd6260f85b",
    "b986c8e787008fd76eb87b396e7153aad8a6679d23dca1111eabd9969c740975",
  ],
} as const;

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

function validateExistingDecisions(
  decisionsText: string,
  decisions: NameReviewDecisions,
  target: ReturnType<typeof makeNameReviewTarget>,
  built: ReturnType<typeof buildNameReview>,
  cards: readonly GeneratedCard[],
  sourceFileHashes: readonly string[],
  requireClosed: boolean,
): "CURRENT_TARGET" | "T044_BALANCE_REBIND" {
  if (canonicalSerialize(decisions.target) === canonicalSerialize(target)) {
    validateNameReviewDecisions(decisions, target, built.rows, requireClosed);
    return "CURRENT_TARGET";
  }
  if (
    canonicalSerialize(decisions.target) !==
    canonicalSerialize(T044_BALANCE_REBIND.historicalTarget)
  ) {
    validateNameReviewDecisions(decisions, target, built.rows, requireClosed);
    throw new Error("unreachable stale name-review target");
  }
  if (canonicalSerialize(target) !== canonicalSerialize(T044_BALANCE_REBIND.currentTarget)) {
    validateNameReviewDecisions(decisions, target, built.rows, requireClosed);
    throw new Error("unreachable stale name-review target");
  }
  if (canonicalSerialize(sourceFileHashes) !== canonicalSerialize(T044_BALANCE_REBIND.currentSourceFileHashes)) {
    throw new Error("T044_BALANCE_REBIND current source bytes mismatch");
  }
  if (sha256Utf8(decisionsText) !== T044_BALANCE_REBIND.decisionsFileHash) {
    throw new Error("T044_BALANCE_REBIND historical decisions bytes mismatch");
  }
  validateNameReviewDecisions(
    decisions,
    T044_BALANCE_REBIND.historicalTarget,
    built.rows,
    requireClosed,
  );
  const approvedNames = sortByRawCardId(cards).map(({ card_id, name_ko }) => ({ card_id, name_ko }));
  if (sha256Utf8(canonicalSerialize(approvedNames)) !== T044_BALANCE_REBIND.approvedNamesHash) {
    throw new Error("T044_BALANCE_REBIND current approved-name projection mismatch");
  }
  return "T044_BALANCE_REBIND";
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

  const materialsFile = readJson<Material[]>(paths.materials);
  const lawsFile = readJson<Law[]>(paths.laws);
  const resultClassesFile = readJson<ResultClass[]>(paths.resultClasses);
  const materials = materialsFile.value;
  const laws = lawsFile.value;
  const resultClasses = resultClassesFile.value;
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
  const expectedPayloads = generateCatalogPayloads(materials, {
    laws,
    resultClasses,
    tuning: FORGE_TUNING,
  });
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
  let decisionBinding: "CURRENT_TARGET" | "T044_BALANCE_REBIND" = "CURRENT_TARGET";
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
    decisionBinding = validateExistingDecisions(
      decisionsText,
      decisions,
      target,
      built,
      cardsFile.value.items,
      [materialsFile.text, lawsFile.text, resultClassesFile.text].map(sha256Utf8),
      options.requireClosed,
    );
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
    decision_binding: decisionBinding,
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
