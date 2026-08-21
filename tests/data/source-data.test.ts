import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import lawsJson from "../../src/data/source/laws.json";
import materialsJson from "../../src/data/source/materials.json";
import resultClassesJson from "../../src/data/source/resultClasses.json";
import {
  ATTRIBUTE_ORDER,
  TOOL_DOMAIN_ORDER,
  compareAttributes,
  type BaseAttribute,
  type Law,
  type Material,
  type ResultClass,
} from "../../src/data/schema/contracts";
import { inspectSourceReadiness } from "../../src/data/schema/readiness";
import { validateSourceSemantics } from "../../src/data/schema/validate-source-semantics";
import { validateSourceSchemas, type SourceData } from "../../src/data/schema/validate-source-data";

const materials = materialsJson as Material[];
const laws = lawsJson as Law[];
const resultClasses = resultClassesJson as ResultClass[];
const source: SourceData = { materials, laws, resultClasses };

const colorByAttribute: Record<BaseAttribute, ResultClass["colors"][number]> = {
  STILL: "TEAL",
  BURN: "VERMILION",
  SCATTER: "SULPHUR",
  ROT: "ACID_GREEN",
  WASH: "ULTRAMARINE",
  JOIN: "MAGENTA",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function pairKey(pair: readonly BaseAttribute[]): string {
  return pair.join("|");
}

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/u)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

