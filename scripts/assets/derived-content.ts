import { ATTRIBUTE_ORDER, type BaseAttribute, type Material, type ResultClass } from "../../src/data/schema/contracts";
import { buildCardPrompt, buildWorldPrompt, paperToneForId } from "./prompt";
import type { AssetPromptInputs, PlannedAsset } from "./types";

export interface CanonicalCardInput {
  card_id: string;
  material_ids: [string, string];
  art: string;
  branch: "LAW" | "CATALYST" | "EQUIPMENT";
  result_class: string;
  actor_id: string;
  receptor_id: string;
  density: string | null;
  density_status: "APPROVED" | "DERIVED_FROM_MATERIAL";
  density_inputs: { material_id: string; representation: string } | null;
}

const ATTRIBUTE_COLORS: Record<BaseAttribute, string> = {
  STILL: "TEAL",
  BURN: "VERMILION",
  SCATTER: "SULPHUR",
  ROT: "ACID_GREEN",
  WASH: "ULTRAMARINE",
  JOIN: "MAGENTA",
};

const SHAPES = ["SWARM", "BULK", "SHELL", "REACH", "MIMIC"] as const;
const EVENT_TYPES = ["CACHE", "WORKSHOP", "COLLAPSE", "FICTOR", "RECORD", "ODDITY"] as const;
const DEPTH_SUBJECTS: Record<BaseAttribute, [string, string, string]> = {
  STILL: ["frost-covered plain of interrupted objects", "frozen waterfall and stairs", "colossal structure in absolute stillness"],
  BURN: ["field of cooled ash", "burning light beneath cracked ground", "inextinguishable deep fire core"],
  SCATTER: ["dust-filled basin", "field of floating rocks", "open air with no ground"],
  ROT: ["subsiding surface", "layers collapsing into each other", "floor continually sinking away"],
  WASH: ["field of worn stones", "smoothly eroded channels", "nearly complete blank space"],
  JOIN: ["objects beginning to adhere", "indistinguishable joined mass", "one immense connected organism"],
};
const LIGHTS: Record<BaseAttribute, string> = {
  STILL: "low pale light with long motionless shadows",
  BURN: "light rising from the ground itself",
  SCATTER: "scattered light with indistinct shadows",
  ROT: "thin light leaking down from above",
  WASH: "uniform diffuse light with almost no shadows",
  JOIN: "fractured light entering through narrow seams",
};
const TERRAIN_PAPERS: Record<BaseAttribute, AssetPromptInputs["paper"]> = {
  STILL: "BLUE_GREY",
  BURN: "SCORCHED_BROWN",
  SCATTER: "CREAM",
  ROT: "OCHRE",
  WASH: "CREAM",
  JOIN: "OCHRE",
};

function token(value: string): string {
  return value.toLowerCase();
}

function primaryAttribute(material: Material): BaseAttribute {
  const attribute = Array.isArray(material.attribute) ? material.attribute[0] : material.attribute;
  if (attribute === "NONE") throw new Error(`material ${material.id} has no primary attribute`);
  return attribute;
}

function representationForPair(left: Material, right: Material): string {
  return left.representation === "PHENOMENON" || right.representation === "PHENOMENON"
    ? "PHENOMENON"
    : "SOLID";
}

function asset(
  id: string,
  category: PlannedAsset["category"],
  path: string,
  inputs: AssetPromptInputs,
  options: { aspect?: PlannedAsset["aspect_ratio"]; world?: boolean; landscape?: boolean; sourceArt?: string } = {},
): PlannedAsset {
  return {
    id,
    category,
    path,
    aspect_ratio: options.aspect ?? "3:4",
    prompt: options.world ? buildWorldPrompt(inputs, options.landscape) : buildCardPrompt(inputs),
    prompt_inputs: inputs,
    ...(options.sourceArt ? { source_art: options.sourceArt } : {}),
  };
}

export function deriveMaterialAssets(materials: readonly Material[]): PlannedAsset[] {
  return materials.map((material) => {
    const isTool = material.category === "TOOL";
    const attribute = isTool ? undefined : primaryAttribute(material);
    const colors = isTool ? ["ACHROMATIC", "METALLIC"] : [ATTRIBUTE_COLORS[attribute!]];
    const inputs: AssetPromptInputs = {
      composition: "SPECIMEN",
      colors,
      density: "SPARSE",
      paper: paperToneForId(material.id),
      subject: `${material.name_ko} (${material.noun_form})`,
      representation: material.representation,
      ...(attribute ? { attribute } : {}),
    };
    return asset(material.id, "MATERIAL", material.art, inputs, { sourceArt: material.art });
  });
}

