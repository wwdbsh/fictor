import { createHash } from "node:crypto";

import type { GeneratedCard } from "../../domain/forge";
import type { Law, Material } from "../schema/contracts";
import type { GeneratedEquipmentDetail } from "./generate-catalog";
import { canonicalSerialize } from "./render-generated";

export const NAME_REVIEW_VERSION = "name-review-v2";
export const NAME_REVIEW_ROW_COUNT = 1326;
export const NAME_REVIEW_BRANCH_COUNTS = { LAW: 861, CATALYST: 420, EQUIPMENT: 45 } as const;

export const NAME_REVIEW_HEADERS = [
  "ordinal",
  "card_id",
  "recipe_id",
  "material_a_id",
  "material_a_name_ko",
  "material_b_id",
  "material_b_name_ko",
  "branch",
  "actor_id",
  "actor_modifier_form",
  "receptor_id",
  "receptor_noun_form",
  "rule_type",
  "rule_key",
  "law_pair",
  "rule_text_ko",
  "generated_name_ko",
  "result_class",
  "flag_count",
  "flags",
] as const;

export type NameReviewHeader = (typeof NAME_REVIEW_HEADERS)[number];
export type NameReviewFlag =
  | "EXACT_DUPLICATE"
  | "NORMALIZED_DUPLICATE"
  | "EXCLAMATION"
  | "SECOND_PERSON"
  | "OVERSTATEMENT"
  | "APOSTROPHE"
  | "EDGE_WHITESPACE"
  | "REPEATED_WHITESPACE"
  | "ADJACENT_TOKEN_REPEAT"
  | "MODIFIER_NOUN_EXACT_COLLISION"
  | "FIRST_SYLLABLE_REPEAT"
  | "SENTENCE_MARK";

export type NameReviewRow = Record<NameReviewHeader, string>;
export type NameReviewStatus = "PENDING" | "APPROVED" | "CHANGE_REQUIRED" | "HOLD";

export interface NameReviewTarget {
  generator_version: string;
  source_hash: string;
  cards_content_hash: string;
  cards_file_hash: string;
  review_rows_hash: string;
  review_csv_hash: string;
  review_row_count: number;
}

export interface NameReviewOverride {
  status: NameReviewStatus;
  reason?: string;
  proposed_name_ko?: string;
  application_hint?: string;
}

export interface NameReviewDecisions {
  schema_version: 1;
  review_version: typeof NAME_REVIEW_VERSION;
  target: NameReviewTarget;
  default_status: NameReviewStatus;
  all_rows_reviewed: boolean;
  reviewer: string | null;
  reviewed_at: string | null;
  evidence: string | null;
  overrides: Record<string, NameReviewOverride>;
}

export interface BuildNameReviewInput {
  materials: readonly Material[];
  laws: readonly Law[];
  cards: readonly GeneratedCard[];
  equipment: readonly GeneratedEquipmentDetail[];
}

export interface BuiltNameReview {
  rows: NameReviewRow[];
  csvText: string;
  flagCounts: Record<NameReviewFlag, number>;
}

const OVERSTATEMENT_TOKENS = [
  "놀라운",
  "엄청난",
  "경이로운",
  "압도적인",
  "궁극의",
] as const;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const FORMULA_LEADING = /^[\s]*[=+\-@]/u;

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

export function sortByRawCardId<T extends { card_id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => compareCodePoints(left.card_id, right.card_id));
}

export function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function assertSafeReviewCell(value: string, label = "CSV cell"): void {
  if (CONTROL_CHARACTER.test(value)) throw new Error(`${label} contains a control character`);
  if (FORMULA_LEADING.test(value)) throw new Error(`${label} has a formula-leading value`);
}

export function serializeCsv(rows: readonly (readonly string[])[]): string {
  return `${rows
    .map((row, rowIndex) =>
      row
        .map((cell, columnIndex) => {
          assertSafeReviewCell(cell, `CSV row ${rowIndex + 1} column ${columnIndex + 1}`);
          return /[",\n\r]/u.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
        })
        .join(","),
    )
    .join("\n")}\n`;
}

