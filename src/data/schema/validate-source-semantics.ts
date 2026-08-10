import {
  ATTRIBUTE_ORDER,
  TOOL_DOMAIN_ORDER,
  compareAttributes,
  type BaseAttribute,
  type Material,
  type ResultClass,
  type ToolDomain,
} from "./contracts";
import type { SourceData } from "./validate-source-data";

const PREFIX_BY_ATTRIBUTE: Record<BaseAttribute, string> = {
  STILL: "still",
  BURN: "burn",
  SCATTER: "scat",
  ROT: "rot",
  WASH: "wash",
  JOIN: "join",
};

const COLOR_BY_ATTRIBUTE: Record<BaseAttribute, ResultClass["colors"][number]> = {
  STILL: "TEAL",
  BURN: "VERMILION",
  SCATTER: "SULPHUR",
  ROT: "ACID_GREEN",
  WASH: "ULTRAMARINE",
  JOIN: "MAGENTA",
};

// These six primary/secondary pairs are generator inputs, not copies of material prose.
const ODDITY_ATTRIBUTES: Record<string, readonly [BaseAttribute, BaseAttribute]> = {
  odd_01: ["JOIN", "SCATTER"],
  odd_02: ["STILL", "JOIN"],
  odd_03: ["BURN", "JOIN"],
  odd_04: ["WASH", "SCATTER"],
  odd_05: ["JOIN", "WASH"],
  odd_06: ["ROT", "STILL"],
};

const CATALYST_EFFECTS: Record<BaseAttribute, string> = {
  STILL: "AMPLIFY_STILL",
  BURN: "AMPLIFY_BURN",
  SCATTER: "AMPLIFY_SCATTER",
  ROT: "AMPLIFY_ROT",
  WASH: "AMPLIFY_WASH",
  JOIN: "DOUBLE_FORGE",
};

export interface SemanticValidationResult {
  valid: boolean;
  errors: string[];
}

function expectedMaterialIds(): Set<string> {
  return new Set([
    ...ATTRIBUTE_ORDER.map((attribute) => `ore_${attribute.toLowerCase()}`),
    ...ATTRIBUTE_ORDER.flatMap((attribute) =>
      Array.from({ length: 5 }, (_, index) =>
        `${PREFIX_BY_ATTRIBUTE[attribute]}_${String(index + 1).padStart(2, "0")}`,
      ),
    ),
    ...Array.from({ length: 10 }, (_, index) => `tool_${String(index + 1).padStart(2, "0")}`),
    ...Array.from({ length: 6 }, (_, index) => `odd_${String(index + 1).padStart(2, "0")}`),
  ]);
}

function expectedLawPairs(): Array<readonly [BaseAttribute, BaseAttribute]> {
  return ATTRIBUTE_ORDER.flatMap((left, leftIndex) =>
    ATTRIBUTE_ORDER.slice(leftIndex).map((right) => [left, right] as const),
  );
}

