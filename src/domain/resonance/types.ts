export const RESONANCE_ATTRIBUTES = [
  "STILL",
  "BURN",
  "SCATTER",
  "ROT",
  "WASH",
  "JOIN",
] as const;

export type ResonanceAttribute = (typeof RESONANCE_ATTRIBUTES)[number];

export type StreakByAttribute = Record<ResonanceAttribute, number>;

export interface ResonanceState {
  activeAttribute: ResonanceAttribute | null;
  streakByAttribute: StreakByAttribute;
}

export type ResonanceCalculationFailure =
  | "INVALID_POWER"
  | "INVALID_STREAK"
  | "INVALID_RESONANCE_RATE"
  | "CALCULATION_OVERFLOW";

export type ResonanceCalculationResult =
  | { ok: true; value: number }
  | { ok: false; reason: ResonanceCalculationFailure };
