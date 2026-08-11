import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateCatalogPayloads, type GeneratedEquipmentDetail } from "../src/data/generator/generate-catalog";
import {
  assertNoDuplicateJsonKeys,
  buildNameReview,
  parseCsv,
  sortByRawCardId,
  validateNameReviewDecisions,
  NAME_REVIEW_HEADERS,
  NAME_REVIEW_VERSION,
  type NameReviewDecisions,
  type NameReviewStatus,
} from "../src/data/generator/name-review";
import {
  calculateSourceHash,
  canonicalSerialize,
  GENERATOR_VERSION,
  renderCatalog,
  sha256,
  type GeneratedEnvelope,
} from "../src/data/generator/render-generated";
import type { Law, Material, ResultClass } from "../src/data/schema/contracts";
import { validateGeneratedCatalog } from "../src/data/schema/validate-generated-catalog";
import { validateSourceSchemas, type SourceData } from "../src/data/schema/validate-source-data";
import { validateSourceSemantics } from "../src/data/schema/validate-source-semantics";
import type { GeneratedCard } from "../src/domain/forge";
import { runNameReview } from "./review-names";

const MILESTONE_PATH = "docs/milestones/m1-phase-0-data.json";
const SOURCE_PATHS = [
  "src/data/source/materials.json",
  "src/data/source/laws.json",
  "src/data/source/resultClasses.json",
] as const;
const CARDS_PATH = "src/data/generated/cards.generated.json";
const EQUIPMENT_PATH = "src/data/generated/equipment.generated.json";
const DECISIONS_PATH = "docs/reviews/name-review.decisions.json";
const CSV_PATH = "docs/reviews/name-review.generated.csv";
const REVIEWER = "상헌 님 (GitHub: @wwdbsh)";
const REVIEWED_AT = "2026-08-10T23:53:30.204Z";
const REVIEW_EVIDENCE = "https://github.com/wwdbsh/fictor/issues/62#issuecomment-5247374256";

const STATUS_KEYS = ["APPROVED", "CHANGE_REQUIRED", "PENDING", "HOLD"] as const;
const EXPECTED_STATUS_COUNTS = {
  APPROVED: 1326,
  CHANGE_REQUIRED: 0,
  PENDING: 0,
  HOLD: 0,
} as const;

interface MilestoneRecord {
  schema_version: 1;
  milestone_id: "M1";
  phase: "PHASE_0_DATA";
  target_date: "2026-08-12";
  task_key: "T007";
  issue_number: 9;
  status: "VERIFIED";
  source: {
    combined_hash: string;
    files: Array<{ path: string; file_hash: string }>;
  };
  catalog: {
    generator_version: typeof GENERATOR_VERSION;
    cards: { path: string; count: 1326; content_hash: string; file_hash: string };
    equipment: { path: string; count: 45; content_hash: string; file_hash: string };
  };
  name_review: {
    review_version: typeof NAME_REVIEW_VERSION;
    decisions_path: string;
    decisions_file_hash: string;
    csv_path: string;
    row_count: 1326;
    rows_hash: string;
    csv_hash: string;
    approved_names_hash: string;
    effective_status_counts: Record<(typeof STATUS_KEYS)[number], number>;
    reviewer: string;
    reviewed_at: string;
    evidence: string;
  };
}

function readUtf8(path: string): string {
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error(`file is not valid UTF-8: ${path}`);
  if (text.startsWith("\uFEFF")) throw new Error(`UTF-8 BOM is not allowed: ${path}`);
  return text;
}

function readStrictJson<T>(path: string): { text: string; value: T } {
  const text = readUtf8(path);
  assertNoDuplicateJsonKeys(text);
  return { text, value: JSON.parse(text) as T };
}

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (missing.length > 0) throw new Error(`${label} is missing fields: ${missing.join(", ")}`);
  if (unknown.length > 0) throw new Error(`${label} has unknown fields: ${unknown.join(", ")}`);
}

function assertEquals(actual: unknown, expected: unknown, label: string): void {
  if (canonicalSerialize(actual) !== canonicalSerialize(expected)) {
    throw new Error(`${label} mismatch`);
  }
}

function fail(label: string, details: unknown): never {
  throw new Error(`${label}: ${JSON.stringify(details, null, 2)}`);
}