export function parseCsv(text: string): string[][] {
  if (text.includes("\r")) throw new Error("CSV must use LF line endings");
  if (!text.endsWith("\n")) throw new Error("CSV must end with LF");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (afterQuote && character !== "," && character !== "\n") {
      throw new Error("invalid character after a quoted CSV cell");
    }
    if (character === '"') {
      if (cell.length > 0 || afterQuote) throw new Error("invalid quote in an unquoted CSV cell");
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
      afterQuote = false;
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      afterQuote = false;
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("unterminated quoted CSV cell");
  if (row.length > 0 || cell.length > 0) throw new Error("CSV parser ended with an incomplete row");
  for (const [rowIndex, parsedRow] of rows.entries()) {
    for (const [columnIndex, value] of parsedRow.entries()) {
      assertSafeReviewCell(value, `CSV row ${rowIndex + 1} column ${columnIndex + 1}`);
    }
  }
  return rows;
}

function normalizedName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
}

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function hasAdjacentTokenRepeat(name: string): boolean {
  const tokens = name.trim().split(/\s+/u);
  return tokens.some((token, index) => index > 0 && token === tokens[index - 1]);
}

export function detectFormRepeatFlags(modifier: string, noun: string): NameReviewFlag[] {
  const compactModifier = modifier.normalize("NFKC").replace(/\s/gu, "");
  const compactNoun = noun.normalize("NFKC").replace(/\s/gu, "");
  const flags: NameReviewFlag[] = [];

  if (
    compactModifier.length > 0 &&
    compactNoun.length > 0 &&
    compactModifier.startsWith(compactNoun)
  ) {
    flags.push("MODIFIER_NOUN_EXACT_COLLISION");
  }

  const modifierFirst = Array.from(compactModifier)[0];
  const nounFirst = Array.from(compactNoun)[0];
  const isHangulSyllable = (value: string | undefined) =>
    value !== undefined && value >= "가" && value <= "힣";
  if (
    isHangulSyllable(modifierFirst) &&
    isHangulSyllable(nounFirst) &&
    modifierFirst === nounFirst
  ) {
    flags.push("FIRST_SYLLABLE_REPEAT");
  }

  return flags;
}

