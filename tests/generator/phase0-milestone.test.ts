import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runPhase0MilestoneCheck } from "../../scripts/check-phase0-data";
import { parseCsv, serializeCsv } from "../../src/data/generator/name-review";
import { canonicalSerialize, sha256, type GeneratedEnvelope } from "../../src/data/generator/render-generated";
import type { Material } from "../../src/data/schema/contracts";
import type { GeneratedCard } from "../../src/domain/forge";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];

function makeTemporaryRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "fictor-phase0-milestone-"));
  temporaryRoots.push(root);
  for (const relativePath of [
    "src/data/source",
    "src/data/generated",
    "docs/reviews/name-review.generated.csv",
    "docs/reviews/name-review.decisions.json",
    "docs/milestones/m1-phase-0-data.json",
  ]) {
    const source = resolve(repositoryRoot, relativePath);
    const destination = resolve(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
  }
  return root;
}

function readJson<T>(root: string, relativePath: string): T {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8")) as T;
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeFileSync(resolve(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function mutateMilestone(root: string, mutate: (record: Record<string, any>) => void): void {
  const path = "docs/milestones/m1-phase-0-data.json";
  const record = readJson<Record<string, any>>(root, path);
  mutate(record);
  writeJson(root, path, record);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("M1 Phase 0 immutable data milestone", () => {
  it("verifies the exact source, catalog, CSV, and all-approved human review baseline", () => {
    const result = runPhase0MilestoneCheck({ repositoryRoot });

    expect(result).toEqual({
      command: "milestone:phase0:check",
      milestone_id: "M1",
      status: "VERIFIED",
      source_hash: "7e05e02b3db844ccba7806067e196d0e4477ea4f7ce2c661440ea3820d87d720",
      cards: {
        count: 1326,
        content_hash: "283054dfb4e97d4f3420d0711ff7affb0dd2afe9d6140b81c6e77ce71b2c2886",
        file_hash: "71eb299228432f906edc0423f6dc5b90ea546e886f0bf12e7a7ebac6ace6f84f",
      },
      equipment: {
        count: 45,
        content_hash: "2d363142278173cd34d8dc40faa0fbeb3e918a818e2bedd407ee8084911a8aa7",
        file_hash: "cbe939c14cda4b63202644e9038482e1d218fa17b7077057bb97c7800448d61d",
      },
      name_review: {
        row_count: 1326,
        branch_counts: { LAW: 861, CATALYST: 420, EQUIPMENT: 45 },
        approved_names_hash: "92a963544860dab6db3d9e3e8ccf8f33bdf6668e1b145a9eed0e19b0476b2e55",
        effective_status_counts: { APPROVED: 1326, CHANGE_REQUIRED: 0, PENDING: 0, HOLD: 0 },
      },
      t044_application: {
        source_hash: "be7a99ea52ecd92438ca8171e4d9d397ff68e56cc9ac59b6b33b9b78dc5446de",
        cards_content_hash: "64be1dfff7c218620ab2aa69708331d59e928eecdacf089b50226af68fbae741",
        cards_file_hash: "5f7511623cd1b1890da3dcb8fc85a09deb4909fb713b284805bed3d0962eea9b",
        decision_binding: "T044_BALANCE_REBIND",
      },
    });
  });

  it("rejects a regenerated-name mutation even when its envelope hashes are refreshed", () => {
    const root = makeTemporaryRepository();
    const path = "src/data/generated/cards.generated.json";
    const cards = readJson<GeneratedEnvelope<GeneratedCard>>(root, path);
    cards.items[0].name_ko += " 변조";
    cards.content_hash = sha256(canonicalSerialize(cards.items));
    writeJson(root, path, cards);

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow();
  });

  it("rejects equipment byte drift", () => {
    const root = makeTemporaryRepository();
    const path = resolve(root, "src/data/generated/equipment.generated.json");
    writeFileSync(path, `${readFileSync(path, "utf8")} `, "utf8");

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow();
  });

  it("rejects source byte drift", () => {
    const root = makeTemporaryRepository();
    const path = resolve(root, "src/data/source/materials.json");
    writeFileSync(path, `${readFileSync(path, "utf8")} `, "utf8");

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow();
  });

  it("rejects a CSV name that no longer matches its generated card", () => {
    const root = makeTemporaryRepository();
    const path = resolve(root, "docs/reviews/name-review.generated.csv");
    const rows = parseCsv(readFileSync(path, "utf8"));
    const nameIndex = rows[0].indexOf("generated_name_ko");
    rows[1][nameIndex] += " 변조";
    writeFileSync(path, serializeCsv(rows), "utf8");

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow();
  });

  it("rejects a stale decision target", () => {
    const root = makeTemporaryRepository();
    const path = "docs/reviews/name-review.decisions.json";
    const decisions = readJson<Record<string, any>>(root, path);
    decisions.target.cards_file_hash = "0".repeat(64);
    writeJson(root, path, decisions);

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow(/target is stale/);
  });

  it("rejects any effective CHANGE_REQUIRED disposition", () => {
    const root = makeTemporaryRepository();
    const decisionsPath = "docs/reviews/name-review.decisions.json";
    const cards = readJson<GeneratedEnvelope<GeneratedCard>>(root, "src/data/generated/cards.generated.json");
    const materials = readJson<Material[]>(root, "src/data/source/materials.json");
    const decisions = readJson<Record<string, any>>(root, decisionsPath);
    const cardId = Object.keys(decisions.overrides)[0];
    const card = cards.items.find((candidate) => candidate.card_id === cardId)!;
    const receptor = materials.find((material) => material.id === card.receptor_id)!;
    decisions.overrides[cardId] = {
      status: "CHANGE_REQUIRED",
      reason: "회귀 검사용 미적용 처분",
      proposed_name_ko: `달라진 ${receptor.noun_form}`,
      application_hint: `SOURCE:${card.actor_id}.modifier_form`,
    };
    writeJson(root, decisionsPath, decisions);

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow(
      /T044_BALANCE_REBIND historical decisions bytes mismatch/,
    );
  });

  it("rejects a milestone hash mutation", () => {
    const root = makeTemporaryRepository();
    mutateMilestone(root, (record) => {
      record.catalog.cards.file_hash = "0".repeat(64);
    });

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow(/immutable M1 milestone bytes mismatch/);
  });

  it("rejects a milestone count mutation", () => {
    const root = makeTemporaryRepository();
    mutateMilestone(root, (record) => {
      record.catalog.equipment.count = 44;
    });

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow(/fixed path or count mismatch/);
  });

  it("rejects unknown milestone fields", () => {
    const root = makeTemporaryRepository();
    mutateMilestone(root, (record) => {
      record.catalog.cards.unreviewed_extension = true;
    });

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow(/unknown fields/);
  });

  it("rejects missing milestone fields", () => {
    const root = makeTemporaryRepository();
    mutateMilestone(root, (record) => {
      delete record.name_review.approved_names_hash;
    });

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow(/missing fields/);
  });

  it("rejects duplicate JSON keys before parsing", () => {
    const root = makeTemporaryRepository();
    const path = resolve(root, "docs/milestones/m1-phase-0-data.json");
    const text = readFileSync(path, "utf8").replace(
      '"schema_version": 1,',
      '"schema_version": 1,\n  "schema_version": 1,',
    );
    writeFileSync(path, text, "utf8");

    expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow(/duplicate JSON object key/);
  });

  it("rejects traversal in every record path instead of reading it", () => {
    const mutations: Array<(record: Record<string, any>) => void> = [
      (record) => { record.source.files[0].path = "../../materials.json"; },
      (record) => { record.source.files[1].path = "../../laws.json"; },
      (record) => { record.source.files[2].path = "../../resultClasses.json"; },
      (record) => { record.catalog.cards.path = "../../cards.json"; },
      (record) => { record.catalog.equipment.path = "../../equipment.json"; },
      (record) => { record.name_review.decisions_path = "../../decisions.json"; },
      (record) => { record.name_review.csv_path = "../../review.csv"; },
    ];

    for (const mutation of mutations) {
      const root = makeTemporaryRepository();
      mutateMilestone(root, mutation);
      expect(() => runPhase0MilestoneCheck({ repositoryRoot: root })).toThrow();
    }
  });
});
