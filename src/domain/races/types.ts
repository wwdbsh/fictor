import type { ResonanceAttribute, ResonanceState } from "../resonance";

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

export type { ResonanceAttribute, ResonanceState };
