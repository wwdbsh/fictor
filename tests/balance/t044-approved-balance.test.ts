import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { BROWSER_RUNTIME_PACKET } from "../../src/application";
import { STILLKIN_TRACK1_PROVISIONAL_CONFIG } from "../../src/application/run/track1-config";
import cardsJson from "../../src/data/generated/cards.generated.json";
import equipmentJson from "../../src/data/generated/equipment.generated.json";
import { buildNameReview, sortByRawCardId } from "../../src/data/generator/name-review";
import {
  calculateSourceHash,
  canonicalSerialize,
  sha256,
  type GeneratedEnvelope,
} from "../../src/data/generator/render-generated";
import lawsJson from "../../src/data/source/laws.json";
import materialsJson from "../../src/data/source/materials.json";
import resultClassesJson from "../../src/data/source/resultClasses.json";
import type { Law, Material, ResultClass } from "../../src/data/schema/contracts";
import { COST_DIVISOR, FORGE_TUNING, RESONANCE_RATE, SAME_BONUS } from "../../src/domain/balance";
import {
  FORGE_RUNTIME_SOURCE_HASH,
  STILLKIN_RESONANCE_RATE,
  type GeneratedCard,
} from "../../src/domain";
import {
  FORGE_RUNTIME_PROJECTION_HASH,
  projectionHash,
} from "../../src/domain/forge-runtime/source-binding";
import type { GeneratedEquipmentDetail } from "../../src/data/generator/generate-catalog";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const approvalPath = resolve(repositoryRoot, "docs/balance/t043-approved-values-2026-08-21.json");
const approvalText = readFileSync(approvalPath, "utf8");
const approval = JSON.parse(approvalText) as {
  schema: string;
  schema_version: number;
  status: string;
  task: { key: string; issue: number; contract_hash: string };
  source: Record<string, unknown>;
  evidence: { t042_evidence_sha256: string };
  approval: Record<string, unknown>;
  scope: {
    approved_value_sets: string[];
    card_exceptions: unknown[];
    structural_changes: boolean;
    application_status: string;
    application_task: string;
  };
  global_coefficients: { SAME_BONUS: number; COST_DIVISOR: number; RESONANCE_RATE: number };
  laws: Array<{ pair: [string, string]; combat_effect: string; power_coefficient: number }>;
  materials: Array<{ id: string; potency: number; cost_base: number }>;
};
const materials = materialsJson as Material[];
const laws = lawsJson as Law[];
const resultClasses = resultClassesJson as ResultClass[];
const cards = cardsJson as GeneratedEnvelope<GeneratedCard>;
const equipment = equipmentJson as GeneratedEnvelope<GeneratedEquipmentDetail>;

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalHash(value: unknown): string {
  return sha256(canonicalSerialize(value));
}

