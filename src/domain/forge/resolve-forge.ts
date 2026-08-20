import { deriveStats } from "./stats";
import type {
  EquipmentInteraction,
  ForgeAttribute,
  ForgeInputs,
  ForgeLaw,
  ForgeMaterial,
  ForgeResultClass,
  GeneratedCard,
  JoinkinForgeResult,
  ToolDomain,
} from "./types";

const MATERIAL_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Applies Joinkin's explicit third material without producing a new canonical
 * card identity. The returned card is the exact A/B makeTier2 result.
 */
export function applyThird(
  base: GeneratedCard,
  third: ForgeMaterial,
): JoinkinForgeResult {
  if (!MATERIAL_ID_PATTERN.test(third.id)) throw new Error(`unsafe material id: ${third.id}`);
  const attribute = Array.isArray(third.attribute) ? third.attribute[0] : third.attribute;
  return {
    card: base,
    overlay: {
      third_material_id: third.id,
      resonance_attribute: attribute === "NONE" ? null : attribute,
    },
  };
}

export function resolveJoinkinForgeCard(
  first: ForgeMaterial,
  second: ForgeMaterial,
  third: ForgeMaterial,
  inputs: ForgeInputs,
): JoinkinForgeResult {
  const ids = [first.id, second.id, third.id];
  if (new Set(ids).size !== ids.length) throw new Error("Joinkin materials must have distinct definitions");
  const base = resolveForgeCard(first, second, inputs);
  if (base.branch === "EQUIPMENT") throw new Error("Joinkin base pair cannot be equipment");
  return applyThird(base, third);
}

function effectiveAttribute(material: ForgeMaterial): ForgeAttribute {
  const attribute = Array.isArray(material.attribute) ? material.attribute[0] : material.attribute;
  if (!attribute || attribute === "NONE") throw new Error(`material has no effective attribute: ${material.id}`);
  return attribute;
}

function uniqueMatch<T>(matches: readonly T[], label: string): T {
  if (matches.length !== 1) throw new Error(`${label} must resolve exactly once; found ${matches.length}`);
  return matches[0];
}

function findLawByAttributes(
  laws: readonly ForgeLaw[],
  left: ForgeAttribute,
  right: ForgeAttribute,
): ForgeLaw {
  return uniqueMatch(
    laws.filter(
      (law) =>
        (law.pair[0] === left && law.pair[1] === right) ||
        (law.pair[0] === right && law.pair[1] === left),
    ),
    `Law ${left}|${right}`,
  );
}

function findClass(resultClasses: readonly ForgeResultClass[], id: string): ForgeResultClass {
  return uniqueMatch(resultClasses.filter((candidate) => candidate.id === id), `result class ${id}`);
}

function interactionKey(left: ToolDomain, right: ToolDomain): string {
  return `${left}|${right}`;
}

function findInteraction(
  interactions: readonly EquipmentInteraction[] | undefined,
  left: ToolDomain,
  right: ToolDomain,
): EquipmentInteraction {
  if (!interactions) throw new Error("EQUIPMENT has no interactions");
  return uniqueMatch(
    interactions.filter(({ domains }) => interactionKey(domains[0], domains[1]) === interactionKey(left, right)),
    `equipment interaction ${left}|${right}`,
  );
}

function baseCard(low: ForgeMaterial, high: ForgeMaterial) {
  const recipeId = `${low.id}|${high.id}`;
  const cardId = `forge__${low.id}__${high.id}`;
  return {
    card_id: cardId,
    recipe_id: recipeId,
    material_ids: [low.id, high.id] as [string, string],
    art: `cards/${cardId}.png`,
  };
}

