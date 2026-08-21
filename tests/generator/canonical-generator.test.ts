import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runDataGeneration } from "../../scripts/gen-data";
import cardsJson from "../../src/data/generated/cards.generated.json";
import equipmentJson from "../../src/data/generated/equipment.generated.json";
import { generateCatalogPayloads } from "../../src/data/generator/generate-catalog";
import {
  calculateSourceHash,
  canonicalSerialize,
  renderCatalog,
  sha256,
  type GeneratedEnvelope,
} from "../../src/data/generator/render-generated";
import lawsJson from "../../src/data/source/laws.json";
import materialsJson from "../../src/data/source/materials.json";
import resultClassesJson from "../../src/data/source/resultClasses.json";
import type { Law, Material, ResultClass } from "../../src/data/schema/contracts";
import { validateGeneratedCatalog } from "../../src/data/schema/validate-generated-catalog";
import type { SourceData } from "../../src/data/schema/validate-source-data";
import { deriveStats, resolveForgeCard, type GeneratedCard } from "../../src/domain/forge";
import { FORGE_TUNING } from "../../src/domain/balance";
import type { GeneratedEquipmentDetail } from "../../src/data/generator/generate-catalog";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const cardsPath = resolve(repositoryRoot, "src/data/generated/cards.generated.json");
const equipmentPath = resolve(repositoryRoot, "src/data/generated/equipment.generated.json");
const materials = materialsJson as Material[];
const laws = lawsJson as Law[];
const resultClasses = resultClassesJson as ResultClass[];
const inputs = { laws, resultClasses, tuning: FORGE_TUNING };
const source: SourceData = { materials, laws, resultClasses };
const committedCards = cardsJson as GeneratedEnvelope<GeneratedCard>;
const committedEquipment = equipmentJson as GeneratedEnvelope<GeneratedEquipmentDetail>;

