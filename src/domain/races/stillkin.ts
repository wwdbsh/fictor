import {
  calculateResonantPower,
  createResonanceState,
  isResonanceAttribute,
} from "../resonance";
import { freeze } from "../../freeze";
import { RESONANCE_RATE } from "../balance";
import type {
  ResonanceAttribute,
  ResonanceState,
  StillkinBlockRetention,
  StillkinCardZones,
  StillkinHardenOverlay,
  StillkinPolicy,
  StillkinResonanceRate,
  StillkinResonanceResult,
} from "./types";

export const STILLKIN_BLOCK_RETENTION: StillkinBlockRetention = freeze({
  numerator: 1,
  denominator: 2,
  rounding: "FLOOR",
});

export const STILLKIN_RESONANCE_RATE: StillkinResonanceRate = freeze({
  status: "CONFIGURED",
  value: RESONANCE_RATE,
});

export const STILLKIN_POLICY: StillkinPolicy = freeze({
  id: "Stillkin",
  attribute: "STILL",
  blockRetention: STILLKIN_BLOCK_RETENTION,
  resonanceRate: STILLKIN_RESONANCE_RATE,
  skill: freeze({
    id: "HARDEN",
    labelKo: "굳히기",
    target: "CARD_INSTANCE",
    destination: "DRAW_DECK_TOP",
    duration: "COMBAT",
  }),
});

export const stillkinPolicy = STILLKIN_POLICY;

export function createStillkinResonanceState(): ResonanceState {
  return createResonanceState();
}

/**
 * Stillkin resonance keeps every attribute's streak for the whole combat.
 * Switching the active attribute changes only the active pointer; it does not
 * erase the other per-attribute counts.
 */
export function advanceStillkinResonance(
  state: ResonanceState,
  attribute: ResonanceAttribute,
): ResonanceState {
  if (!isResonanceAttribute(attribute)) throw new Error("Invalid resonance attribute");
  const streakByAttribute = {
    ...state.streakByAttribute,
    [attribute]: state.streakByAttribute[attribute] + 1,
  };
  return { activeAttribute: attribute, streakByAttribute };
}

export function calculateStillkinResonantPower(
  power: number,
  streak: number,
  rate: StillkinResonanceRate = STILLKIN_RESONANCE_RATE,
): StillkinResonanceResult {
  if (rate.status === "PENDING_2026_08_21") {
    return { ok: false, reason: "PENDING_RESONANCE_RATE" };
  }
  return calculateResonantPower(power, streak, rate.value);
}

export function createStillkinHardenOverlay(): StillkinHardenOverlay {
  return { targetInstanceId: null };
}

export function selectStillkinHardenTarget(instanceId: string): StillkinHardenOverlay;
export function selectStillkinHardenTarget(
  _source: StillkinHardenOverlay | StillkinCardZones,
  instanceId: string,
): StillkinHardenOverlay;
export function selectStillkinHardenTarget(
  first: string | StillkinHardenOverlay | StillkinCardZones,
  second?: string,
): StillkinHardenOverlay {
  const instanceId = typeof first === "string" ? first : second;
  if (typeof instanceId !== "string" || instanceId.length === 0) {
    throw new Error("HARDEN requires a non-empty instanceId");
  }
  return { targetInstanceId: instanceId };
}

function moveTargetToDeckTop(
  zones: StillkinCardZones,
  targetInstanceId: string | null,
): StillkinCardZones {
  const deck = [...zones.deck];
  if (targetInstanceId === null) {
    return { deck, hand: [...zones.hand], discard: [...zones.discard], exile: [...zones.exile] };
  }
  const index = deck.indexOf(targetInstanceId);
  if (index > 0) {
    deck.splice(index, 1);
    deck.unshift(targetInstanceId);
  }
  return { deck, hand: [...zones.hand], discard: [...zones.discard], exile: [...zones.exile] };
}

export function enforceStillkinHarden(
  zones: StillkinCardZones,
  overlay: StillkinHardenOverlay,
): StillkinCardZones;
export function enforceStillkinHarden(
  overlay: StillkinHardenOverlay,
  zones: StillkinCardZones,
): StillkinCardZones;
export function enforceStillkinHarden(
  zones: StillkinCardZones,
  targetInstanceId: string | null,
): StillkinCardZones;
export function enforceStillkinHarden(
  first: StillkinCardZones | StillkinHardenOverlay,
  second: StillkinCardZones | StillkinHardenOverlay | string | null,
): StillkinCardZones {
  const firstIsZones = typeof first === "object" && first !== null && "deck" in first;
  const zones = firstIsZones ? first as StillkinCardZones : second as StillkinCardZones;
  const targetInstanceId = typeof second === "string" || second === null
    ? second
    : firstIsZones
      ? (second as StillkinHardenOverlay).targetInstanceId
      : (first as StillkinHardenOverlay).targetInstanceId;
  return moveTargetToDeckTop(zones, targetInstanceId);
}

export const applyStillkinHarden = enforceStillkinHarden;
export const enforceHarden = enforceStillkinHarden;
export const selectHardenTarget = selectStillkinHardenTarget;
export const enforceStillkinHardenOverlay = enforceStillkinHarden;

export function clearStillkinHarden(_overlay?: StillkinHardenOverlay): StillkinHardenOverlay {
  return createStillkinHardenOverlay();
}

export const clearHardenOverlay = clearStillkinHarden;
export const clearHarden = clearStillkinHarden;

export type {
  ResonanceAttribute,
  ResonanceState,
  StillkinBlockRetention,
  StillkinCardZones,
  StillkinHardenOverlay,
  StillkinPolicy,
  StillkinResonanceRate,
  StillkinResonanceResult,
} from "./types";
