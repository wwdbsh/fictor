import { getMaterialAuthorityEntry, isCanonicalRecipeId } from "./catalog";
import type { RewardChoiceV1, RewardOfferV1, RewardValidationResult } from "./types";

const forbiddenCardId = (id: string): boolean => id.startsWith("forge__") || id.startsWith("equipment__");
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

function choicesAreStrict(choices: readonly RewardChoiceV1[]): boolean {
  if (!unique(choices.map(({ choiceId }) => choiceId)) || choices.some(({ choiceId }) => choiceId.length === 0)) return false;
  return choices.every((choice) => {
    if (choice.kind === "MATERIAL") return !forbiddenCardId(choice.materialId) && getMaterialAuthorityEntry(choice.materialId) !== undefined;
    return isCanonicalRecipeId(choice.recipeId);
  });
}

export function validateRewardOffer(offer: RewardOfferV1): RewardValidationResult {
  if (!offer.offerId || !choicesAreStrict(offer.choices)) return { valid: false, reason: "INVALID_OFFER" };
  const materials = offer.choices.filter((choice): choice is Extract<RewardChoiceV1, { kind: "MATERIAL" }> => choice.kind === "MATERIAL");
  const recipes = offer.choices.filter((choice): choice is Extract<RewardChoiceV1, { kind: "RECIPE" }> => choice.kind === "RECIPE");
  const entries = materials.map(({ materialId }) => getMaterialAuthorityEntry(materialId)!);
  if (!unique(materials.map(({ materialId }) => materialId))) return { valid: false, reason: "DUPLICATE_REWARD" };
  if (!unique(recipes.map(({ recipeId }) => recipeId))) return { valid: false, reason: "DUPLICATE_REWARD" };

  switch (offer.source) {
    case "NORMAL":
      if (offer.choices.length !== 3 || recipes.length > 0 || entries.some(({ category }) => category === "TOOL" || category === "ODDITY")) return { valid: false, reason: "INVALID_NORMAL_OFFER" };
      break;
    case "ELITE":
      if (offer.choices.length === 0 || recipes.length > 0 || entries.some(({ category }) => category !== "TOOL" && category !== "ODDITY")) return { valid: false, reason: "INVALID_ELITE_OFFER" };
      break;
    case "CACHE":
      if (offer.choices.length === 0 || recipes.length > 0 || entries.some(({ origin }) => origin !== "GROUND_STILL")) return { valid: false, reason: "INVALID_CACHE_OFFER" };
      break;
    case "ODDITY":
      if (offer.choices.length === 0 || recipes.length > 0 || entries.some(({ category }) => category !== "ODDITY")) return { valid: false, reason: "INVALID_ODDITY_OFFER" };
      break;
    case "RECORD":
      if (offer.choices.length === 0 || materials.length > 0) return { valid: false, reason: "INVALID_RECORD_OFFER" };
      break;
    case "FICTOR":
      if (offer.choices.length === 0 || entries.some(({ category }) => category === "ODDITY")) return { valid: false, reason: "INVALID_FICTOR_OFFER" };
      break;
  }
  return { valid: true, offer };
}

export function selectBoundReward(offer: RewardOfferV1, choiceId: string): RewardChoiceV1 | undefined {
  return validateRewardOffer(offer).valid ? offer.choices.find((choice) => choice.choiceId === choiceId) : undefined;
}

export function isUniqueToolGrantAllowed(materialId: string, ownedCardIds: readonly string[]): boolean {
  const entry = getMaterialAuthorityEntry(materialId);
  return entry?.category !== "TOOL" || !ownedCardIds.includes(materialId);
}
