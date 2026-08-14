import { validateRewardOffer } from "../rewards";
import type { RunEventChoiceV1, RunEventV1 } from "./types";

export function validateRunEvent(event: RunEventV1): boolean {
  if (event.choices.length === 0 || new Set(event.choices.map(({ choiceId }) => choiceId)).size !== event.choices.length) return false;
  return event.choices.every((choice) => {
    if (!choice.choiceId) return false;
    if (choice.economy.status === "APPROVED" && (!Number.isSafeInteger(choice.economy.price) || choice.economy.price < 0)) return false;
    if (event.eventType === "FICTOR" && choice.economy.status !== "APPROVED") return false;
    if (event.eventType !== "FICTOR" && choice.economy.status !== "NOT_REQUIRED") return false;
    if (event.eventType === "WORKSHOP") return choice.effect.kind === "WORKSHOP_ENTITLEMENT";
    if (event.eventType === "COLLAPSE") return choice.effect.kind === "NONE";
    const effect = choice.effect;
    if (effect.kind !== "REWARD") return false;
    const expected = event.eventType === "CACHE" ? "CACHE" : event.eventType === "ODDITY" ? "ODDITY" : event.eventType === "RECORD" ? "RECORD" : "FICTOR";
    if (effect.rewardChoiceIds.length === 0 || new Set(effect.rewardChoiceIds).size !== effect.rewardChoiceIds.length) return false;
    if (event.eventType !== "CACHE" && effect.rewardChoiceIds.length !== 1) return false;
    return effect.offer.source === expected
      && validateRewardOffer(effect.offer).valid
      && effect.rewardChoiceIds.every((rewardChoiceId) => effect.offer.choices.some(({ choiceId }) => choiceId === rewardChoiceId));
  });
}

export function selectEventChoice(event: RunEventV1, choiceId: string): RunEventChoiceV1 | undefined {
  return validateRunEvent(event) ? event.choices.find((choice) => choice.choiceId === choiceId) : undefined;
}
