import type { ResonanceAttribute, ResonanceState } from "../resonance";
import type { CombatState } from "../combat";

export type StillkinResonanceRate =
  | { readonly status: "PENDING_2026_08_21" }
  | { readonly status: "CONFIGURED"; readonly value: number };

export interface StillkinBlockRetention {
  readonly numerator: 1;
  readonly denominator: 2;
  readonly rounding: "FLOOR";
}

export interface StillkinHardenOverlay {
  readonly targetInstanceId: string | null;
}

export interface StillkinCardZones {
  readonly deck: readonly string[];
  readonly hand: readonly string[];
  readonly discard: readonly string[];
  readonly exile: readonly string[];
}

export type StillkinResonanceFailure =
  | "PENDING_RESONANCE_RATE"
  | "INVALID_POWER"
  | "INVALID_STREAK"
  | "INVALID_RESONANCE_RATE"
  | "CALCULATION_OVERFLOW";

export type StillkinResonanceResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: StillkinResonanceFailure };

export interface StillkinPolicy {
  readonly id: "Stillkin";
  readonly attribute: "STILL";
  readonly blockRetention: StillkinBlockRetention;
  readonly resonanceRate: StillkinResonanceRate;
  readonly skill: {
    readonly id: "HARDEN";
    readonly labelKo: "굳히기";
    readonly target: "CARD_INSTANCE";
    readonly destination: "DRAW_DECK_TOP";
    readonly duration: "COMBAT";
  };
}

export interface BurnkinProvisionalRules {
  readonly hpToEnergy: {
    readonly hpCost: number;
    readonly energyGain: number;
    readonly mustRemainAlive: true;
  };
  readonly resonanceRateMultiplier: 2;
  readonly resonanceBreakSelfDamage: number;
}

export interface BurnkinPolicy {
  readonly id: "Burnkin";
  readonly attribute: "BURN";
  readonly passive: {
    readonly id: "BLOOD_TO_ENERGY";
    readonly labelKo: "피 태우기";
  };
  readonly skill: {
    readonly id: "KINDLE";
    readonly labelKo: "지피기";
    readonly target: "HAND_CARD_INSTANCE";
    readonly destination: "EXILE";
  };
  readonly resonance: {
    readonly rateMultiplier: 2;
    readonly breakEffect: "DIRECT_SELF_DAMAGE";
  };
}

export type BurnkinFailure =
  | "INVALID_STATE"
  | "INVALID_RULES"
  | "INVALID_PHASE"
  | "INSUFFICIENT_HP"
  | "ENERGY_CAP_EXCEEDED"
  | "CARD_NOT_FOUND"
  | "CARD_NOT_IN_HAND"
  | "CARD_COST_UNAVAILABLE"
  | "CALCULATION_OVERFLOW";

export type BurnkinEvent =
  | { readonly type: "BURNKIN_HP_PAID"; readonly amount: number; readonly remainingHp: number }
  | { readonly type: "BURNKIN_ENERGY_GAINED"; readonly source: "PASSIVE" | "KINDLE"; readonly amount: number; readonly remaining: number }
  | { readonly type: "BURNKIN_CARD_KINDLED"; readonly instanceId: string; readonly cardId: string; readonly energyGained: number }
  | { readonly type: "BURNKIN_RESONANCE_BROKEN"; readonly from: ResonanceAttribute; readonly to: ResonanceAttribute; readonly selfDamage: number; readonly remainingHp: number };

export type BurnkinTransition =
  | { readonly ok: true; readonly state: CombatState; readonly events: readonly BurnkinEvent[] }
  | { readonly ok: false; readonly state: CombatState | null; readonly reason: BurnkinFailure; readonly events: readonly [] };

export type { ResonanceAttribute, ResonanceState };