describe("T044 approved balance application", () => {
  it("pins the immutable T043 authority, evidence, status, and no-exception scope", () => {
    expect(sha256Text(approvalText)).toBe(
      "1b97e425bd857279f48470c2b59681b012935e6f7d45cf97e7c46b567a9ba086",
    );
    expect({
      schema: approval.schema,
      schema_version: approval.schema_version,
      status: approval.status,
      task: approval.task,
      source: approval.source,
      evidence: approval.evidence,
      approval: approval.approval,
      scope: approval.scope,
    }).toEqual({
      schema: "fictor.t043.final-balance-approval",
      schema_version: 1,
      status: "APPROVED_NOT_APPLIED",
      task: {
        key: "T043",
        issue: 45,
        contract_hash: "6c8c4fad0e74d50f24d72ba5b3627165fdbefba6c128afbf02e6b7441533cd2a",
      },
      source: {
        task: "T042",
        option: "A",
        merge_commit: "f75cd45291260d9ca1d1c557e7ac20773378412f",
        path: "docs/playtests/t042/balance-playtest-raw.json",
        json_pointer: "/report/proposals/recommended",
      },
      evidence: {
        t042_evidence_sha256: "175a9b464e03a2286e38bb236fcc54e1468f855f29a9d2c31f4c1a8867bbe8e3",
      },
      approval: {
        decision: "OPTION_A",
        approved_by: "상헌 님",
        approved_on: "2026-08-21",
        timezone: "Asia/Seoul",
        message: "A를 최종값으로 승인합니다",
      },
      scope: {
        approved_value_sets: ["global_coefficients", "laws", "materials"],
        card_exceptions: [],
        structural_changes: false,
        application_status: "NOT_APPLIED",
        application_task: "T044",
      },
    });
  });

  it("applies exactly 52 material and 21 pair/effect values with approved statuses", () => {
    expect(materials).toHaveLength(52);
    expect(laws).toHaveLength(21);
    expect(materials.map(({ id, potency, cost_base }) => ({ id, potency, cost_base }))).toEqual(
      approval.materials,
    );
    expect(materials.every(({ balance_status }) => balance_status === "APPROVED")).toBe(true);
    expect(laws.map(({ pair, combat_effect, power_coefficient }) => ({
      pair,
      combat_effect,
      power_coefficient,
    }))).toEqual(approval.laws);
    expect(laws.every(({ balance_status }) => balance_status === "APPROVED")).toBe(true);
    expect(new Set(laws.map(({ combat_effect }) => combat_effect))).toEqual(
      new Set(approval.laws.map(({ combat_effect }) => combat_effect)),
    );
    expect(approval.scope.card_exceptions).toEqual([]);
  });

  it("binds the exact approved globals into generators, runtime packet, and race rates", () => {
    expect({ SAME_BONUS, COST_DIVISOR, RESONANCE_RATE }).toEqual(approval.global_coefficients);
    expect(FORGE_TUNING).toEqual({ SAME_BONUS: 1, COST_DIVISOR: 3 });
    expect(BROWSER_RUNTIME_PACKET.resolverContext.inputs.tuning).toEqual(FORGE_TUNING);
    expect(STILLKIN_TRACK1_PROVISIONAL_CONFIG.combat.resonanceRate).toBe(RESONANCE_RATE);
    expect(STILLKIN_RESONANCE_RATE).toEqual({ status: "CONFIGURED", value: RESONANCE_RATE });
    expect(RESONANCE_RATE * 2).toBe(0.16);
    expect(calculateSourceHash([materials, laws, resultClasses])).toBe(FORGE_RUNTIME_SOURCE_HASH);
    expect(FORGE_RUNTIME_SOURCE_HASH).toBe(
      "be7a99ea52ecd92438ca8171e4d9d397ff68e56cc9ac59b6b33b9b78dc5446de",
    );
    expect(projectionHash(BROWSER_RUNTIME_PACKET.resolverContext)).toBe(
      FORGE_RUNTIME_PROJECTION_HASH,
    );
    expect(FORGE_RUNTIME_PROJECTION_HASH).toBe(
      "2f33edbd6c2ef0aa05a2a012cab42a2d230fcf1b330a1f53005c79c4743293b2",
    );
  });

  it("independently verifies every approved non-equipment card formula and equipment invariance", () => {
    const materialById = new Map(materials.map((item) => [item.id, item]));
    const lawByPair = new Map(laws.map((item) => [item.pair.join("|"), item]));
    const lawByEffect = new Map(laws.map((item) => [item.combat_effect, item]));
    const nonEquipment = cards.items.filter(({ branch }) => branch !== "EQUIPMENT");
    expect(nonEquipment).toHaveLength(1281);
    for (const card of nonEquipment) {
      const actor = materialById.get(card.actor_id)!;
      const receptor = materialById.get(card.receptor_id)!;
      const law = card.branch === "LAW"
        ? lawByPair.get(card.effective_attributes.join("|"))!
        : lawByEffect.get(card.combat_effect!)!;
      const sameAttribute = card.branch === "LAW" && card.effective_attributes[0] === card.effective_attributes[1];
      const potency = actor.potency! + receptor.potency! + (sameAttribute ? SAME_BONUS : 0);
      expect(card.balance_status, card.card_id).toBe("APPROVED");
      expect(card.stats, card.card_id).toEqual({
        potency,
        cost: Math.ceil(potency / COST_DIVISOR),
        power: potency * law.power_coefficient!,
      });
    }
    expect(cards.items.filter(({ branch }) => branch === "EQUIPMENT")).toHaveLength(45);
    expect(canonicalHash(equipment.items)).toBe(
      "2d363142278173cd34d8dc40faa0fbeb3e918a818e2bedd407ee8084911a8aa7",
    );
  });

  it("pins every stable non-balance projection and immutable review evidence", () => {
    expect(canonicalHash(materials.map(({ balance_status, potency, cost_base, ...item }) => item))).toBe(
      "2b57d9b7838a929fde8355495595b1974c500b72dcd14a1ed40628d4a895340d",
    );
    expect(canonicalHash(laws.map(({ balance_status, power_coefficient, ...item }) => item))).toBe(
      "e726363f05a9a5efcbeebcc0d5957e90003edd7c76e2f28525eda572c21ed5d5",
    );
    expect(canonicalHash(resultClasses)).toBe(
      "d41eff30f36dfe19585f40c6402df3c7385fd87b5ed264106133877edbef5863",
    );
    expect(canonicalHash(cards.items.map(({ balance_status, stats, ...item }) => item))).toBe(
      "ca57870ad48194f479eba9ac69851b3094409848587a995e59b2a10a5c87627b",
    );
    const review = buildNameReview({ materials, laws, cards: cards.items, equipment: equipment.items });
    expect(canonicalHash(review.rows)).toBe(
      "abe566ce68c9f7abf1b094f88931227bf3fa6c5cd59d0aba52aaeee30f8ee328",
    );
    expect(sha256Text(review.csvText)).toBe(
      "53543dac48d591402890bc498463ce6353876efb558bc383822b9c2c0702b960",
    );
    const approvedNames = sortByRawCardId(cards.items).map(({ card_id, name_ko }) => ({ card_id, name_ko }));
    expect(canonicalHash(approvedNames)).toBe(
      "92a963544860dab6db3d9e3e8ccf8f33bdf6668e1b145a9eed0e19b0476b2e55",
    );
    expect(sha256Text(readFileSync(resolve(repositoryRoot, "docs/reviews/name-review.decisions.json"), "utf8"))).toBe(
      "de7466939821bdf973c3431332234fcd6ad2fcfe82b49364da3ab0919be9f9cb",
    );
    expect(sha256Text(readFileSync(resolve(repositoryRoot, "docs/milestones/m1-phase-0-data.json"), "utf8"))).toBe(
      "6dfea2df7af21df4ed991de63d3d331f356def10caec48a069c4a44394470f8a",
    );
  });
});