function flagsFor(
  card: GeneratedCard,
  actor: Material,
  receptor: Material,
  exactCounts: ReadonlyMap<string, number>,
  normalizedCounts: ReadonlyMap<string, number>,
): NameReviewFlag[] {
  const name = card.name_ko;
  const flags: NameReviewFlag[] = [];
  if ((exactCounts.get(name) ?? 0) > 1) flags.push("EXACT_DUPLICATE");
  if ((normalizedCounts.get(normalizedName(name)) ?? 0) > 1) flags.push("NORMALIZED_DUPLICATE");
  if (name.includes("!")) flags.push("EXCLAMATION");
  if (name.includes("당신")) flags.push("SECOND_PERSON");
  if (OVERSTATEMENT_TOKENS.some((token) => name.includes(token))) flags.push("OVERSTATEMENT");
  if (/['’]/u.test(name)) flags.push("APOSTROPHE");
  if (name !== name.trim()) flags.push("EDGE_WHITESPACE");
  if (/\s{2,}/u.test(name)) flags.push("REPEATED_WHITESPACE");
  if (hasAdjacentTokenRepeat(name)) flags.push("ADJACENT_TOKEN_REPEAT");
  flags.push(...detectFormRepeatFlags(actor.modifier_form, receptor.noun_form));
  if (/[.!?。！？]/u.test(name)) flags.push("SENTENCE_MARK");
  return flags;
}

function requireUniqueMap<T>(items: readonly T[], keyOf: (item: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (result.has(key)) throw new Error(`duplicate ${label}: ${key}`);
    result.set(key, item);
  }
  return result;
}

export function buildNameReview(input: BuildNameReviewInput): BuiltNameReview {
  const cards = sortByRawCardId(input.cards);
  if (cards.length !== NAME_REVIEW_ROW_COUNT) {
    throw new Error(`name review requires ${NAME_REVIEW_ROW_COUNT} cards; found ${cards.length}`);
  }
  const materialById = requireUniqueMap(input.materials, ({ id }) => id, "material id");
  const lawByPair = requireUniqueMap(input.laws, ({ pair }) => pair.join("|"), "Law pair");
  const equipmentByCard = requireUniqueMap(input.equipment, ({ card_id }) => card_id, "equipment card id");
  const cardIds = new Set<string>();
  const exactCounts = countValues(cards.map(({ name_ko }) => name_ko));
  const normalizedCounts = countValues(cards.map(({ name_ko }) => normalizedName(name_ko)));
  const flagCounts = Object.fromEntries(
    [
      "EXACT_DUPLICATE",
      "NORMALIZED_DUPLICATE",
      "EXCLAMATION",
      "SECOND_PERSON",
      "OVERSTATEMENT",
      "APOSTROPHE",
      "EDGE_WHITESPACE",
      "REPEATED_WHITESPACE",
      "ADJACENT_TOKEN_REPEAT",
      "MODIFIER_NOUN_EXACT_COLLISION",
      "FIRST_SYLLABLE_REPEAT",
      "SENTENCE_MARK",
    ].map((flag) => [flag, 0]),
  ) as Record<NameReviewFlag, number>;
  const branchCounts = { LAW: 0, CATALYST: 0, EQUIPMENT: 0 };

  const rows = cards.map((card, index): NameReviewRow => {
    if (cardIds.has(card.card_id)) throw new Error(`duplicate card id: ${card.card_id}`);
    cardIds.add(card.card_id);
    branchCounts[card.branch] += 1;
    const [materialAId, materialBId] = card.material_ids;
    const materialA = materialById.get(materialAId);
    const materialB = materialById.get(materialBId);
    const actor = materialById.get(card.actor_id);
    const receptor = materialById.get(card.receptor_id);
    if (!materialA || !materialB || !actor || !receptor) {
      throw new Error(`card references an unknown material: ${card.card_id}`);
    }

    let ruleType: "LAW" | "RESULT_CLASS" | "DOMAIN_PAIR";
    let ruleKey: string;
    let lawPair = "";
    let lawText = "";
    if (card.branch === "LAW") {
      ruleType = "LAW";
      lawPair = card.effective_attributes.join("|");
      const law = lawByPair.get(lawPair);
      if (!law) throw new Error(`card references an unknown Law: ${card.card_id}`);
      ruleKey = lawPair;
      lawText = law.law_text_ko;
    } else if (card.branch === "CATALYST") {
      ruleType = "RESULT_CLASS";
      ruleKey = card.result_class;
    } else {
      ruleType = "DOMAIN_PAIR";
      const detail = equipmentByCard.get(card.card_id);
      if (!detail) throw new Error(`equipment detail is missing: ${card.card_id}`);
      ruleKey = `${detail.domains.join("|")} / ${detail.passive_effect_id}: ${detail.passive_effect_ko}`;
    }

    const flags = flagsFor(card, actor, receptor, exactCounts, normalizedCounts);
    for (const flag of flags) flagCounts[flag] += 1;
    const row: NameReviewRow = {
      ordinal: String(index + 1),
      card_id: card.card_id,
      recipe_id: card.recipe_id,
      material_a_id: materialAId,
      material_a_name_ko: materialA.name_ko,
      material_b_id: materialBId,
      material_b_name_ko: materialB.name_ko,
      branch: card.branch,
      actor_id: card.actor_id,
      actor_modifier_form: actor.modifier_form,
      receptor_id: card.receptor_id,
      receptor_noun_form: receptor.noun_form,
      rule_type: ruleType,
      rule_key: ruleKey,
      law_pair: lawPair,
      rule_text_ko: lawText,
      generated_name_ko: card.name_ko,
      result_class: card.result_class,
      flag_count: String(flags.length),
      flags: flags.join("|"),
    };
    for (const header of NAME_REVIEW_HEADERS) assertSafeReviewCell(row[header], `${card.card_id}.${header}`);
    return row;
  });

  for (const [branch, expected] of Object.entries(NAME_REVIEW_BRANCH_COUNTS)) {
    if (branchCounts[branch as keyof typeof branchCounts] !== expected) {
      throw new Error(`name review branch count mismatch ${branch}`);
    }
  }
  const csvRows = [
    [...NAME_REVIEW_HEADERS],
    ...rows.map((row) => NAME_REVIEW_HEADERS.map((header) => row[header])),
  ];
  const csvText = serializeCsv(csvRows);
  const parsed = parseCsv(csvText);
  if (canonicalSerialize(parsed) !== canonicalSerialize(csvRows)) {
    throw new Error("CSV serialization failed its round-trip check");
  }
  return { rows, csvText, flagCounts };
}

export function makeNameReviewTarget(
  generatorVersion: string,
  sourceHash: string,
  cardsContentHash: string,
  cardsFileText: string,
  built: BuiltNameReview,
): NameReviewTarget {
  return {
    generator_version: generatorVersion,
    source_hash: sourceHash,
    cards_content_hash: cardsContentHash,
    cards_file_hash: sha256Utf8(cardsFileText),
    review_rows_hash: sha256Utf8(canonicalSerialize(built.rows)),
    review_csv_hash: sha256Utf8(built.csvText),
    review_row_count: built.rows.length,
  };
}

export function makeInitialNameReviewDecisions(target: NameReviewTarget): NameReviewDecisions {
  return {
    schema_version: 1,
    review_version: NAME_REVIEW_VERSION,
    target,
    default_status: "PENDING",
    all_rows_reviewed: false,
    reviewer: null,
    reviewed_at: null,
    evidence: null,
    overrides: {},
  };
}

export function renderNameReviewDecisions(decisions: NameReviewDecisions): string {
  return `${JSON.stringify(decisions, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown fields: ${unknown.join(", ")}`);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStrictIsoDateTime(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/u,
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", zone] = match;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
  ].map(Number);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, Number(fraction.padEnd(3, "0")));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second &&
    Number.isFinite(Date.parse(value))
  );
}

