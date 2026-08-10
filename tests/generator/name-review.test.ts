import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runNameReview } from "../../scripts/review-names";
import cardsJson from "../../src/data/generated/cards.generated.json";
import equipmentJson from "../../src/data/generated/equipment.generated.json";
import {
  assertNoDuplicateJsonKeys,
  buildNameReview,
  detectFormRepeatFlags,
  makeInitialNameReviewDecisions,
  makeNameReviewTarget,
  parseCsv,
  serializeCsv,
  sha256Utf8,
  validateNameReviewDecisions,
  NAME_REVIEW_HEADERS,
  NAME_REVIEW_VERSION,
  type NameReviewDecisions,
  type NameReviewOverride,
} from "../../src/data/generator/name-review";
import type { GeneratedEnvelope } from "../../src/data/generator/render-generated";
import lawsJson from "../../src/data/source/laws.json";
import materialsJson from "../../src/data/source/materials.json";
import type { Law, Material } from "../../src/data/schema/contracts";
import type { GeneratedCard } from "../../src/domain/forge";
import type { GeneratedEquipmentDetail } from "../../src/data/generator/generate-catalog";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const materials = materialsJson as Material[];
const laws = lawsJson as Law[];
const cardsEnvelope = cardsJson as GeneratedEnvelope<GeneratedCard>;
const equipmentEnvelope = equipmentJson as GeneratedEnvelope<GeneratedEquipmentDetail>;
const temporaryRoots: string[] = [];

function build(cards: readonly GeneratedCard[] = cardsEnvelope.items) {
  return buildNameReview({ materials, laws, cards, equipment: equipmentEnvelope.items });
}

function targetFor(built = build()) {
  const cardsText = readFileSync(
    resolve(repositoryRoot, "src/data/generated/cards.generated.json"),
    "utf8",
  );
  return makeNameReviewTarget(
    cardsEnvelope.generator_version,
    cardsEnvelope.source_hash,
    cardsEnvelope.content_hash,
    cardsText,
    built,
  );
}

function makeClosedDecisions(): { decisions: NameReviewDecisions; rows: ReturnType<typeof build>["rows"] } {
  const built = build();
  const decisions = makeInitialNameReviewDecisions(targetFor(built));
  decisions.default_status = "APPROVED";
  decisions.all_rows_reviewed = true;
  decisions.reviewer = "검수자";
  decisions.reviewed_at = "2026-08-11T12:00:00+09:00";
  decisions.evidence = "CSV 전 행을 순서대로 확인함";
  for (const row of built.rows.filter(({ flag_count }) => Number(flag_count) > 0)) {
    decisions.overrides[row.card_id] = { status: "APPROVED", reason: "문맥상 의도된 반복" };
  }
  return { decisions, rows: built.rows };
}

function makeTemporaryRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "fictor-name-review-"));
  temporaryRoots.push(root);
  mkdirSync(resolve(root, "src/data"), { recursive: true });
  cpSync(resolve(repositoryRoot, "src/data/source"), resolve(root, "src/data/source"), { recursive: true });
  cpSync(resolve(repositoryRoot, "src/data/generated"), resolve(root, "src/data/generated"), {
    recursive: true,
  });
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("canonical name-review package", () => {
  it("contains every exact canonical id once in raw code-point order and the required branches", () => {
    const built = build();
    const expectedIds: string[] = [];
    const ids = materials.map(({ id }) => id).sort();
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        expectedIds.push(`forge__${ids[left]}__${ids[right]}`);
      }
    }
    expectedIds.sort();

    expect(built.rows).toHaveLength(1326);
    expect(built.rows.map(({ card_id }) => card_id)).toEqual(expectedIds);
    expect(new Set(built.rows.map(({ card_id }) => card_id)).size).toBe(1326);
    expect(Object.fromEntries(["LAW", "CATALYST", "EQUIPMENT"].map((branch) => [
      branch,
      built.rows.filter((row) => row.branch === branch).length,
    ]))).toEqual({ LAW: 861, CATALYST: 420, EQUIPMENT: 45 });
    expect(parseCsv(built.csvText)[0]).toEqual([...NAME_REVIEW_HEADERS]);
  });

  it("renders deterministic bytes and hashes even when canonical cards are shuffled", () => {
    const first = build();
    const second = build([...cardsEnvelope.items].reverse());
    expect(second.csvText).toBe(first.csvText);
    expect(second.rows).toEqual(first.rows);
    expect(sha256Utf8(second.csvText)).toBe(sha256Utf8(first.csvText));
    expect(targetFor(first).review_rows_hash).toBe(targetFor(second).review_rows_hash);
  });

  it("keeps Law context exclusive and supplies catalyst/equipment rule context", () => {
    const rows = build().rows;
    expect(rows.filter(({ branch }) => branch === "LAW").every((row) =>
      row.rule_type === "LAW" &&
      row.rule_key === row.law_pair &&
      row.law_pair.length > 0 &&
      row.rule_text_ko.length > 0,
    )).toBe(true);
    expect(rows.filter(({ branch }) => branch !== "LAW").every((row) =>
      row.law_pair === "" && row.rule_text_ko === "",
    )).toBe(true);
    expect(rows.filter(({ branch }) => branch === "CATALYST").every((row) =>
      row.rule_type === "RESULT_CLASS" && row.rule_key === row.result_class,
    )).toBe(true);
    expect(rows.filter(({ branch }) => branch === "EQUIPMENT").every((row) =>
      row.rule_type === "DOMAIN_PAIR" && row.rule_key.includes("EQUIPMENT_") && row.rule_key.includes(":"),
    )).toBe(true);
  });

  it("records current objective facts without classifying subjective name quality", () => {
    const built = build();
    expect(built.flagCounts).toMatchObject({
      EXACT_DUPLICATE: 0,
      NORMALIZED_DUPLICATE: 0,
      EXCLAMATION: 0,
      SECOND_PERSON: 0,
      OVERSTATEMENT: 0,
      APOSTROPHE: 0,
      EDGE_WHITESPACE: 0,
      REPEATED_WHITESPACE: 0,
      ADJACENT_TOKEN_REPEAT: 0,
      SENTENCE_MARK: 0,
      MODIFIER_NOUN_EXACT_COLLISION: 0,
      FIRST_SYLLABLE_REPEAT: 8,
    });
    expect(built.rows.filter(({ flag_count }) => Number(flag_count) > 0)).toHaveLength(8);
    expect(built.rows.find(({ card_id }) => card_id === "forge__burn_05__tool_06")?.flags).toContain(
      "FIRST_SYLLABLE_REPEAT",
    );
  });

  it("limits the source rebaseline impact to 89 actor-derived card names and no equipment content", () => {
    const affected = cardsEnvelope.items.filter(({ actor_id }) =>
      actor_id === "tool_05" || actor_id === "tool_10",
    );

    expect(affected).toHaveLength(89);
    expect(affected.every((card) =>
      card.name_ko.startsWith(card.actor_id === "tool_05" ? "헤아린 " : "부려놓은 "),
    )).toBe(true);
    expect(equipmentEnvelope.source_hash).not.toBe(
      "285ab100c7b209c4557dccca91c3372aebb90f0de20700ea53b2c55060a34e9a",
    );
    expect(equipmentEnvelope.content_hash).toBe(
      "2d363142278173cd34d8dc40faa0fbeb3e918a818e2bedd407ee8084911a8aa7",
    );
  });

  it("detects only frozen normalized form-repeat rules in stable independent order", () => {
    expect(detectFormRepeatFlags("재어진", "재")).toContain("MODIFIER_NOUN_EXACT_COLLISION");
    expect(detectFormRepeatFlags("불어넣은", "불티")).toEqual(["FIRST_SYLLABLE_REPEAT"]);
    expect(detectFormRepeatFlags("실려온", "실")).toEqual([
      "MODIFIER_NOUN_EXACT_COLLISION",
      "FIRST_SYLLABLE_REPEAT",
    ]);
    expect(detectFormRepeatFlags("헤아린 재", "재")).toEqual([]);
    expect(detectFormRepeatFlags("재", "재어진")).toEqual(["FIRST_SYLLABLE_REPEAT"]);
    expect(detectFormRepeatFlags("가늠한", "가")).toEqual([
      "MODIFIER_NOUN_EXACT_COLLISION",
      "FIRST_SYLLABLE_REPEAT",
    ]);
    expect(detectFormRepeatFlags("alpha", "a")).toEqual(["MODIFIER_NOUN_EXACT_COLLISION"]);
    expect(detectFormRepeatFlags("", "")).toEqual([]);
    expect(detectFormRepeatFlags(" \t\n", "\u00a0")).toEqual([]);
    expect(detectFormRepeatFlags("재", " \u00a0")).toEqual([]);
    expect(detectFormRepeatFlags("재\u00a0어진", "재")).toEqual([
      "MODIFIER_NOUN_EXACT_COLLISION",
      "FIRST_SYLLABLE_REPEAT",
    ]);
    expect(detectFormRepeatFlags("·재어진", "재")).toEqual([]);
  });

  it("uses only the approved finite overstatement token list", () => {
    const changedCards = structuredClone(cardsEnvelope.items);
    changedCards[0].name_ko = "놀라운 잉걸";
    changedCards[1].name_ko = "궁극의 심지";
    changedCards[2].name_ko = "최고 덩이";
    const rows = build(changedCards).rows;
    expect(rows.find(({ card_id }) => card_id === changedCards[0].card_id)?.flags).toContain("OVERSTATEMENT");
    expect(rows.find(({ card_id }) => card_id === changedCards[1].card_id)?.flags).toContain("OVERSTATEMENT");
    expect(rows.find(({ card_id }) => card_id === changedCards[2].card_id)?.flags).not.toContain("OVERSTATEMENT");
  });

  it("retains every objective flag detector with synthetic card-name mutations", () => {
    const changedCards = structuredClone(cardsEnvelope.items);
    const names = [
      "중복 이름",
      "중복 이름",
      "정규화 이름",
      "정규화  이름",
      "이름!",
      "당신 이름",
      "놀라운 이름",
      "궁극의 이름",
      "이름'표기",
      " 가장자리 이름 ",
      "반복  공백",
      "토큰 토큰 이름",
      "이름?",
    ];
    names.forEach((name, index) => {
      changedCards[index].name_ko = name;
    });
    const rowByCardId = new Map(build(changedCards).rows.map((row) => [row.card_id, row]));
    const flagsAt = (index: number) => rowByCardId.get(changedCards[index].card_id)!.flags.split("|");

    for (const index of [0, 1]) {
      expect(flagsAt(index)).toEqual(expect.arrayContaining(["EXACT_DUPLICATE", "NORMALIZED_DUPLICATE"]));
    }
    for (const index of [2, 3]) expect(flagsAt(index)).toContain("NORMALIZED_DUPLICATE");
    expect(flagsAt(4)).toEqual(expect.arrayContaining(["EXCLAMATION", "SENTENCE_MARK"]));
    expect(flagsAt(5)).toContain("SECOND_PERSON");
    expect(flagsAt(6)).toContain("OVERSTATEMENT");
    expect(flagsAt(7)).toContain("OVERSTATEMENT");
    expect(flagsAt(8)).toContain("APOSTROPHE");
    expect(flagsAt(9)).toContain("EDGE_WHITESPACE");
    expect(flagsAt(10)).toContain("REPEATED_WHITESPACE");
    expect(flagsAt(11)).toContain("ADJACENT_TOKEN_REPEAT");
    expect(flagsAt(12)).toContain("SENTENCE_MARK");
  });

  it("quotes RFC4180 cells, round-trips them, and rejects formula/control payloads", () => {
    const values = [["plain", "comma,value", 'a "quote"', "한글"]];
    const rendered = serializeCsv(values);
    expect(rendered).toBe('plain,"comma,value","a ""quote""",한글\n');
    expect(parseCsv(rendered)).toEqual(values);
    for (const malicious of ["=1+1", " +SUM(A1)", "-2+3", "@cmd", "tab\tcell", "line\ncell", "nul\0cell"]) {
      expect(() => serializeCsv([[malicious]])).toThrow(/formula-leading|control character/);
    }
  });

  it("creates decisions once, never overwrites them, and detects CSV/target tampering", () => {
    const root = makeTemporaryRepository();
    const first = runNameReview({ repositoryRoot: root, checkOnly: false, requireClosed: false });
    expect(first.rows).toBe(1326);
    const decisionsPath = resolve(root, "docs/reviews/name-review.decisions.json");
    const csvPath = resolve(root, "docs/reviews/name-review.generated.csv");
    const decisions = JSON.parse(readFileSync(decisionsPath, "utf8")) as NameReviewDecisions;
    decisions.evidence = "보존 표식";
    const preserved = `${JSON.stringify(decisions, null, 2)}\n`;
    writeFileSync(decisionsPath, preserved, "utf8");
    runNameReview({ repositoryRoot: root, checkOnly: false, requireClosed: false });
    expect(readFileSync(decisionsPath, "utf8")).toBe(preserved);

    writeFileSync(csvPath, `${readFileSync(csvPath, "utf8")}tamper\n`, "utf8");
    expect(() => runNameReview({ repositoryRoot: root, checkOnly: true, requireClosed: false })).toThrow(
      /stale or tampered/,
    );
    runNameReview({ repositoryRoot: root, checkOnly: false, requireClosed: false });
    const stale = JSON.parse(preserved) as NameReviewDecisions;
    stale.target.source_hash = "0".repeat(64);
    writeFileSync(decisionsPath, `${JSON.stringify(stale, null, 2)}\n`, "utf8");
    expect(() => runNameReview({ repositoryRoot: root, checkOnly: false, requireClosed: false })).toThrow(
      /target is stale/,
    );
  });

  it("uses the exported review version and reports exactly the sorted flagged CSV rows", () => {
    const result = runNameReview({ repositoryRoot, checkOnly: true, requireClosed: false });
    const [headers, ...csvRows] = parseCsv(
      readFileSync(resolve(repositoryRoot, "docs/reviews/name-review.generated.csv"), "utf8"),
    );
    const column = (name: string) => headers.indexOf(name);
    const expected = csvRows
      .filter((row) => Number(row[column("flag_count")]) > 0)
      .map((row) => ({
        card_id: row[column("card_id")],
        generated_name_ko: row[column("generated_name_ko")],
        flags: row[column("flags")].split("|"),
      }));

    expect(result.review_version).toBe(NAME_REVIEW_VERSION);
    expect(result.flagged_rows).toEqual(expected);
    expect(result.flagged_rows.map(({ card_id }) => card_id)).toEqual(
      [...result.flagged_rows.map(({ card_id }) => card_id)].sort(),
    );
  });

  it("keeps the archived v1 decision bytes and opens a fresh pending v2 review", () => {
    const oldSourceHash = "285ab100c7b209c4557dccca91c3372aebb90f0de20700ea53b2c55060a34e9a";
    const archivedPath = resolve(
      repositoryRoot,
      `docs/reviews/archive/${oldSourceHash}/name-review.decisions.json`,
    );
    const archivedText = readFileSync(archivedPath, "utf8");
    const live = JSON.parse(
      readFileSync(resolve(repositoryRoot, "docs/reviews/name-review.decisions.json"), "utf8"),
    ) as NameReviewDecisions;

    expect(sha256Utf8(archivedText)).toBe(
      "d3b80f9eb81d9cf4322ab8bd39af95a848e28b0665800ca2eba70ecee2ffb0f9",
    );
    expect(JSON.parse(archivedText)).toMatchObject({
      review_version: "name-review-v1",
      target: { source_hash: oldSourceHash },
    });
    expect(live).toEqual(makeInitialNameReviewDecisions(targetFor()));
    expect(() => runNameReview({ repositoryRoot, checkOnly: true, requireClosed: true })).toThrow(
      /closed review requires all_rows_reviewed: true/,
    );
  });

  it("rejects unknown and duplicate override ids", () => {
    const built = build();
    const decisions = makeInitialNameReviewDecisions(targetFor(built));
    decisions.overrides.forge__unknown__unknown = { status: "APPROVED" };
    expect(() => validateNameReviewDecisions(decisions, targetFor(built), built.rows)).toThrow(
      /unknown card id/,
    );
    expect(() => assertNoDuplicateJsonKeys('{"overrides":{"same":{},"same":{}}}')).toThrow(
      /duplicate JSON object key: same/,
    );
  });

  it("requires complete change proposals and a fully evidenced closed review", () => {
    const built = build();
    const incomplete = makeInitialNameReviewDecisions(targetFor(built));
    incomplete.overrides[built.rows[0].card_id] = { status: "CHANGE_REQUIRED", reason: "어색함" };
    expect(() => validateNameReviewDecisions(incomplete, targetFor(built), built.rows)).toThrow(
      /needs reason, proposed_name_ko, and application_hint/,
    );

    const { decisions, rows } = makeClosedDecisions();
    expect(() => validateNameReviewDecisions(decisions, decisions.target, rows, true)).not.toThrow();

    const pending = structuredClone(decisions);
    pending.default_status = "PENDING";
    expect(() => validateNameReviewDecisions(pending, pending.target, rows, true)).toThrow(
      /effective PENDING\/HOLD/,
    );

    const invalidSparseDefault = structuredClone(decisions);
    invalidSparseDefault.default_status = "CHANGE_REQUIRED";
    expect(() =>
      validateNameReviewDecisions(invalidSparseDefault, invalidSparseDefault.target, rows, true),
    ).toThrow(/default_status is invalid/);
    for (const invalidDefault of ["CHANGE_REQUIRED", "HOLD"] as const) {
      const generallyInvalid = structuredClone(decisions);
      generallyInvalid.default_status = invalidDefault;
      expect(() =>
        validateNameReviewDecisions(generallyInvalid, generallyInvalid.target, rows),
      ).toThrow(/default_status is invalid/);
    }

    const flaggedRow = rows.find(({ flag_count }) => Number(flag_count) > 0)!;
    const flaggedId = flaggedRow.card_id;
    const missingFlagDisposition = structuredClone(decisions);
    delete missingFlagDisposition.overrides[flaggedId];
    expect(() =>
      validateNameReviewDecisions(missingFlagDisposition, missingFlagDisposition.target, rows, true),
    ).toThrow(/flagged row needs an explicit/);

    const noReason = structuredClone(decisions);
    noReason.overrides[flaggedId] = { status: "APPROVED" };
    expect(() => validateNameReviewDecisions(noReason, noReason.target, rows, true)).toThrow(
      /flagged APPROVED row needs a reason/,
    );

    const changed = structuredClone(decisions);
    const change: NameReviewOverride = {
      status: "CHANGE_REQUIRED",
      reason: "명사 반복을 줄여야 함",
      proposed_name_ko: `다르게 빚은 ${flaggedRow.receptor_noun_form}`,
      application_hint: `SOURCE:${flaggedRow.actor_id}.modifier_form`,
    };
    changed.overrides[flaggedId] = change;
    expect(() => validateNameReviewDecisions(changed, changed.target, rows, true)).not.toThrow();
  });

  it("strictly validates CHANGE_REQUIRED application hints", () => {
    const built = build();
    const row = built.rows[0];
    const cardId = row.card_id;
    const otherMaterialId = materials.find(({ id }) => id !== row.actor_id && id !== row.receptor_id)!.id;
    const validateHint = (applicationHint: string, proposedName: string) => {
      const decisions = makeInitialNameReviewDecisions(targetFor(built));
      decisions.overrides[cardId] = {
        status: "CHANGE_REQUIRED",
        reason: "수정 필요",
        proposed_name_ko: proposedName,
        application_hint: applicationHint,
      };
      validateNameReviewDecisions(decisions, decisions.target, built.rows);
    };

    const actorProposal = `새 수식어 ${row.receptor_noun_form}`;
    const receptorProposal = `${row.actor_modifier_form} 새 명사`;
    expect(() => validateHint(`SOURCE:${row.actor_id}.modifier_form`, actorProposal)).not.toThrow();
    expect(() => validateHint(`SOURCE:${row.receptor_id}.noun_form`, receptorProposal)).not.toThrow();
    expect(() =>
      validateHint("GENERATOR_RULE:actor 방향 선택 규칙을 검토", "다른 생성 규칙 이름"),
    ).not.toThrow();
    expect(() => validateHint("임의 메모", "다른 이름")).toThrow(/application_hint must be/);
    expect(() => validateHint("SOURCE:unknown_material.modifier_form", actorProposal)).toThrow(
      /this row's actor/,
    );
    expect(() => validateHint(`SOURCE:${otherMaterialId}.modifier_form`, actorProposal)).toThrow(
      /this row's actor/,
    );
    expect(() => validateHint(`SOURCE:${row.actor_id}.noun_form`, receptorProposal)).toThrow(
      /this row's actor/,
    );
    expect(() => validateHint(`SOURCE:${row.receptor_id}.modifier_form`, actorProposal)).toThrow(
      /this row's actor/,
    );
    expect(() => validateHint(`SOURCE:${row.actor_id}.name_ko`, actorProposal)).toThrow(
      /application_hint must be/,
    );
    expect(() => validateHint("GENERATOR_RULE:   ", "다른 이름")).toThrow(/application_hint must be/);
    expect(() => validateHint(`SOURCE:${row.actor_id}.modifier_form`, "완전히 다른 이름")).toThrow(
      /must preserve this row's receptor_noun_form/,
    );
    expect(() => validateHint(`SOURCE:${row.receptor_id}.noun_form`, "완전히 다른 이름")).toThrow(
      /must preserve this row's actor_modifier_form/,
    );
    expect(() =>
      validateHint("GENERATOR_RULE:actor 방향 선택 규칙을 검토", row.generated_name_ko),
    ).toThrow(/must differ from the current generated name/);
    expect(() => validateHint(`SOURCE:${row.actor_id}.modifier_form`, ` ${row.receptor_noun_form}`)).toThrow(
      /must preserve this row's receptor_noun_form/,
    );
    expect(() => validateHint(`SOURCE:${row.receptor_id}.noun_form`, `${row.actor_modifier_form} `)).toThrow(
      /must preserve this row's actor_modifier_form/,
    );
  });

  it("requires a real ISO reviewed_at datetime with timezone", () => {
    const { decisions, rows } = makeClosedDecisions();
    decisions.reviewed_at = "2026-08-11T12:00:00";
    expect(() => validateNameReviewDecisions(decisions, decisions.target, rows, true)).toThrow(
      /ISO reviewed_at timestamp/,
    );
    decisions.reviewed_at = "2026-02-31T12:00:00+09:00";
    expect(() => validateNameReviewDecisions(decisions, decisions.target, rows, true)).toThrow(
      /ISO reviewed_at timestamp/,
    );
    decisions.reviewed_at = "2026-08-11T03:00:00Z";
    expect(() => validateNameReviewDecisions(decisions, decisions.target, rows, true)).not.toThrow();
  });
});