describe("hand-authored source data", () => {
  it("keeps exactly three hand-authored JSON sources", () => {
    const sourceRoot = resolve(import.meta.dirname, "../../src/data/source");
    const jsonFiles = readdirSync(sourceRoot)
      .filter((path) => path.endsWith(".json"))
      .sort();

    expect(jsonFiles).toEqual(["laws.json", "materials.json", "resultClasses.json"]);
  });

  it("passes JSON Schema validation with closed object shapes", () => {
    expect(validateSourceSchemas(source)).toEqual({ valid: true, errors: [] });

    const withUnknownField = clone(source);
    Object.assign(withUnknownField.materials[0], { undocumented: true });
    const result = validateSourceSchemas(withUnknownField);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.keyword === "additionalProperties")).toBe(true);
  });

  it("passes reusable semantic validation", () => {
    expect(validateSourceSemantics(source)).toEqual({ valid: true, errors: [] });
  });

  it("rejects placeholder or partially approved balance values", () => {
    const pendingMaterialWithNumber = clone(source);
    pendingMaterialWithNumber.materials[0].balance_status = "PENDING_2026_08_21";
    expect(validateSourceSchemas(pendingMaterialWithNumber).valid).toBe(false);

    const approvedMaterialWithNull = clone(source);
    approvedMaterialWithNull.materials[0].potency = null;
    expect(validateSourceSchemas(approvedMaterialWithNull).valid).toBe(false);

    const pendingLawWithNumber = clone(source);
    pendingLawWithNumber.laws[0].balance_status = "PENDING_2026_08_21";
    expect(validateSourceSchemas(pendingLawWithNumber).valid).toBe(false);

    const approvedLawWithNull = clone(source);
    approvedLawWithNull.laws[0].power_coefficient = null;
    expect(validateSourceSchemas(approvedLawWithNull).valid).toBe(false);

    const approved = clone(source);
    approved.materials[0].balance_status = "APPROVED";
    approved.materials[0].potency = 3;
    approved.materials[0].cost_base = 0;
    approved.laws[0].balance_status = "APPROVED";
    approved.laws[0].power_coefficient = 0.5;
    expect(validateSourceSchemas(approved).valid).toBe(true);
  });

  it("rejects mismatched rarity, density, and effect statuses", () => {
    const pendingRarityWithValue = clone(source);
    pendingRarityWithValue.materials.find(
      (material) => material.category === "GROUND_PRODUCT",
    )!.rarity = "COMMON";
    expect(validateSourceSchemas(pendingRarityWithValue).valid).toBe(false);

    const approvedRarityWithNull = clone(source);
    approvedRarityWithNull.materials[0].rarity = null;
    expect(validateSourceSchemas(approvedRarityWithNull).valid).toBe(false);

    const unresolvedDensityWithValue = clone(source);
    const catalyst = unresolvedDensityWithValue.resultClasses.find(
      (resultClass) => resultClass.family === "CATALYST",
    )!;
    catalyst.density = "MID";
    expect(validateSourceSchemas(unresolvedDensityWithValue).valid).toBe(false);

    const approvedDensityWithNull = clone(source);
    approvedDensityWithNull.resultClasses[0].density = null;
    expect(validateSourceSchemas(approvedDensityWithNull).valid).toBe(false);

    const derivedEffectWithValue = clone(source);
    const heart = derivedEffectWithValue.resultClasses.find(
      (resultClass) => resultClass.family === "HEART",
    )!;
    heart.combat_effect = "PLACEHOLDER";
    expect(validateSourceSchemas(derivedEffectWithValue).valid).toBe(false);

    const approvedEffectWithNull = clone(source);
    approvedEffectWithNull.resultClasses[0].combat_effect = null;
    expect(validateSourceSchemas(approvedEffectWithNull).valid).toBe(false);
  });

  it("enforces material cardinality, categories, identity, and art paths", () => {
    expect(materials).toHaveLength(52);
    expect(Object.fromEntries(["ORE", "GROUND_PRODUCT", "TOOL", "ODDITY"].map((category) => [
      category,
      materials.filter((material) => material.category === category).length,
    ]))).toEqual({ ORE: 6, GROUND_PRODUCT: 30, TOOL: 10, ODDITY: 6 });

    expect(new Set(materials.map((material) => material.id)).size).toBe(52);
    for (const material of materials) {
      expect(material.art).toBe(`cards/${material.id}.png`);
      expect(material.balance_status).toBe("APPROVED");
      expect(material.potency).toBeTypeOf("number");
      expect(material.cost_base).toBeTypeOf("number");
    }
  });

  it("keeps category-specific attribute, origin, representation, and rarity rules", () => {
    for (const material of materials) {
      if (material.category === "ODDITY") {
        expect(Array.isArray(material.attribute)).toBe(true);
        const attributes = material.attribute as BaseAttribute[];
        expect(attributes).toHaveLength(2);
        expect(new Set(attributes).size).toBe(2);
        expect(attributes).not.toContain("NONE");
        expect(material.origin).toBe("NONE");
        expect(material.representation).toBe("SOLID");
        expect([material.rarity_status, material.rarity]).toEqual(["APPROVED", "RARE"]);
      } else {
        expect(Array.isArray(material.attribute)).toBe(false);
      }

      if (material.category === "TOOL") {
        expect(material.attribute).toBe("NONE");
        expect(material.origin).toBe("NONE");
        expect(material.representation).toBe("SOLID");
        expect([material.rarity_status, material.rarity]).toEqual(["APPROVED", "UNCOMMON"]);
        expect(material.tool_domain).toBeDefined();
      } else {
        expect(material.tool_domain).toBeUndefined();
      }

      if (material.category === "ORE") {
        expect([material.rarity_status, material.rarity]).toEqual(["APPROVED", "COMMON"]);
      }

      if (material.category === "GROUND_PRODUCT") {
        expect(material.origin).toBe(`GROUND_${material.attribute as BaseAttribute}`);
        expect([material.rarity_status, material.rarity]).toEqual([
          "PENDING_DEPTH_CLASSIFICATION",
          null,
        ]);
      }
    }
  });

  it("contains every canonical law pair once with the first attribute as actor", () => {
    const expectedPairs = ATTRIBUTE_ORDER.flatMap((left, leftIndex) =>
      ATTRIBUTE_ORDER.slice(leftIndex).map((right) => [left, right] as const),
    );

    expect(laws).toHaveLength(21);
    expect(new Set(laws.map((law) => pairKey(law.pair))).size).toBe(21);
    expect(new Set(laws.map((law) => law.result_class)).size).toBe(21);
    expect(new Set(laws.map((law) => pairKey(law.pair)))).toEqual(
      new Set(expectedPairs.map(pairKey)),
    );

    for (const law of laws) {
      expect(compareAttributes(law.pair[0], law.pair[1])).toBeLessThanOrEqual(0);
      expect(law.actor).toBe(law.pair[0]);
      expect(law.balance_status).toBe("APPROVED");
      expect(law.power_coefficient).toBeTypeOf("number");
      expect(Boolean(law.drawback)).toBe(law.pair[0] === law.pair[1]);
    }
  });

  it("keeps law references consistent with the CROSS/SAME source classes", () => {
    const resultClassById = new Map(resultClasses.map((resultClass) => [resultClass.id, resultClass]));
    const referencedIds = new Set(laws.map((law) => law.result_class));
    const lawFamilyIds = new Set(
      resultClasses
        .filter((resultClass) => resultClass.family === "CROSS" || resultClass.family === "SAME")
        .map((resultClass) => resultClass.id),
    );

    expect(referencedIds).toEqual(lawFamilyIds);
    for (const law of laws) {
      const resultClass = resultClassById.get(law.result_class);
      expect(resultClass).toMatchObject({
        name_ko: law.result_name_ko,
        density_status: "APPROVED",
        combat_effect: law.combat_effect,
        combat_effect_status: "APPROVED",
      });
      expect(resultClass?.density).not.toBeNull();
      expect(resultClass?.family).toBe(
        law.pair[0] === law.pair[1] ? "SAME" : "CROSS",
      );
      expect(resultClass?.colors).toEqual(
        law.pair[0] === law.pair[1]
          ? [colorByAttribute[law.pair[0]]]
          : law.pair.map((attribute) => colorByAttribute[attribute]),
      );
    }
  });

  it("enforces the 34 result-class family contracts", () => {
    expect(resultClasses).toHaveLength(34);
    expect(new Set(resultClasses.map((resultClass) => resultClass.id)).size).toBe(34);
    expect(Object.fromEntries(["CROSS", "SAME", "CATALYST", "EQUIPMENT", "HEART"].map((family) => [
      family,
      resultClasses.filter((resultClass) => resultClass.family === family).length,
    ]))).toEqual({ CROSS: 15, SAME: 6, CATALYST: 6, EQUIPMENT: 1, HEART: 6 });

    const catalysts = resultClasses.filter((resultClass) => resultClass.family === "CATALYST");
    for (const [index, resultClass] of catalysts.entries()) {
      const attribute = ATTRIBUTE_ORDER[index];
      expect(resultClass).toMatchObject({
        id: `CATALYZED_${attribute}`,
        composition: "SPECIMEN",
        colors: [colorByAttribute[attribute]],
        density: null,
        density_status: "DERIVED_FROM_MATERIAL",
        combat_effect: attribute === "JOIN" ? "DOUBLE_FORGE" : `AMPLIFY_${attribute}`,
        combat_effect_status: "APPROVED",
      });
    }

    expect(resultClasses.find((resultClass) => resultClass.family === "EQUIPMENT")).toMatchObject({
      id: "EQUIPMENT",
      composition: "CUTAWAY",
      colors: ["ACHROMATIC", "METALLIC"],
      density: "DENSE",
      density_status: "APPROVED",
      combat_effect: null,
      combat_effect_status: "DERIVED_PER_RECIPE",
    });
    const equipment = resultClasses.find((resultClass) => resultClass.family === "EQUIPMENT")!;
    expect(equipment.equipment_interactions).toHaveLength(45);
    expect(new Set(equipment.equipment_interactions?.flatMap(({ domains }) => domains))).toEqual(
      new Set(TOOL_DOMAIN_ORDER),
    );

    const hearts = resultClasses.filter((resultClass) => resultClass.family === "HEART");
    for (const [index, resultClass] of hearts.entries()) {
      const attribute = ATTRIBUTE_ORDER[index];
      expect(resultClass).toMatchObject({
        id: `HEART_${attribute}`,
        composition: "CELESTIAL",
        colors: ["GOLD", colorByAttribute[attribute]],
        density: "MAX",
        density_status: "APPROVED",
        combat_effect: null,
        combat_effect_status: "ATTRIBUTE_MAXIMUM_RULE",
      });
    }
  });

  it("keeps Korean source strings within the approved tone checks", () => {
    const userStrings = [
      ...materials.flatMap((material) => [material.name_ko, material.modifier_form, material.noun_form]),
      ...laws.flatMap((law) => [law.result_name_ko, law.law_text_ko, law.drawback].filter(Boolean) as string[]),
      ...resultClasses.flatMap((resultClass) => [
        resultClass.name_ko,
        resultClass.density_rule,
        resultClass.combat_effect_rule,
        ...((resultClass.equipment_interactions ?? []).map(({ passive_effect_ko }) => passive_effect_ko)),
      ].filter(Boolean) as string[]),
    ];
    const finiteOverstatementTerms = ["놀라운", "엄청난", "경이로운", "압도적인", "궁극의"];

    for (const text of userStrings) {
      expect(text).not.toContain("!");
      expect(text).not.toContain("당신");
      expect(finiteOverstatementTerms.some((term) => text.includes(term))).toBe(false);
      expect(countSentences(text)).toBeLessThanOrEqual(2);
    }
  });

  it("exposes readiness without hiding unresolved decisions", () => {
    expect(inspectSourceReadiness(source)).toEqual({
      t004CatalogStructure: "READY",
      rewardTables: "BLOCKED_BY_PENDING_RARITY",
      combatBalance: "READY",
      artManifest: "READY",
    });
  });

  it("rejects adversarial semantic mutations that still fit basic JSON shapes", () => {
    const wrongOreOrigin = clone(source);
    wrongOreOrigin.materials.find((material) => material.id === "ore_still")!.origin = "NONE";
    expect(validateSourceSchemas(wrongOreOrigin).valid).toBe(true);
    expect(validateSourceSemantics(wrongOreOrigin).valid).toBe(false);

    const changedCanonicalIdentity = clone(source);
    const renamed = changedCanonicalIdentity.materials.find((material) => material.id === "still_01")!;
    renamed.id = "still_99";
    renamed.art = "cards/still_99.png";
    expect(validateSourceSchemas(changedCanonicalIdentity).valid).toBe(true);
    expect(validateSourceSemantics(changedCanonicalIdentity).valid).toBe(false);

    const wrongGroundAttribute = clone(source);
    wrongGroundAttribute.materials.find((material) => material.id === "still_01")!.attribute = "BURN";
    expect(validateSourceSchemas(wrongGroundAttribute).valid).toBe(true);
    expect(validateSourceSemantics(wrongGroundAttribute).valid).toBe(false);

    const swappedOddityPrimary = clone(source);
    swappedOddityPrimary.materials.find((material) => material.id === "odd_01")!.attribute = [
      "SCATTER",
      "JOIN",
    ];
    expect(validateSourceSchemas(swappedOddityPrimary).valid).toBe(true);
    expect(validateSourceSemantics(swappedOddityPrimary).valid).toBe(false);

    const duplicateLawPair = clone(source);
    duplicateLawPair.laws[0].pair = [...duplicateLawPair.laws[1].pair];
    duplicateLawPair.laws[0].actor = duplicateLawPair.laws[0].pair[0];
    expect(validateSourceSchemas(duplicateLawPair).valid).toBe(true);
    expect(validateSourceSemantics(duplicateLawPair).valid).toBe(false);

    const duplicateLawEffectWithConsistentClass = clone(source);
    const firstLaw = duplicateLawEffectWithConsistentClass.laws[0];
    const secondLaw = duplicateLawEffectWithConsistentClass.laws[1];
    secondLaw.combat_effect = firstLaw.combat_effect;
    duplicateLawEffectWithConsistentClass.resultClasses.find(
      ({ id }) => id === secondLaw.result_class,
    )!.combat_effect = firstLaw.combat_effect;
    expect(validateSourceSchemas(duplicateLawEffectWithConsistentClass).valid).toBe(true);
    expect(validateSourceSemantics(duplicateLawEffectWithConsistentClass).valid).toBe(false);

    const missingLawPair = clone(source);
    missingLawPair.laws.pop();
    expect(validateSourceSemantics(missingLawPair).valid).toBe(false);

    const inventedCatalystEffect = clone(source);
    inventedCatalystEffect.resultClasses.find(
      (resultClass) => resultClass.id === "CATALYZED_JOIN",
    )!.combat_effect = "AMPLIFY_JOIN";
    expect(validateSourceSchemas(inventedCatalystEffect).valid).toBe(true);
    expect(validateSourceSemantics(inventedCatalystEffect).valid).toBe(false);

    const pendingHeartMeaning = clone(source);
    Object.assign(
      pendingHeartMeaning.resultClasses.find((resultClass) => resultClass.id === "HEART_STILL")!,
      { combat_effect_status: "PENDING_2026_08_21" },
    );
    expect(validateSourceSchemas(pendingHeartMeaning).valid).toBe(false);
    expect(validateSourceSemantics(pendingHeartMeaning).valid).toBe(false);

    const duplicateToolDomain = clone(source);
    duplicateToolDomain.materials.find(({ id }) => id === "tool_02")!.tool_domain = "FORGE";
    expect(validateSourceSchemas(duplicateToolDomain).valid).toBe(true);
    expect(validateSourceSemantics(duplicateToolDomain).valid).toBe(false);

    const swappedToolDomains = clone(source);
    const firstTool = swappedToolDomains.materials.find(({ id }) => id === "tool_01")!;
    const secondTool = swappedToolDomains.materials.find(({ id }) => id === "tool_02")!;
    [firstTool.tool_domain, secondTool.tool_domain] = [secondTool.tool_domain, firstTool.tool_domain];
    expect(validateSourceSchemas(swappedToolDomains).valid).toBe(true);
    expect(validateSourceSemantics(swappedToolDomains).valid).toBe(false);

    const missingEquipmentPair = clone(source);
    missingEquipmentPair.resultClasses.find(({ id }) => id === "EQUIPMENT")!
      .equipment_interactions!.pop();
    expect(validateSourceSchemas(missingEquipmentPair).valid).toBe(false);
    expect(validateSourceSemantics(missingEquipmentPair).valid).toBe(false);

    const forgedEquipmentId = clone(source);
    forgedEquipmentId.resultClasses.find(({ id }) => id === "EQUIPMENT")!
      .equipment_interactions![0].passive_effect_id = "EQUIPMENT_HAND_FORGE";
    expect(validateSourceSchemas(forgedEquipmentId).valid).toBe(true);
    expect(validateSourceSemantics(forgedEquipmentId).valid).toBe(false);
  });

  it("allows source-owned Korean labels to change without updating a mirror", () => {
    const revised = clone(source);
    const material = revised.materials.find((candidate) => candidate.id === "still_01")!;
    material.name_ko = "서리 핀 꽃";
    material.modifier_form = "서리 맺힌";
    material.noun_form = "서리꽃 송이";

    const law = revised.laws.find((candidate) => candidate.pair.join("|") === "STILL|BURN")!;
    const resultClass = revised.resultClasses.find((candidate) => candidate.id === law.result_class)!;
    law.result_name_ko = "붙잡힌 불";
    resultClass.name_ko = "붙잡힌 불";

    expect(validateSourceSchemas(revised).valid).toBe(true);
    expect(validateSourceSemantics(revised)).toEqual({ valid: true, errors: [] });
  });
});
