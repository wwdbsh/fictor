import type { RewardOfferV1 } from "../rewards";

export type RunEventTypeV1 = "CACHE" | "WORKSHOP" | "COLLAPSE" | "FICTOR" | "RECORD" | "ODDITY";

export type EventEffectV1 =
  | { readonly kind: "NONE" }
  | { readonly kind: "WORKSHOP_ENTITLEMENT" }
  | { readonly kind: "REWARD"; readonly offer: RewardOfferV1; readonly rewardChoiceIds: readonly string[] };

export interface RunEventChoiceV1 {
  readonly choiceId: string;
  readonly effect: EventEffectV1;
  readonly economy: { readonly status: "NOT_REQUIRED" } | { readonly status: "CONFIGURATION_PENDING" } | { readonly status: "APPROVED"; readonly price: number };
}

export interface RunEventV1 {
  readonly eventType: RunEventTypeV1;
  readonly choices: readonly RunEventChoiceV1[];
}
