export const ATTRIBUTE_ORDER = ["STILL", "BURN", "SCATTER", "ROT", "WASH", "JOIN"] as const;
export const ATTRIBUTES = [...ATTRIBUTE_ORDER, "NONE"] as const;

export type Attribute = (typeof ATTRIBUTES)[number];
export type BaseAttribute = (typeof ATTRIBUTE_ORDER)[number];
export type BalanceStatus = "PENDING_2026_08_21" | "APPROVED";
export const TOOL_DOMAIN_ORDER = [
  "FORGE",
  "HAND",
  "DECK",
  "INFO",
  "SCALE",
  "ENERGY",
  "BALANCE",
  "KEEP",
  "ROUTE",
  "CARRY",
] as const;
export type ToolDomain = (typeof TOOL_DOMAIN_ORDER)[number];

export interface EquipmentInteraction {
  domains: [ToolDomain, ToolDomain];
  passive_effect_id: string;
  passive_effect_ko: string;
}

export interface Material {
  id: string;
  name_ko: string;
  attribute: Attribute | BaseAttribute[];
  modifier_form: string;
  noun_form: string;
  representation: "SOLID" | "PHENOMENON";
  category: "ORE" | "GROUND_PRODUCT" | "TOOL" | "ODDITY";
  origin:
    | "GROUND_STILL"
    | "GROUND_BURN"
    | "GROUND_SCATTER"
    | "GROUND_ROT"
    | "GROUND_WASH"
    | "GROUND_JOIN"
    | "NONE";
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EQUIPMENT" | "LEGENDARY" | null;
  rarity_status: "APPROVED" | "PENDING_DEPTH_CLASSIFICATION";
  balance_status: BalanceStatus;
  potency: number | null;
  cost_base: number | null;
  art: string;
  tool_domain?: ToolDomain;
}

export interface Law {
  pair: [BaseAttribute, BaseAttribute];
  result_class: string;
  result_name_ko: string;
  actor: BaseAttribute;
  law_text_ko: string;
  combat_effect: string;
  balance_status: BalanceStatus;
  power_coefficient: number | null;
  drawback?: string;
}

export interface ResultClass {
  id: string;
  /** Internal family label, not a generated player-facing card name. */
  name_ko: string;
  family: "CROSS" | "SAME" | "CATALYST" | "EQUIPMENT" | "HEART";
  composition: "SPECIMEN" | "CUTAWAY" | "PROCESS" | "SEQUENCE" | "CELESTIAL" | "MAP";
  colors: Array<
    | "TEAL"
    | "VERMILION"
    | "SULPHUR"
    | "ACID_GREEN"
    | "ULTRAMARINE"
    | "MAGENTA"
    | "GOLD"
    | "ACHROMATIC"
    | "METALLIC"
  >;
  density: "MIN" | "SPARSE" | "MID" | "DENSE" | "MAX" | null;
  density_status: "APPROVED" | "DERIVED_FROM_MATERIAL";
  density_rule: string | null;
  combat_effect: string | null;
  combat_effect_status: "APPROVED" | "DERIVED_PER_RECIPE" | "ATTRIBUTE_MAXIMUM_RULE";
  combat_effect_rule: string | null;
  equipment_interactions?: EquipmentInteraction[];
}

export function compareAttributes(left: BaseAttribute, right: BaseAttribute): number {
  return ATTRIBUTE_ORDER.indexOf(left) - ATTRIBUTE_ORDER.indexOf(right);
}
