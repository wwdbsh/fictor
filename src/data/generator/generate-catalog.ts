import { resolveForgeCard } from "../../domain/forge";
import type {
  EquipmentInteraction,
  ForgeInputs,
  ForgeMaterial,
  GeneratedCard,
  ToolDomain,
} from "../../domain/forge";

export interface GeneratedEquipmentDetail {
  card_id: string;
  recipe_id: string;
  tool_ids: [string, string];
  domains: [ToolDomain, ToolDomain];
  passive_effect_id: string;
  passive_effect_ko: string;
}

export interface CatalogPayloads {
  cards: GeneratedCard[];
  equipment: GeneratedEquipmentDetail[];
}

function compareIds(left: ForgeMaterial, right: ForgeMaterial): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function findInteraction(
  interactions: readonly EquipmentInteraction[],
  passiveEffectId: string,
): EquipmentInteraction {
  const matches = interactions.filter(({ passive_effect_id }) => passive_effect_id === passiveEffectId);
  if (matches.length !== 1) {
    throw new Error(`equipment effect ${passiveEffectId} must resolve exactly once; found ${matches.length}`);
  }
  return matches[0];
}

export function generateCatalogPayloads(
  materials: readonly ForgeMaterial[],
  inputs: ForgeInputs,
): CatalogPayloads {
  const ordered = [...materials].sort(compareIds);
  const cards: GeneratedCard[] = [];

  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      cards.push(resolveForgeCard(ordered[left], ordered[right], inputs));
    }
  }

  const equipmentClass = inputs.resultClasses.find(({ id }) => id === "EQUIPMENT");
  if (!equipmentClass?.equipment_interactions) throw new Error("EQUIPMENT interactions are required");
  const materialById = new Map(ordered.map((material) => [material.id, material]));
  const equipment = cards
    .filter((card) => card.branch === "EQUIPMENT")
    .map((card): GeneratedEquipmentDetail => {
      const [leftId, rightId] = card.material_ids;
      const left = materialById.get(leftId);
      const right = materialById.get(rightId);
      if (!left?.tool_domain || !right?.tool_domain || !card.passive_effect_id) {
        throw new Error(`incomplete equipment card ${card.card_id}`);
      }
      const interaction = findInteraction(
        equipmentClass.equipment_interactions!,
        card.passive_effect_id,
      );
      return {
        card_id: card.card_id,
        recipe_id: card.recipe_id,
        tool_ids: [leftId, rightId],
        domains: [left.tool_domain, right.tool_domain],
        passive_effect_id: card.passive_effect_id,
        passive_effect_ko: interaction.passive_effect_ko,
      };
    });

  return { cards, equipment };
}