export function deriveCanonicalAssets(
  cards: readonly CanonicalCardInput[],
  materials: readonly Material[],
  resultClasses: readonly ResultClass[],
): PlannedAsset[] {
  const materialById = new Map(materials.map((item) => [item.id, item]));
  const classById = new Map(resultClasses.map((item) => [item.id, item]));
  return cards.map((card) => {
    const actor = materialById.get(card.actor_id);
    const receptor = materialById.get(card.receptor_id);
    const resultClass = classById.get(card.result_class);
    if (!actor || !receptor || !resultClass) throw new Error(`unresolved canonical prompt inputs for ${card.card_id}`);
    const materialInputs = card.density_inputs ? [card.density_inputs] : undefined;
    const density =
      card.density_status === "DERIVED_FROM_MATERIAL"
        ? `DERIVED_FROM_MATERIAL(${card.density_inputs?.material_id}:${card.density_inputs?.representation})`
        : card.density;
    if (!density) throw new Error(`missing density for ${card.card_id}`);
    const inputs: AssetPromptInputs = {
      composition: resultClass.composition,
      colors: [...resultClass.colors],
      density,
      paper: paperToneForId(card.card_id),
      subject: `${actor.noun_form} combined with ${receptor.noun_form}`,
      representation: representationForPair(actor, receptor),
      ...(materialInputs ? { material_inputs: materialInputs } : {}),
    };
    return asset(card.card_id, "CANONICAL", card.art, inputs, { sourceArt: card.art });
  });
}

export function deriveHeartAssets(materials: readonly Material[]): PlannedAsset[] {
  return ATTRIBUTE_ORDER.map((attribute) => {
    const id = `heart__${token(attribute)}`;
    const inputs: AssetPromptInputs = {
      composition: "CELESTIAL",
      colors: ["GOLD", ATTRIBUTE_COLORS[attribute]],
      density: "MAX",
      paper: paperToneForId(id),
      subject: `the heart of the ancient ${token(attribute)} god, frontal and monumental`,
      representation: "SOLID",
      attribute,
    };
    return asset(id, "HEART", `cards/${id}.png`, inputs);
  });
}

export function deriveHeartForgeAssets(materials: readonly Material[]): PlannedAsset[] {
  const firstGroundNoun = new Map<BaseAttribute, string>();
  for (const material of [...materials].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)) {
    if (material.category === "GROUND_PRODUCT") {
      const attribute = primaryAttribute(material);
      if (!firstGroundNoun.has(attribute)) firstGroundNoun.set(attribute, material.noun_form);
    }
  }
  return ATTRIBUTE_ORDER.flatMap((godAttribute) =>
    ATTRIBUTE_ORDER.map((targetAttribute) => {
      const noun = firstGroundNoun.get(targetAttribute);
      if (!noun) throw new Error(`missing first GROUND_PRODUCT for ${targetAttribute}`);
      const id = `heart_forge__${token(godAttribute)}__${token(targetAttribute)}`;
      const inputs: AssetPromptInputs = {
        composition: "CELESTIAL",
        colors: ["GOLD", ATTRIBUTE_COLORS[targetAttribute]],
        density: "MAX",
        paper: paperToneForId(id),
        subject: `${token(godAttribute)} god heart transformed through ${noun}`,
        representation: "SOLID",
        attribute: targetAttribute,
        secondary_attribute: godAttribute,
      };
      return asset(id, "HEART_FORGE", `cards/${id}.png`, inputs);
    }),
  );
}