function validateMilestoneShape(value: unknown): asserts value is MilestoneRecord {
  assertObject(value, "milestone");
  assertExactKeys(
    value,
    [
      "schema_version",
      "milestone_id",
      "phase",
      "target_date",
      "task_key",
      "issue_number",
      "status",
      "source",
      "catalog",
      "name_review",
    ],
    "milestone",
  );
  assertEquals(
    {
      schema_version: value.schema_version,
      milestone_id: value.milestone_id,
      phase: value.phase,
      target_date: value.target_date,
      task_key: value.task_key,
      issue_number: value.issue_number,
      status: value.status,
    },
    {
      schema_version: 1,
      milestone_id: "M1",
      phase: "PHASE_0_DATA",
      target_date: "2026-08-12",
      task_key: "T007",
      issue_number: 9,
      status: "VERIFIED",
    },
    "milestone constants",
  );

  assertObject(value.source, "milestone.source");
  assertExactKeys(value.source, ["combined_hash", "files"], "milestone.source");
  if (!Array.isArray(value.source.files) || value.source.files.length !== SOURCE_PATHS.length) {
    throw new Error("milestone.source.files must contain the three fixed source paths");
  }
  value.source.files.forEach((entry, index) => {
    assertObject(entry, `milestone.source.files[${index}]`);
    assertExactKeys(entry, ["path", "file_hash"], `milestone.source.files[${index}]`);
    if (entry.path !== SOURCE_PATHS[index]) {
      throw new Error(`milestone.source.files[${index}].path must be ${SOURCE_PATHS[index]}`);
    }
  });

  assertObject(value.catalog, "milestone.catalog");
  assertExactKeys(value.catalog, ["generator_version", "cards", "equipment"], "milestone.catalog");
  if (value.catalog.generator_version !== GENERATOR_VERSION) {
    throw new Error("milestone.catalog.generator_version mismatch");
  }
  for (const [label, path, count] of [
    ["cards", CARDS_PATH, 1326],
    ["equipment", EQUIPMENT_PATH, 45],
  ] as const) {
    const entry = value.catalog[label];
    assertObject(entry, `milestone.catalog.${label}`);
    assertExactKeys(entry, ["path", "count", "content_hash", "file_hash"], `milestone.catalog.${label}`);
    if (entry.path !== path || entry.count !== count) {
      throw new Error(`milestone.catalog.${label} fixed path or count mismatch`);
    }
  }

  assertObject(value.name_review, "milestone.name_review");
  assertExactKeys(
    value.name_review,
    [
      "review_version",
      "decisions_path",
      "decisions_file_hash",
      "csv_path",
      "row_count",
      "rows_hash",
      "csv_hash",
      "approved_names_hash",
      "effective_status_counts",
      "reviewer",
      "reviewed_at",
      "evidence",
    ],
    "milestone.name_review",
  );
  if (
    value.name_review.review_version !== NAME_REVIEW_VERSION ||
    value.name_review.decisions_path !== DECISIONS_PATH ||
    value.name_review.csv_path !== CSV_PATH ||
    value.name_review.row_count !== 1326
  ) {
    throw new Error("milestone.name_review fixed version, paths, or row count mismatch");
  }
  assertObject(value.name_review.effective_status_counts, "milestone.name_review.effective_status_counts");
  assertExactKeys(
    value.name_review.effective_status_counts,
    STATUS_KEYS,
    "milestone.name_review.effective_status_counts",
  );
  if (
    value.name_review.reviewer !== REVIEWER ||
    value.name_review.reviewed_at !== REVIEWED_AT ||
    value.name_review.evidence !== REVIEW_EVIDENCE
  ) {
    throw new Error("milestone.name_review reviewer, time, or evidence mismatch");
  }
}

export interface RunPhase0MilestoneOptions {
  repositoryRoot: string;
}