export function resolveForgeCard(
  first: ForgeMaterial,
  second: ForgeMaterial,
  inputs: ForgeInputs,
): GeneratedCard {
  for (const material of [first, second]) {
    if (!MATERIAL_ID_PATTERN.test(material.id)) throw new Error(`unsafe material id: ${material.id}`);
  }
  if (first.id === second.id) throw new Error(`same material id cannot be forged: ${first.id}`);

  const [low, high] = compareIds(first.id, second.id) <= 0 ? [first, second] : [second, first];
  const common = baseCard(low, high);
  const lowTool = low.category === "TOOL";
  const highTool = high.category === "TOOL";

  if (lowTool && highTool) {
    const resultClass = findClass(inputs.resultClasses, "EQUIPMENT");
    if (!low.tool_domain || !high.tool_domain) throw new Error("tool domain is required for equipment");
    const interaction = findInteraction(
      resultClass.equipment_interactions,
      low.tool_domain,
      high.tool_domain,
    );
    return {
      ...common,
      branch: "EQUIPMENT",
      result_class: resultClass.id,
      actor_id: low.id,
      receptor_id: high.id,
      name_ko: `${low.modifier_form} ${high.noun_form}`,
      effective_attributes: [],
      combat_effect: null,
      passive_effect_id: interaction.passive_effect_id,
      drawback: null,
      density: resultClass.density,
      density_status: resultClass.density_status,
      density_inputs: null,
      balance_status: "NOT_APPLICABLE",
      stats: null,
      art_key: `${resultClass.id}/${low.id}_${high.id}`,
    };
  }

  if (lowTool !== highTool) {
    const tool = lowTool ? low : high;
    const material = lowTool ? high : low;
    const attribute = effectiveAttribute(material);
    const resultClass = findClass(inputs.resultClasses, `CATALYZED_${attribute}`);
    if (!resultClass.combat_effect) throw new Error(`catalyst effect missing: ${resultClass.id}`);
    const statLaw = uniqueMatch(
      inputs.laws.filter((law) => law.combat_effect === resultClass.combat_effect),
      `catalyst stat Law ${resultClass.combat_effect}`,
    );
    const derived = deriveStats(tool, material, statLaw, inputs.tuning, false);
    return {
      ...common,
      branch: "CATALYST",
      result_class: resultClass.id,
      actor_id: tool.id,
      receptor_id: material.id,
      name_ko: `${tool.modifier_form} ${material.noun_form}`,
      effective_attributes: [attribute],
      combat_effect: resultClass.combat_effect,
      passive_effect_id: null,
      drawback: null,
      density: null,
      density_status: "DERIVED_FROM_MATERIAL",
      density_inputs: { material_id: material.id, representation: material.representation },
      balance_status: derived.balance_status,
      stats: derived.stats,
      art_key: `${resultClass.id}/${tool.id}_${material.id}`,
    };
  }

  const lowAttribute = effectiveAttribute(low);
  const highAttribute = effectiveAttribute(high);
  const law = findLawByAttributes(inputs.laws, lowAttribute, highAttribute);
  const actor =
    lowAttribute === highAttribute
      ? low
      : lowAttribute === law.actor
        ? low
        : highAttribute === law.actor
          ? high
          : (() => {
              throw new Error(`Law actor does not match recipe: ${law.actor}`);
            })();
  const receptor = actor === low ? high : low;
  const resultClass = findClass(inputs.resultClasses, law.result_class);
  if (resultClass.combat_effect !== law.combat_effect) {
    throw new Error(`Law and result class effect mismatch: ${law.result_class}`);
  }
  const derived = deriveStats(actor, receptor, law, inputs.tuning, lowAttribute === highAttribute);

  return {
    ...common,
    branch: "LAW",
    result_class: resultClass.id,
    actor_id: actor.id,
    receptor_id: receptor.id,
    name_ko: `${actor.modifier_form} ${receptor.noun_form}`,
    effective_attributes: [...law.pair],
    combat_effect: law.combat_effect,
    passive_effect_id: null,
    drawback: law.drawback ?? null,
    density: resultClass.density,
    density_status: resultClass.density_status,
    density_inputs: null,
    balance_status: derived.balance_status,
    stats: derived.stats,
    art_key: `${resultClass.id}/${actor.id}_${receptor.id}`,
  };
}