export function deriveBackgroundAssets(): PlannedAsset[] {
  return ATTRIBUTE_ORDER.flatMap((attribute) =>
    [1, 2, 3].map((depth) => {
      const id = `background__${token(attribute)}__depth_${String(depth).padStart(2, "0")}`;
      const inputs: AssetPromptInputs = {
        composition: "LANDSCAPE",
        colors: [ATTRIBUTE_COLORS[attribute]],
        density: ["SPARSE", "MID", "DENSE"][depth - 1],
        paper: TERRAIN_PAPERS[attribute],
        subject: `${DEPTH_SUBJECTS[attribute][depth - 1]}; ${LIGHTS[attribute]}`,
        attribute,
        depth,
      };
      return asset(id, "BACKGROUND", `backgrounds/${id}.png`, inputs, {
        aspect: "16:9",
        world: true,
        landscape: true,
      });
    }),
  );
}

export function deriveEnemyAssets(materials: readonly Material[]): PlannedAsset[] {
  return ATTRIBUTE_ORDER.flatMap((attribute) => {
    const groundProducts = materials
      .filter((material) => material.category === "GROUND_PRODUCT" && primaryAttribute(material) === attribute)
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    if (groundProducts.length !== SHAPES.length) {
      throw new Error(`${attribute} must have exactly five GROUND_PRODUCT materials`);
    }
    return groundProducts.map((material, index) => {
      const shape = SHAPES[index];
      const id = `enemy__${token(attribute)}__${token(shape)}`;
      const inputs: AssetPromptInputs = {
        composition: "SPECIMEN",
        colors: [ATTRIBUTE_COLORS[attribute]],
        density: "MID",
        paper: paperToneForId(id),
        subject: `${material.noun_form} gathered into the enemy form ${shape}`,
        representation: material.representation,
        material_inputs: [{ material_id: material.id, representation: material.representation }],
        attribute,
        shape,
      };
      return asset(id, "ENEMY", `enemies/${id}.png`, inputs, { world: true });
    });
  });
}

export function deriveEliteAssets(): PlannedAsset[] {
  return ATTRIBUTE_ORDER.map((attribute, index) => {
    const adjacent = ATTRIBUTE_ORDER[(index + 1) % ATTRIBUTE_ORDER.length];
    const id = `elite__${token(attribute)}__${token(adjacent)}`;
    const inputs: AssetPromptInputs = {
      composition: "CUTAWAY",
      colors: [ATTRIBUTE_COLORS[attribute], ATTRIBUTE_COLORS[adjacent]],
      density: "DENSE",
      paper: paperToneForId(id),
      subject: `elite creature formed where ${token(attribute)} and ${token(adjacent)} fragments mix`,
      attribute,
      secondary_attribute: adjacent,
    };
    return asset(id, "ELITE", `enemies/${id}.png`, inputs, { world: true });
  });
}

export function deriveEventAssets(): PlannedAsset[] {
  const descriptors: Array<{ type: (typeof EVENT_TYPES)[number]; attribute?: BaseAttribute }> = [
    ...EVENT_TYPES.map((type) => ({ type })),
    ...ATTRIBUTE_ORDER.map((attribute) => ({ type: "CACHE" as const, attribute })),
    ...ATTRIBUTE_ORDER.map((attribute) => ({ type: "ODDITY" as const, attribute })),
    { type: "COLLAPSE", attribute: "BURN" },
    { type: "COLLAPSE", attribute: "WASH" },
  ];
  return descriptors.map(({ type, attribute }) => {
    const id = `event__${token(type)}${attribute ? `__${token(attribute)}` : ""}`;
    const inputs: AssetPromptInputs = {
      composition: "SEQUENCE",
      colors: attribute ? [ATTRIBUTE_COLORS[attribute]] : ["ACHROMATIC"],
      density: "MID",
      paper: paperToneForId(id),
      subject: `${token(type)} encounter${attribute ? ` in the ${token(attribute)} ground` : " common to all grounds"}`,
      ...(attribute ? { attribute } : {}),
      event_type: type,
    };
    return asset(id, "EVENT", `events/${id}.png`, inputs, { world: true });
  });
}

export function deriveAllAssets(
  materials: readonly Material[],
  cards: readonly CanonicalCardInput[],
  resultClasses: readonly ResultClass[],
): PlannedAsset[] {
  return [
    ...deriveMaterialAssets(materials),
    ...deriveCanonicalAssets(cards, materials, resultClasses),
    ...deriveHeartAssets(materials),
    ...deriveHeartForgeAssets(materials),
    ...deriveBackgroundAssets(),
    ...deriveEnemyAssets(materials),
    ...deriveEliteAssets(),
    ...deriveEventAssets(),
  ];
}