export function runPhase0MilestoneCheck({ repositoryRoot }: RunPhase0MilestoneOptions) {
  const fixedPath = (relativePath: string) => resolve(repositoryRoot, relativePath);
  const milestoneFile = readStrictJson<unknown>(fixedPath(MILESTONE_PATH));
  validateMilestoneShape(milestoneFile.value);
  const milestone = milestoneFile.value;

  const sourceFiles = SOURCE_PATHS.map((path) => readStrictJson<unknown>(fixedPath(path)));
  const [materialsFile, lawsFile, resultClassesFile] = sourceFiles;
  const source: SourceData = {
    materials: materialsFile.value as Material[],
    laws: lawsFile.value as Law[],
    resultClasses: resultClassesFile.value as ResultClass[],
  };
  const sourceSchema = validateSourceSchemas(source);
  if (!sourceSchema.valid) fail("source schema validation failed", sourceSchema.errors);
  const sourceSemantics = validateSourceSemantics(source);
  if (!sourceSemantics.valid) fail("source semantic validation failed", sourceSemantics.errors);

  const sourceHash = calculateSourceHash([source.materials, source.laws, source.resultClasses]);
  assertEquals(milestone.source.combined_hash, sourceHash, "milestone source combined hash");
  milestone.source.files.forEach((entry, index) => {
    assertEquals(entry.file_hash, hashText(sourceFiles[index].text), `milestone source file hash ${entry.path}`);
  });

  const cardsFile = readStrictJson<GeneratedEnvelope<GeneratedCard>>(fixedPath(CARDS_PATH));
  const equipmentFile = readStrictJson<GeneratedEnvelope<GeneratedEquipmentDetail>>(fixedPath(EQUIPMENT_PATH));
  const catalogValidation = validateGeneratedCatalog(cardsFile.value, equipmentFile.value, source);
  if (!catalogValidation.valid) fail("generated catalog validation failed", catalogValidation);
  const expectedPayloads = generateCatalogPayloads(source.materials, {
    laws: source.laws,
    resultClasses: source.resultClasses,
  });
  const expectedCatalog = renderCatalog(expectedPayloads.cards, expectedPayloads.equipment, sourceHash);
  if (cardsFile.text !== expectedCatalog.cardsText) throw new Error("generated cards bytes are stale or tampered");
  if (equipmentFile.text !== expectedCatalog.equipmentText) {
    throw new Error("generated equipment bytes are stale or tampered");
  }
  assertEquals(
    milestone.catalog.cards,
    {
      path: CARDS_PATH,
      count: cardsFile.value.count,
      content_hash: cardsFile.value.content_hash,
      file_hash: hashText(cardsFile.text),
    },
    "milestone cards record",
  );
  assertEquals(
    milestone.catalog.equipment,
    {
      path: EQUIPMENT_PATH,
      count: equipmentFile.value.count,
      content_hash: equipmentFile.value.content_hash,
      file_hash: hashText(equipmentFile.text),
    },
    "milestone equipment record",
  );

  const reviewSummary = runNameReview({ repositoryRoot, checkOnly: true, requireClosed: true });
  const builtReview = buildNameReview({
    materials: source.materials,
    laws: source.laws,
    cards: cardsFile.value.items,
    equipment: equipmentFile.value.items,
  });
  const decisionsFile = readStrictJson<NameReviewDecisions>(fixedPath(DECISIONS_PATH));
  validateNameReviewDecisions(decisionsFile.value, {
    generator_version: cardsFile.value.generator_version,
    source_hash: sourceHash,
    cards_content_hash: cardsFile.value.content_hash,
    cards_file_hash: hashText(cardsFile.text),
    review_rows_hash: sha256(canonicalSerialize(builtReview.rows)),
    review_csv_hash: hashText(builtReview.csvText),
    review_row_count: builtReview.rows.length,
  }, builtReview.rows, true);

  const csvText = readUtf8(fixedPath(CSV_PATH));
  const csvRows = parseCsv(csvText);
  if (canonicalSerialize(csvRows[0]) !== canonicalSerialize(NAME_REVIEW_HEADERS)) {
    throw new Error("review CSV header mismatch");
  }
  const cardIdIndex = NAME_REVIEW_HEADERS.indexOf("card_id");
  const nameIndex = NAME_REVIEW_HEADERS.indexOf("generated_name_ko");
  const sortedCards = sortByRawCardId(cardsFile.value.items);
  if (csvRows.length !== sortedCards.length + 1) throw new Error("review CSV row count mismatch");
  for (const [index, card] of sortedCards.entries()) {
    const csvRow = csvRows[index + 1];
    if (csvRow[cardIdIndex] !== card.card_id || csvRow[nameIndex] !== card.name_ko) {
      throw new Error(`review CSV card id/name mismatch at row ${index + 2}`);
    }
  }

  const effectiveStatusCounts: Record<NameReviewStatus, number> = {
    APPROVED: 0,
    CHANGE_REQUIRED: 0,
    PENDING: 0,
    HOLD: 0,
  };
  for (const row of builtReview.rows) {
    const status = decisionsFile.value.overrides[row.card_id]?.status ?? decisionsFile.value.default_status;
    effectiveStatusCounts[status] += 1;
  }
  assertEquals(effectiveStatusCounts, EXPECTED_STATUS_COUNTS, "effective name-review status counts");
  if (!decisionsFile.value.evidence?.includes(REVIEW_EVIDENCE)) {
    throw new Error("closed name-review decision does not contain the milestone evidence URL");
  }

  const approvedNames = sortedCards.map(({ card_id, name_ko }) => ({ card_id, name_ko }));
  const approvedNamesHash = sha256(canonicalSerialize(approvedNames));
  assertEquals(
    milestone.name_review,
    {
      review_version: NAME_REVIEW_VERSION,
      decisions_path: DECISIONS_PATH,
      decisions_file_hash: hashText(decisionsFile.text),
      csv_path: CSV_PATH,
      row_count: builtReview.rows.length,
      rows_hash: reviewSummary.review_rows_hash,
      csv_hash: hashText(csvText),
      approved_names_hash: approvedNamesHash,
      effective_status_counts: effectiveStatusCounts,
      reviewer: decisionsFile.value.reviewer,
      reviewed_at: decisionsFile.value.reviewed_at,
      evidence: REVIEW_EVIDENCE,
    },
    "milestone name-review record",
  );

  return {
    command: "milestone:phase0:check",
    milestone_id: "M1",
    status: "VERIFIED",
    source_hash: sourceHash,
    cards: {
      count: cardsFile.value.count,
      content_hash: cardsFile.value.content_hash,
      file_hash: hashText(cardsFile.text),
    },
    equipment: {
      count: equipmentFile.value.count,
      content_hash: equipmentFile.value.content_hash,
      file_hash: hashText(equipmentFile.text),
    },
    name_review: {
      row_count: builtReview.rows.length,
      branch_counts: reviewSummary.branches,
      approved_names_hash: approvedNamesHash,
      effective_status_counts: effectiveStatusCounts,
    },
  };
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (process.argv.length !== 2) throw new Error("usage: npm run milestone:phase0:check");
  console.log(JSON.stringify(runPhase0MilestoneCheck({ repositoryRoot })));
}