function validateApplicationHint(
  applicationHint: string,
  row: NameReviewRow,
  proposedName: string,
): void {
  const sourceMatch = applicationHint.match(
    /^SOURCE:([a-z][a-z0-9_]*)\.(modifier_form|noun_form)$/u,
  );
  if (sourceMatch) {
    const [, materialId, field] = sourceMatch;
    if (materialId === row.actor_id && field === "modifier_form") {
      const suffix = ` ${row.receptor_noun_form}`;
      const proposedModifier = proposedName.endsWith(suffix)
        ? proposedName.slice(0, -suffix.length)
        : "";
      if (proposedModifier.trim().length > 0) return;
      throw new Error(
        `CHANGE_REQUIRED actor SOURCE proposal must preserve this row's receptor_noun_form: ${row.card_id}`,
      );
    }
    if (materialId === row.receptor_id && field === "noun_form") {
      const prefix = `${row.actor_modifier_form} `;
      const proposedNoun = proposedName.startsWith(prefix) ? proposedName.slice(prefix.length) : "";
      if (proposedNoun.trim().length > 0) return;
      throw new Error(
        `CHANGE_REQUIRED receptor SOURCE proposal must preserve this row's actor_modifier_form: ${row.card_id}`,
      );
    }
    throw new Error(
      `CHANGE_REQUIRED SOURCE application_hint must reference this row's actor.modifier_form or receptor.noun_form: ${row.card_id}`,
    );
  }
  const generatorRuleMatch = applicationHint.match(/^GENERATOR_RULE:(.*)$/u);
  if (generatorRuleMatch) {
    const description = generatorRuleMatch[1];
    if (description.length > 0 && description === description.trim()) return;
  }
  throw new Error(
    `CHANGE_REQUIRED application_hint must be SOURCE:<material id>.<modifier_form|noun_form> or GENERATOR_RULE:<description>: ${row.card_id}`,
  );
}

