import { decodeCombatState, type CombatState } from "../combat";
import { RESONANCE_ATTRIBUTES, type ResonanceAttribute } from "../resonance";
import type {
  BurnkinPolicy,
  BurnkinProvisionalRules,
  BurnkinTransition,
} from "./types";

export const BURNKIN_POLICY: BurnkinPolicy = Object.freeze({
  id: "Burnkin",
  attribute: "BURN",
  passive: Object.freeze({ id: "BLOOD_TO_ENERGY", labelKo: "피 태우기" }),
  skill: Object.freeze({
    id: "KINDLE",
    labelKo: "지피기",
    target: "HAND_CARD_INSTANCE",
    destination: "EXILE",
  }),
  resonance: Object.freeze({
    rateMultiplier: 2,
    breakEffect: "DIRECT_SELF_DAMAGE",
  }),
});

export const burnkinPolicy = BURNKIN_POLICY;

function validPositiveSafe(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function validRules(rules: BurnkinProvisionalRules): boolean {
  return validPositiveSafe(rules.hpToEnergy.hpCost)
    && validPositiveSafe(rules.hpToEnergy.energyGain)
    && rules.hpToEnergy.mustRemainAlive === true
    && rules.resonanceRateMultiplier === 2
    && validPositiveSafe(rules.resonanceBreakSelfDamage);
}

function validAttribute(value: unknown): value is ResonanceAttribute {
  return typeof value === "string" && RESONANCE_ATTRIBUTES.includes(value as ResonanceAttribute);
}

function snapshot(state: unknown): CombatState | null {
  const decoded = decodeCombatState(state);
  return decoded.valid ? decoded.value : null;
}

function reject(state: unknown, reason: Exclude<BurnkinTransition, { ok: true }>["reason"]): BurnkinTransition {
  return { ok: false, state: snapshot(state), reason, events: [] };
}

function actionState(state: unknown): CombatState | null {
  const candidate = snapshot(state);
  return candidate?.status === "ONGOING" && candidate.phase === "PLAYER_ACTION" ? candidate : null;
}

export function payBurnkinHpForEnergy(
  state: unknown,
  rules: BurnkinProvisionalRules,
): BurnkinTransition {
  const canonical = snapshot(state);
  if (!canonical) return reject(state, "INVALID_STATE");
  if (!validRules(rules)) return reject(canonical, "INVALID_RULES");
  const next = actionState(canonical);
  if (!next) return reject(canonical, "INVALID_PHASE");
  const { hpCost, energyGain } = rules.hpToEnergy;
  if (next.player.hp <= hpCost) return reject(canonical, "INSUFFICIENT_HP");
  const energy = next.player.energy + energyGain;
  if (!Number.isSafeInteger(energy)) return reject(canonical, "CALCULATION_OVERFLOW");
  if (energy > next.rules.maxEnergy) return reject(canonical, "ENERGY_CAP_EXCEEDED");
  next.player.hp -= hpCost;
  next.player.energy = energy;
  return {
    ok: true,
    state: next,
    events: [
      { type: "BURNKIN_HP_PAID", amount: hpCost, remainingHp: next.player.hp },
      { type: "BURNKIN_ENERGY_GAINED", source: "PASSIVE", amount: energyGain, remaining: energy },
    ],
  };
}

export function kindleBurnkinCard(state: unknown, instanceId: unknown): BurnkinTransition {
  const canonical = snapshot(state);
  if (!canonical) return reject(state, "INVALID_STATE");
  const next = actionState(canonical);
  if (!next) return reject(canonical, "INVALID_PHASE");
  if (typeof instanceId !== "string" || instanceId.length === 0) return reject(canonical, "CARD_NOT_FOUND");
  const instance = next.instances.find((candidate) => candidate.instanceId === instanceId);
  if (!instance) return reject(canonical, "CARD_NOT_FOUND");
  if (!next.zones.hand.includes(instanceId)) return reject(canonical, "CARD_NOT_IN_HAND");
  const card = next.cards.find((candidate) => candidate.cardId === instance.cardId);
  if (!card || card.cost === null || !Number.isSafeInteger(card.cost) || card.cost < 0) {
    return reject(canonical, "CARD_COST_UNAVAILABLE");
  }
  const energy = next.player.energy + card.cost;
  if (!Number.isSafeInteger(energy)) return reject(canonical, "CALCULATION_OVERFLOW");
  if (energy > next.rules.maxEnergy) return reject(canonical, "ENERGY_CAP_EXCEEDED");
  next.player.energy = energy;
  next.zones.hand = next.zones.hand.filter((id) => id !== instanceId);
  next.zones.exile.push(instanceId);
  return {
    ok: true,
    state: next,
    events: [
      { type: "BURNKIN_CARD_KINDLED", instanceId, cardId: card.cardId, energyGained: card.cost },
      { type: "BURNKIN_ENERGY_GAINED", source: "KINDLE", amount: card.cost, remaining: energy },
    ],
  };
}

export function applyBurnkinResonanceBreak(
  state: unknown,
  from: ResonanceAttribute | null | unknown,
  to: ResonanceAttribute | null | unknown,
  rules: BurnkinProvisionalRules,
): BurnkinTransition {
  const next = snapshot(state);
  if (!next) return reject(state, "INVALID_STATE");
  if (!validRules(rules)) return reject(next, "INVALID_RULES");
  if (from === null || to === null || from === to) return { ok: true, state: next, events: [] };
  if (!validAttribute(from) || !validAttribute(to)) return reject(next, "INVALID_STATE");
  const damage = rules.resonanceBreakSelfDamage;
  next.player.hp = Math.max(0, next.player.hp - damage);
  if (next.player.hp === 0) {
    next.status = next.enemy.hp === 0 && next.rules.terminalPolicy === "VICTORY_FIRST" ? "VICTORY" : "DEFEAT";
    next.phase = "TERMINAL";
  }
  return {
    ok: true,
    state: next,
    events: [{
      type: "BURNKIN_RESONANCE_BROKEN",
      from,
      to,
      selfDamage: damage,
      remainingHp: next.player.hp,
    }],
  };
}
