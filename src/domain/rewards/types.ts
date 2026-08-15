export type MaterialCategoryV1 = "ORE" | "GROUND_PRODUCT" | "TOOL" | "ODDITY";

export interface MaterialAuthorityEntryV1 {
  readonly id: string;
  readonly category: MaterialCategoryV1;
  readonly origin: "GROUND_STILL" | "GROUND_BURN" | "GROUND_SCATTER" | "GROUND_ROT" | "GROUND_WASH" | "GROUND_JOIN" | "NONE";
}

export type RewardChoiceV1 =
  | { readonly choiceId: string; readonly kind: "MATERIAL"; readonly materialId: string }
  | { readonly choiceId: string; readonly kind: "RECIPE"; readonly recipeId: string };

export interface RewardOfferV1 {
  readonly offerId: string;
  readonly source: "NORMAL" | "ELITE" | "CACHE" | "ODDITY" | "RECORD" | "FICTOR";
  readonly choices: readonly RewardChoiceV1[];
}

export type RewardValidationResult =
  | { readonly valid: true; readonly offer: RewardOfferV1 }
  | { readonly valid: false; readonly reason: string };