export function validateNameReviewDecisions(
  value: unknown,
  target: NameReviewTarget,
  rows: readonly NameReviewRow[],
  requireClosed = false,
): asserts value is NameReviewDecisions {
  if (!isRecord(value)) throw new Error("name review decisions must be an object");
  assertExactKeys(
    value,
    [
      "schema_version",
      "review_version",
      "target",
      "default_status",
      "all_rows_reviewed",
      "reviewer",
      "reviewed_at",
      "evidence",
      "overrides",
    ],
    "name review decisions",
  );
  if (value.schema_version !== 1 || value.review_version !== NAME_REVIEW_VERSION) {
    throw new Error("name review decisions schema or review version mismatch");
  }
  if (!isRecord(value.target)) throw new Error("name review target must be an object");
  assertExactKeys(value.target, Object.keys(target), "name review target");
  if (canonicalSerialize(value.target) !== canonicalSerialize(target)) {
    throw new Error("name review target is stale; source or generated/review hashes changed");
  }
  const statuses: readonly NameReviewStatus[] = ["PENDING", "APPROVED", "CHANGE_REQUIRED", "HOLD"];
  const defaultStatuses: readonly NameReviewStatus[] = ["PENDING", "APPROVED"];
  if (!defaultStatuses.includes(value.default_status as NameReviewStatus)) {
    throw new Error("name review default_status is invalid");
  }
  if (typeof value.all_rows_reviewed !== "boolean") throw new Error("all_rows_reviewed must be boolean");
  for (const field of ["reviewer", "reviewed_at", "evidence"] as const) {
    if (value[field] !== null && typeof value[field] !== "string") {
      throw new Error(`${field} must be a string or null`);
    }
  }
  if (!isRecord(value.overrides)) throw new Error("name review overrides must be an object");
  const rowById = new Map(rows.map((row) => [row.card_id, row]));
  for (const [cardId, candidate] of Object.entries(value.overrides)) {
    const row = rowById.get(cardId);
    if (!row) throw new Error(`name review override has unknown card id: ${cardId}`);
    if (!isRecord(candidate)) throw new Error(`name review override must be an object: ${cardId}`);
    assertExactKeys(candidate, ["status", "reason", "proposed_name_ko", "application_hint"], `override ${cardId}`);
    if (!statuses.includes(candidate.status as NameReviewStatus)) {
      throw new Error(`name review override status is invalid: ${cardId}`);
    }
    for (const field of ["reason", "proposed_name_ko", "application_hint"] as const) {
      if (candidate[field] !== undefined && typeof candidate[field] !== "string") {
        throw new Error(`override ${cardId}.${field} must be a string`);
      }
    }
    if (candidate.status === "CHANGE_REQUIRED") {
      if (!nonEmptyString(candidate.reason) || !nonEmptyString(candidate.proposed_name_ko) || !nonEmptyString(candidate.application_hint)) {
        throw new Error(`CHANGE_REQUIRED override needs reason, proposed_name_ko, and application_hint: ${cardId}`);
      }
      assertSafeReviewCell(candidate.proposed_name_ko, `override ${cardId}.proposed_name_ko`);
      if (candidate.proposed_name_ko === row.generated_name_ko) {
        throw new Error(`CHANGE_REQUIRED proposed_name_ko must differ from the current generated name: ${cardId}`);
      }
      validateApplicationHint(candidate.application_hint, row, candidate.proposed_name_ko);
    }
    if (candidate.status === "HOLD" && !nonEmptyString(candidate.reason)) {
      throw new Error(`HOLD override needs a reason: ${cardId}`);
    }
  }

  if (!requireClosed) return;
  if (value.all_rows_reviewed !== true) throw new Error("closed review requires all_rows_reviewed: true");
  if (!nonEmptyString(value.reviewer) || !nonEmptyString(value.evidence)) {
    throw new Error("closed review requires reviewer and evidence");
  }
  if (!nonEmptyString(value.reviewed_at) || !isStrictIsoDateTime(value.reviewed_at)) {
    throw new Error("closed review requires a valid ISO reviewed_at timestamp with timezone or Z");
  }
  const overrides = value.overrides as Record<string, NameReviewOverride>;
  const defaultStatus = value.default_status as NameReviewStatus;
  const unresolved = rows.filter((row) => {
    const status = overrides[row.card_id]?.status ?? defaultStatus;
    return status === "PENDING" || status === "HOLD";
  });
  if (unresolved.length > 0) {
    throw new Error(`closed review has ${unresolved.length} effective PENDING/HOLD rows`);
  }
  for (const row of rows.filter(({ flag_count }) => Number(flag_count) > 0)) {
    const disposition = overrides[row.card_id];
    if (!disposition || !["APPROVED", "CHANGE_REQUIRED"].includes(disposition.status)) {
      throw new Error(`flagged row needs an explicit APPROVED or CHANGE_REQUIRED disposition: ${row.card_id}`);
    }
    if (disposition.status === "APPROVED" && !nonEmptyString(disposition.reason)) {
      throw new Error(`flagged APPROVED row needs a reason: ${row.card_id}`);
    }
  }
}