function sameValues(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateMaterialStructure(material: Material, errors: string[]): void {
  if (material.art !== `cards/${material.id}.png`) errors.push(`material art mismatch ${material.id}`);

  const oreAttribute = ATTRIBUTE_ORDER.find(
    (attribute) => material.id === `ore_${attribute.toLowerCase()}`,
  );
  if (oreAttribute) {
    if (
      material.category !== "ORE" ||
      material.attribute !== oreAttribute ||
      material.origin !== `GROUND_${oreAttribute}` ||
      material.rarity_status !== "APPROVED" ||
      material.rarity !== "COMMON" ||
      material.representation !== (oreAttribute === "SCATTER" ? "PHENOMENON" : "SOLID")
    ) {
      errors.push(`ore structure mismatch ${material.id}`);
    }
    return;
  }

  const groundAttribute = ATTRIBUTE_ORDER.find((attribute) =>
    material.id.startsWith(`${PREFIX_BY_ATTRIBUTE[attribute]}_`),
  );
  if (groundAttribute) {
    const sequence = Number(material.id.slice(-2));
    if (
      material.category !== "GROUND_PRODUCT" ||
      material.attribute !== groundAttribute ||
      material.origin !== `GROUND_${groundAttribute}` ||
      material.rarity_status !== "PENDING_DEPTH_CLASSIFICATION" ||
      material.rarity !== null ||
      material.representation !== (sequence <= 3 ? "SOLID" : "PHENOMENON")
    ) {
      errors.push(`ground product structure mismatch ${material.id}`);
    }
    return;
  }

  if (material.id.startsWith("tool_")) {
    if (
      material.category !== "TOOL" ||
      material.attribute !== "NONE" ||
      material.origin !== "NONE" ||
      material.representation !== "SOLID" ||
      material.rarity_status !== "APPROVED" ||
      material.rarity !== "UNCOMMON"
    ) {
      errors.push(`tool structure mismatch ${material.id}`);
    }
    return;
  }

  const oddityAttributes = ODDITY_ATTRIBUTES[material.id];
  if (oddityAttributes) {
    if (
      material.category !== "ODDITY" ||
      !Array.isArray(material.attribute) ||
      !sameValues(material.attribute, oddityAttributes) ||
      material.origin !== "NONE" ||
      material.representation !== "SOLID" ||
      material.rarity_status !== "APPROVED" ||
      material.rarity !== "RARE"
    ) {
      errors.push(`oddity structure mismatch ${material.id}`);
    }
  }
}

export function validateSourceSemantics(source: SourceData): SemanticValidationResult {
  const errors: string[] = [];
  const expectedIds = expectedMaterialIds();
  const materialIds = source.materials.map((material) => material.id);
  const uniqueMaterialIds = new Set(materialIds);
  if (uniqueMaterialIds.size !== materialIds.length) errors.push("material ids must be unique");
  if (
    uniqueMaterialIds.size !== expectedIds.size ||
    [...expectedIds].some((id) => !uniqueMaterialIds.has(id))
  ) {
    errors.push("material id set mismatch");
  }
  for (const material of source.materials) validateMaterialStructure(material, errors);

  const toolDomains = source.materials
    .filter((material) => material.category === "TOOL")
    .map((material) => material.tool_domain);
  if (
    toolDomains.length !== TOOL_DOMAIN_ORDER.length ||
    new Set(toolDomains).size !== TOOL_DOMAIN_ORDER.length ||
    TOOL_DOMAIN_ORDER.some((domain) => !toolDomains.includes(domain))
  ) {
    errors.push("tool domains must be unique and complete");
  }
  for (const [index, expectedDomain] of TOOL_DOMAIN_ORDER.entries()) {
    const toolId = `tool_${String(index + 1).padStart(2, "0")}`;
    if (source.materials.find((material) => material.id === toolId)?.tool_domain !== expectedDomain) {
      errors.push(`tool domain mapping mismatch ${toolId}`);
    }
  }

  const resultClassById = new Map(source.resultClasses.map((resultClass) => [resultClass.id, resultClass]));
  if (resultClassById.size !== source.resultClasses.length) errors.push("result class ids must be unique");

  const expectedPairs = expectedLawPairs();
  const expectedPairKeys = new Set(expectedPairs.map((pair) => pair.join("|")));
  const lawPairKeys = source.laws.map((law) => law.pair.join("|"));
  const uniqueLawPairKeys = new Set(lawPairKeys);
  if (uniqueLawPairKeys.size !== lawPairKeys.length) errors.push("law pairs must be unique");
  if (
    uniqueLawPairKeys.size !== expectedPairKeys.size ||
    [...expectedPairKeys].some((pair) => !uniqueLawPairKeys.has(pair))
  ) {
    errors.push("law pair set mismatch");
  }
  if (new Set(source.laws.map((law) => law.combat_effect)).size !== 21) {
    errors.push("Law combat effects must be unique across all 21 Laws");
  }

  const referencedLawClassIds = new Set<string>();
  for (const law of source.laws) {
    const [left, right] = law.pair;
    const pairKey = law.pair.join("|");
    if (!expectedPairKeys.has(pairKey) || compareAttributes(left, right) > 0 || law.actor !== left) {
      errors.push(`non-canonical law ${pairKey}`);
    }
    if (Boolean(law.drawback) !== (left === right)) errors.push(`law drawback mismatch ${pairKey}`);

    const resultClass = resultClassById.get(law.result_class);
    referencedLawClassIds.add(law.result_class);
    const expectedColors =
      left === right ? [COLOR_BY_ATTRIBUTE[left]] : [COLOR_BY_ATTRIBUTE[left], COLOR_BY_ATTRIBUTE[right]];
    if (
      !resultClass ||
      resultClass.name_ko !== law.result_name_ko ||
      resultClass.combat_effect !== law.combat_effect ||
      resultClass.family !== (left === right ? "SAME" : "CROSS") ||
      !sameValues(resultClass.colors, expectedColors) ||
      resultClass.density === null ||
      resultClass.density_status !== "APPROVED" ||
      resultClass.combat_effect === null ||
      resultClass.combat_effect_status !== "APPROVED"
    ) {
      errors.push(`law result class mismatch ${pairKey}`);
    }
  }

  const expectedFamilyCounts: Record<ResultClass["family"], number> = {
    CROSS: 15,
    SAME: 6,
    CATALYST: 6,
    EQUIPMENT: 1,
    HEART: 6,
  };
  for (const [family, expected] of Object.entries(expectedFamilyCounts)) {
    if (source.resultClasses.filter((resultClass) => resultClass.family === family).length !== expected) {
      errors.push(`result family count mismatch ${family}`);
    }
  }
  const lawFamilyClassIds = new Set(
    source.resultClasses
      .filter((resultClass) => resultClass.family === "CROSS" || resultClass.family === "SAME")
      .map((resultClass) => resultClass.id),
  );
  if (
    referencedLawClassIds.size !== lawFamilyClassIds.size ||
    [...lawFamilyClassIds].some((id) => !referencedLawClassIds.has(id))
  ) {
    errors.push("Law references must equal the CROSS/SAME result class set");
  }

  for (const attribute of ATTRIBUTE_ORDER) {
    const catalyst = resultClassById.get(`CATALYZED_${attribute}`);
    if (
      !catalyst ||
      catalyst.family !== "CATALYST" ||
      catalyst.composition !== "SPECIMEN" ||
      !sameValues(catalyst.colors, [COLOR_BY_ATTRIBUTE[attribute]]) ||
      catalyst.density !== null ||
      catalyst.density_status !== "DERIVED_FROM_MATERIAL" ||
      !catalyst.density_rule ||
      catalyst.combat_effect !== CATALYST_EFFECTS[attribute] ||
      catalyst.combat_effect_status !== "APPROVED" ||
      catalyst.combat_effect_rule !== null
    ) {
      errors.push(`catalyst contract mismatch ${attribute}`);
    }
  }

  const equipment = resultClassById.get("EQUIPMENT");
  if (
    !equipment ||
    equipment.family !== "EQUIPMENT" ||
    equipment.composition !== "CUTAWAY" ||
    !sameValues(equipment.colors, ["ACHROMATIC", "METALLIC"]) ||
    equipment.density !== "DENSE" ||
    equipment.density_status !== "APPROVED" ||
    equipment.combat_effect !== null ||
    equipment.combat_effect_status !== "DERIVED_PER_RECIPE" ||
    !equipment.combat_effect_rule ||
    equipment.equipment_interactions?.length !== 45
  ) {
    errors.push("equipment contract mismatch");
  }
  if (equipment?.equipment_interactions) {
    const expectedInteractionKeys = new Set(
      TOOL_DOMAIN_ORDER.flatMap((left, leftIndex) =>
        TOOL_DOMAIN_ORDER.slice(leftIndex + 1).map((right) => `${left}|${right}`),
      ),
    );
    const interactionKeys = equipment.equipment_interactions.map(({ domains }) => domains.join("|"));
    if (
      new Set(interactionKeys).size !== 45 ||
      interactionKeys.some((key) => !expectedInteractionKeys.has(key))
    ) {
      errors.push("equipment interaction pairs must equal the canonical 10C2 set");
    }
    for (const interaction of equipment.equipment_interactions) {
      const [left, right] = interaction.domains as [ToolDomain, ToolDomain];
      if (
        interaction.passive_effect_id !== `EQUIPMENT_${left}_${right}` ||
        interaction.passive_effect_ko.trim().length === 0
      ) {
        errors.push(`equipment interaction mismatch ${left}|${right}`);
      }
    }
  }

  for (const attribute of ATTRIBUTE_ORDER) {
    const heart = resultClassById.get(`HEART_${attribute}`);
    if (
      !heart ||
      heart.family !== "HEART" ||
      heart.composition !== "CELESTIAL" ||
      !sameValues(heart.colors, ["GOLD", COLOR_BY_ATTRIBUTE[attribute]]) ||
      heart.density !== "MAX" ||
      heart.density_status !== "APPROVED" ||
      heart.combat_effect !== null ||
      heart.combat_effect_status !== "ATTRIBUTE_MAXIMUM_RULE" ||
      !heart.combat_effect_rule
    ) {
      errors.push(`heart contract mismatch ${attribute}`);
    }
  }

  const lawEffects = new Set(source.laws.map((law) => law.combat_effect));
  for (const resultClass of source.resultClasses) {
    if (
      ["CROSS", "SAME", "CATALYST"].includes(resultClass.family) &&
      resultClass.combat_effect_status === "APPROVED" &&
      (!resultClass.combat_effect || !lawEffects.has(resultClass.combat_effect))
    ) {
      errors.push(`approved general effect is outside Law 21: ${resultClass.id}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
