export type ForgeAttribute = "STILL" | "BURN" | "SCATTER" | "ROT" | "WASH" | "JOIN";
export type ToolDomain =
  | "FORGE"
  | "HAND"
  | "DECK"
  | "INFO"
  | "SCALE"
  | "ENERGY"
  | "BALANCE"
  | "KEEP"
  | "ROUTE"
  | "CARRY";

export interface ForgeMaterial {
  id: string;
  attribute: ForgeAttribute | "NONE" | ForgeAttribute[];
  modifier_form: string;
  noun_form: string;
  representation: "SOLID" | "PHENOMENON";
  category: "ORE" | "GROUND_PRODUCT" | "TOOL" | "ODDITY";
  balance_status: "PENDING_2026_08_21" | "APPROVED";
  potency: number | null;
  cost_base: number | null;
  tool_domain?: ToolDomain;
}

export interface ForgeLaw {
  pair: [ForgeAttribute, ForgeAttribute];
  result_class: string;
  actor: ForgeAttribute;
  combat_effect: string;
  balance_status: "PENDING_2026_08_21" | "APPROVED";
  power_coefficient: number | null;
  drawback?: string;
}

export interface EquipmentInteraction {
  domains: [ToolDomain, ToolDomain];
  passive_effect_id: string;
  passive_effect_ko: string;
}

export interface ForgeResultClass {
  id: string;
  family: "CROSS" | "SAME" | "CATALYST" | "EQUIPMENT" | "HEART";
  density: "MIN" | "SPARSE" | "MID" | "DENSE" | "MAX" | null;
  density_status: "APPROVED" | "DERIVED_FROM_MATERIAL";
  combat_effect: string | null;
  equipment_interactions?: EquipmentInteraction[];
}

export interface ForgeTuning {
  SAME_BONUS: number;
  COST_DIVISOR: number;
}

export interface CardStats {
  potency: number | null;
  cost: number | null;
  power: number | null;
}

export interface DensityInputs {
  material_id: string;
  representation: "SOLID" | "PHENOMENON";
}

export interface GeneratedCard {
  card_id: string;
  recipe_id: string;
  material_ids: [string, string];
  branch: "LAW" | "CATALYST" | "EQUIPMENT";
  result_class: string;
  actor_id: string;
  receptor_id: string;
  name_ko: string;
  effective_attributes: ForgeAttribute[];
  combat_effect: string | null;
  passive_effect_id: string | null;
  drawback: string | null;
  density: "MIN" | "SPARSE" | "MID" | "DENSE" | "MAX" | null;
  density_status: "APPROVED" | "DERIVED_FROM_MATERIAL";
  density_inputs: DensityInputs | null;
  balance_status: "PENDING_2026_08_21" | "APPROVED" | "NOT_APPLICABLE";
  stats: CardStats | null;
  art_key: string;
  art: string;
}

export interface JoinkinThirdOverlay {
  /** The canonical third material definition. It never participates in the recipe id. */
  third_material_id: string;
  /** NONE tools preserve the base card's resonance attribute. */
  resonance_attribute: ForgeAttribute | null;
}

export interface JoinkinForgeResult {
  card: GeneratedCard;
  overlay: JoinkinThirdOverlay;
}

export interface ForgeInputs {
  laws: readonly ForgeLaw[];
  resultClasses: readonly ForgeResultClass[];
  tuning?: ForgeTuning;
}
