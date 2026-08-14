import {
  RESONANCE_ATTRIBUTES,
  type ResonanceAttribute,
  type ResonanceCalculationResult,
  type ResonanceState,
  type StreakByAttribute,
} from "./types";

const MAX_CALCULATION_MAGNITUDE = Number.MAX_SAFE_INTEGER;

function emptyStreaks(): StreakByAttribute {
  return {
    STILL: 0,
    BURN: 0,
    SCATTER: 0,
    ROT: 0,
    WASH: 0,
    JOIN: 0,
  };
}

function isSafeCalculation(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_CALCULATION_MAGNITUDE;
}

export function isResonanceAttribute(value: unknown): value is ResonanceAttribute {
  return typeof value === "string" && RESONANCE_ATTRIBUTES.some((attribute) => attribute === value);
}

export function createResonanceState(): ResonanceState {
  return { activeAttribute: null, streakByAttribute: emptyStreaks() };
}

export function currentResonanceStreak(state: ResonanceState): number {
  return state.activeAttribute === null ? 0 : state.streakByAttribute[state.activeAttribute];
}

export function advanceResonance(
  state: ResonanceState,
  attribute: ResonanceAttribute,
): ResonanceState {
  const streakByAttribute = emptyStreaks();
  streakByAttribute[attribute] =
    state.activeAttribute === attribute ? state.streakByAttribute[attribute] + 1 : 1;
  return { activeAttribute: attribute, streakByAttribute };
}

export function calculateResonantPower(
  power: number,
  streak: number,
  resonanceRate: number | null,
): ResonanceCalculationResult {
  if (!isSafeCalculation(power) || power < 0) return { ok: false, reason: "INVALID_POWER" };
  if (!Number.isSafeInteger(streak) || streak < 1) return { ok: false, reason: "INVALID_STREAK" };
  if (
    resonanceRate === null ||
    !isSafeCalculation(resonanceRate) ||
    resonanceRate < 0
  ) {
    return { ok: false, reason: "INVALID_RESONANCE_RATE" };
  }

  const resonanceBonus = streak * resonanceRate;
  const multiplier = 1 + resonanceBonus;
  const value = power * multiplier;
  if (!isSafeCalculation(resonanceBonus) || !isSafeCalculation(multiplier) || !isSafeCalculation(value)) {
    return { ok: false, reason: "CALCULATION_OVERFLOW" };
  }
  return { ok: true, value };
}