describe("canonical forge generator", () => {
  it("generates the complete 52C2 catalog without unresolved recipes", () => {
    expect(committedCards.count).toBe(1326);
    expect(committedCards.items).toHaveLength(1326);
    expect(Object.fromEntries(["LAW", "CATALYST", "EQUIPMENT"].map((branch) => [
      branch,
      committedCards.items.filter((card) => card.branch === branch).length,
    ]))).toEqual({ LAW: 861, CATALYST: 420, EQUIPMENT: 45 });
    expect(committedCards.items.filter((card) => card.branch !== "EQUIPMENT")).toHaveLength(1281);
    expect(validateGeneratedCatalog(committedCards, committedEquipment, source)).toEqual({
      valid: true,
      errors: [],
      schemaErrors: [],
    });
  });

  it("is directionally symmetric for all 2,652 ordered calls", () => {
    for (let left = 0; left < materials.length; left += 1) {
      for (let right = left + 1; right < materials.length; right += 1) {
        expect(resolveForgeCard(materials[left], materials[right], inputs)).toEqual(
          resolveForgeCard(materials[right], materials[left], inputs),
        );
      }
    }
  });

  it("keeps recipe, card, art, result roles, and paths canonical and unique", () => {
    const cards = committedCards.items;
    expect(new Set(cards.map((card) => card.recipe_id)).size).toBe(1326);
    expect(new Set(cards.map((card) => card.card_id)).size).toBe(1326);
    expect(new Set(cards.map((card) => card.art)).size).toBe(1326);
    for (const card of cards) {
      const [low, high] = card.material_ids;
      expect(low < high).toBe(true);
      expect(card.recipe_id).toBe(`${low}|${high}`);
      expect(card.card_id).toBe(`forge__${low}__${high}`);
      expect(card.art).toBe(`cards/${card.card_id}.png`);
      expect([card.actor_id, card.receptor_id].sort()).toEqual([low, high]);
      expect(card.art_key).toBe(`${card.result_class}/${card.actor_id}_${card.receptor_id}`);
    }
    expect(() => resolveForgeCard(materials[0], materials[0], inputs)).toThrow(/same material id/);
    expect(() => resolveForgeCard({ ...materials[0], id: "../bad" }, materials[1], inputs)).toThrow(
      /unsafe material id/,
    );
  });

  it("uses only each oddity's primary attribute", () => {
    const oddity = materials.find(({ id }) => id === "odd_01")!;
    const still = materials.find(({ id }) => id === "still_01")!;
    const card = resolveForgeCard(oddity, still, inputs);
    expect(oddity.attribute).toEqual(["JOIN", "SCATTER"]);
    expect(card.effective_attributes).toEqual(["STILL", "JOIN"]);
    expect(card.result_class).toBe(
      laws.find(({ pair }) => pair.join("|") === "STILL|JOIN")!.result_class,
    );
  });

  it("builds names from the source-owned actor modifier and receptor noun", () => {
    const byRecipe = new Map(committedCards.items.map((card) => [card.recipe_id, card]));
    expect(byRecipe.get("burn_01|still_01")?.name_ko).toBe("서리 낀 잉걸");
    expect(byRecipe.get("burn_05|rot_02")?.name_ko).toBe("불붙은 뿌리");
    expect(byRecipe.get("rot_03|tool_04")?.name_ko).toBe("밝혀진 곰팡이");

    const materialById = new Map(materials.map((material) => [material.id, material]));
    for (const card of committedCards.items) {
      expect(card.name_ko).toBe(
        `${materialById.get(card.actor_id)!.modifier_form} ${materialById.get(card.receptor_id)!.noun_form}`,
      );
    }
  });

  it("reuses exactly the 21 Law effects, including JOIN catalyst DOUBLE_FORGE", () => {
    const lawCards = committedCards.items.filter((card) => card.branch === "LAW");
    expect(new Set(lawCards.map((card) => card.combat_effect))).toEqual(
      new Set(laws.map((law) => law.combat_effect)),
    );
    const catalystEffects = new Set(
      committedCards.items
        .filter((card) => card.branch === "CATALYST")
        .map((card) => card.combat_effect),
    );
    expect(catalystEffects).toEqual(
      new Set(["AMPLIFY_STILL", "AMPLIFY_BURN", "AMPLIFY_SCATTER", "AMPLIFY_ROT", "AMPLIFY_WASH", "DOUBLE_FORGE"]),
    );
    expect(catalystEffects).not.toContain("AMPLIFY_JOIN");
    expect(
      committedCards.items
        .filter((card) => card.branch === "CATALYST")
        .every((card) => card.drawback === null),
    ).toBe(true);
  });

  it("calculates every approved non-equipment product and approved synthetic fixtures", () => {
    for (const card of committedCards.items.filter((candidate) => candidate.branch !== "EQUIPMENT")) {
      expect(card.balance_status).toBe("APPROVED");
      expect(card.stats?.potency).toBeTypeOf("number");
      expect(card.stats?.cost).toBeTypeOf("number");
      expect(card.stats?.power).toBeTypeOf("number");
    }
    const actor = { ...materials[0], balance_status: "APPROVED" as const, potency: 2, cost_base: 1 };
    const receptor = { ...materials[1], balance_status: "APPROVED" as const, potency: 3, cost_base: 2 };
    const law = { ...laws[0], balance_status: "APPROVED" as const, power_coefficient: 1.5 };
    expect(deriveStats(actor, receptor, law, { SAME_BONUS: 2, COST_DIVISOR: 3 }, true)).toEqual({
      balance_status: "APPROVED",
      stats: { potency: 7, cost: 3, power: 10.5 },
    });
    expect(deriveStats(actor, receptor, law, undefined, true).stats).toEqual({
      potency: null,
      cost: null,
      power: null,
    });
  });

  it("keeps the equipment detail view aligned without duplicate art or result fields", () => {
    expect(committedEquipment.items).toHaveLength(45);
    expect(new Set(committedEquipment.items.map((item) => item.passive_effect_id)).size).toBe(45);
    const equipmentCards = new Map(
      committedCards.items.filter((card) => card.branch === "EQUIPMENT").map((card) => [card.card_id, card]),
    );
    for (const detail of committedEquipment.items) {
      expect(Object.keys(detail)).toEqual([
        "card_id",
        "recipe_id",
        "tool_ids",
        "domains",
        "passive_effect_id",
        "passive_effect_ko",
      ]);
      expect(detail.passive_effect_ko.length).toBeGreaterThan(0);
      expect(equipmentCards.get(detail.card_id)).toMatchObject({
        recipe_id: detail.recipe_id,
        material_ids: detail.tool_ids,
        passive_effect_id: detail.passive_effect_id,
      });
    }
  });

  it("rejects source-divergent equipment detail even when its content hash is recomputed", () => {
    const changedDomains = structuredClone(committedEquipment);
    changedDomains.items[0].domains[0] = changedDomains.items[0].domains[1];
    changedDomains.content_hash = sha256(canonicalSerialize(changedDomains.items));
    const domainsResult = validateGeneratedCatalog(committedCards, changedDomains, source);
    expect(domainsResult.valid).toBe(false);
    expect(domainsResult.errors).toContain(
      `equipment source domains mismatch ${changedDomains.items[0].card_id}`,
    );

    const changedKoreanEffect = structuredClone(committedEquipment);
    changedKoreanEffect.items[0].passive_effect_ko += " ";
    changedKoreanEffect.content_hash = sha256(canonicalSerialize(changedKoreanEffect.items));
    const koreanEffectResult = validateGeneratedCatalog(committedCards, changedKoreanEffect, source);
    expect(koreanEffectResult.valid).toBe(false);
    expect(koreanEffectResult.errors).toContain(
      `equipment source interaction mismatch ${changedKoreanEffect.items[0].card_id}`,
    );
  });

  it("records deterministic provenance and renders committed bytes exactly", () => {
    const sourceHash = calculateSourceHash([materials, laws, resultClasses]);
    const payloads = generateCatalogPayloads(materials, inputs);
    const first = renderCatalog(payloads.cards, payloads.equipment, sourceHash);
    const second = renderCatalog(payloads.cards, payloads.equipment, sourceHash);
    expect(first.cardsText).toBe(second.cardsText);
    expect(first.equipmentText).toBe(second.equipmentText);
    expect(first.cardsText).toBe(readFileSync(cardsPath, "utf8"));
    expect(first.equipmentText).toBe(readFileSync(equipmentPath, "utf8"));
    expect(committedCards.source_hash).toBe(sourceHash);
    expect(committedEquipment.source_hash).toBe(sourceHash);
    expect(committedCards.content_hash).toBe(sha256(canonicalSerialize(committedCards.items)));
    expect(committedEquipment.content_hash).toBe(sha256(canonicalSerialize(committedEquipment.items)));
    expect(committedCards.generator_version).toBe("canonical-v1");
    expect(committedCards.schema_version).toBe(1);
  });

  it("checks an isolated repository and detects byte tampering without touching real generated files", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "fictor-generator-check-"));
    try {
      mkdirSync(resolve(temporaryRoot, "src/data"), { recursive: true });
      cpSync(resolve(repositoryRoot, "src/data/source"), resolve(temporaryRoot, "src/data/source"), {
        recursive: true,
      });
      cpSync(resolve(repositoryRoot, "src/data/generated"), resolve(temporaryRoot, "src/data/generated"), {
        recursive: true,
      });

      expect(runDataGeneration({ repositoryRoot: temporaryRoot, checkOnly: true })).toMatchObject({
        command: "gen:data:check",
        cards: 1326,
        equipment: 45,
        written: [],
      });

      const temporaryEquipmentPath = resolve(
        temporaryRoot,
        "src/data/generated/equipment.generated.json",
      );
      const original = readFileSync(temporaryEquipmentPath, "utf8");
      writeFileSync(
        temporaryEquipmentPath,
        original.replace('"count": 45', '"count": 44'),
        "utf8",
      );
      expect(() =>
        runDataGeneration({ repositoryRoot: temporaryRoot, checkOnly: true }),
      ).toThrow(/stale or tampered/);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