/** Reject duplicate JSON object keys before JSON.parse silently discards them. */
export function assertNoDuplicateJsonKeys(text: string): void {
  let cursor = 0;
  const whitespace = /\s/u;
  const skipWhitespace = () => {
    while (cursor < text.length && whitespace.test(text[cursor])) cursor += 1;
  };
  const parseStringToken = (): string => {
    const start = cursor;
    if (text[cursor] !== '"') throw new Error(`expected JSON string at offset ${cursor}`);
    cursor += 1;
    while (cursor < text.length) {
      if (text[cursor] === "\\") {
        cursor += 2;
      } else if (text[cursor] === '"') {
        cursor += 1;
        return JSON.parse(text.slice(start, cursor)) as string;
      } else {
        cursor += 1;
      }
    }
    throw new Error("unterminated JSON string");
  };
  const parseValue = (): void => {
    skipWhitespace();
    const character = text[cursor];
    if (character === "{") {
      cursor += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (text[cursor] === "}") {
        cursor += 1;
        return;
      }
      while (cursor < text.length) {
        skipWhitespace();
        const key = parseStringToken();
        if (keys.has(key)) throw new Error(`duplicate JSON object key: ${key}`);
        keys.add(key);
        skipWhitespace();
        if (text[cursor] !== ":") throw new Error(`expected JSON colon at offset ${cursor}`);
        cursor += 1;
        parseValue();
        skipWhitespace();
        if (text[cursor] === "}") {
          cursor += 1;
          return;
        }
        if (text[cursor] !== ",") throw new Error(`expected JSON object comma at offset ${cursor}`);
        cursor += 1;
      }
      throw new Error("unterminated JSON object");
    }
    if (character === "[") {
      cursor += 1;
      skipWhitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < text.length) {
        parseValue();
        skipWhitespace();
        if (text[cursor] === "]") {
          cursor += 1;
          return;
        }
        if (text[cursor] !== ",") throw new Error(`expected JSON array comma at offset ${cursor}`);
        cursor += 1;
      }
      throw new Error("unterminated JSON array");
    }
    if (character === '"') {
      parseStringToken();
      return;
    }
    const token = text.slice(cursor).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u)?.[0];
    if (!token) throw new Error(`invalid JSON token at offset ${cursor}`);
    cursor += token.length;
  };
  parseValue();
  skipWhitespace();
  if (cursor !== text.length) throw new Error(`unexpected JSON content at offset ${cursor}`);
}
