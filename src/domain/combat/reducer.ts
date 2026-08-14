import {
  advanceResonance,
  calculateResonantPower,
  currentResonanceStreak,
} from "../resonance";
import { cloneCombatState } from "./clone";
import { applyOperations } from "./operations";
import { drawCards } from "./prng";
import type {
  CombatCommand,
  CombatEvent,
  CombatResult,
  CombatState,
  CombatTarget,
  EffectProgram,
  RejectionReason,
} from "./types";
import { validateCombatState } from "./validation";

function reject(state: CombatState, command: CombatCommand, reason: RejectionReason): CombatResult {
  return {
    state: cloneCombatState(state),
    events: [{ type: "COMMAND_REJECTED", command: command.type, reason }],
  };
}

function terminalStatus(state: CombatState): "VICTORY" | "DEFEAT" | null {
  const playerDead = state.player.hp <= 0;
  const enemyDead = state.enemy.hp <= 0;
  if (!playerDead && !enemyDead) return null;
  if (playerDead && enemyDead) {
    return state.rules.terminalPolicy === "DEFEAT_FIRST" ? "DEFEAT" : "VICTORY";
  }
  return playerDead ? "DEFEAT" : "VICTORY";
}

function finishIfTerminal(state: CombatState, events: CombatEvent[]): boolean {
  const status = terminalStatus(state);
  if (status === null) return false;
  state.status = status;
  events.push({ type: "COMBAT_ENDED", status });
  return true;
}

function validateTarget(
  program: EffectProgram,
  target: CombatTarget | null,
  enemyId: string,
): RejectionReason | null {
  if (program.targetRule.kind === "NONE") return target === null ? null : "TARGET_NOT_ALLOWED";
  if (target === null) return "TARGET_REQUIRED";
  if (target.kind === "ENEMY" && target.enemyId !== enemyId) return "TARGET_ENEMY_MISMATCH";
  if (program.targetRule.allowed === "PLAYER" && target.kind !== "PLAYER") return "TARGET_NOT_ALLOWED";
  if (program.targetRule.allowed === "ENEMY" && target.kind !== "ENEMY") return "TARGET_NOT_ALLOWED";
  return null;
}

function startTurn(original: CombatState, state: CombatState, command: CombatCommand): CombatResult {
  if (state.turn === Number.MAX_SAFE_INTEGER) {
    return reject(original, command, "CALCULATION_OVERFLOW");
  }
  const events: CombatEvent[] = [];
  state.phase = "START_TURN";
  events.push({ type: "PHASE_CHANGED", phase: "START_TURN" });
  state.turn += 1;
  state.player.energy = state.rules.maxEnergy;
  events.push({ type: "TURN_STARTED", turn: state.turn, energy: state.player.energy });
  drawCards(state, state.rules.drawCount, events);
  state.phase = "PLAYER_ACTION";
  events.push({ type: "PHASE_CHANGED", phase: "PLAYER_ACTION" });
  return { state, events };
}

function playCard(
  original: CombatState,
  state: CombatState,
  command: Extract<CombatCommand, { type: "PLAY_CARD" }>,
): CombatResult {
  const instance = state.instances.find((candidate) => candidate.instanceId === command.instanceId);
  if (!instance) return reject(original, command, "CARD_NOT_FOUND");
  if (!state.zones.hand.includes(instance.instanceId)) return reject(original, command, "CARD_NOT_IN_HAND");
  const card = state.cards.find((candidate) => candidate.cardId === instance.cardId);
  if (!card) return reject(original, command, "CARD_NOT_FOUND");
  const program = state.programs.find((candidate) => candidate.effectId === card.effectId);
  if (!program) return reject(original, command, "EFFECT_PROGRAM_UNAVAILABLE");
  if (card.resonanceAttribute === null) return reject(original, command, "RESONANCE_ATTRIBUTE_REQUIRED");
  if (
    !Number.isSafeInteger(card.cost) ||
    card.cost < 0 ||
    !Number.isFinite(card.power) ||
    card.power < 0 ||
    card.power > Number.MAX_SAFE_INTEGER
  ) {
    return reject(original, command, "INVALID_CARD_NUMERIC");
  }
  if (card.cost > state.player.energy) return reject(original, command, "INSUFFICIENT_ENERGY");
  const targetFailure = validateTarget(program, command.target, state.enemy.enemyId);
  if (targetFailure) return reject(original, command, targetFailure);

  const nextResonance = advanceResonance(state.resonance, card.resonanceAttribute);
  const calculation = calculateResonantPower(
    card.power,
    currentResonanceStreak(nextResonance),
    state.rules.resonanceRate,
  );
  if (!calculation.ok) {
    const reason =
      calculation.reason === "INVALID_RESONANCE_RATE"
        ? "INVALID_RESONANCE_RATE"
        : calculation.reason === "INVALID_POWER" || calculation.reason === "INVALID_STREAK"
          ? "INVALID_CARD_NUMERIC"
          : "CALCULATION_OVERFLOW";
    return reject(original, command, reason);
  }

  const events: CombatEvent[] = [];
  state.player.energy -= card.cost;
  state.resonance = nextResonance;
  events.push({ type: "ENERGY_SPENT", amount: card.cost, remaining: state.player.energy });
  events.push({
    type: "RESONANCE_ADVANCED",
    attribute: card.resonanceAttribute,
    streak: currentResonanceStreak(nextResonance),
  });
  events.push({
    type: "CARD_PLAYED",
    instanceId: instance.instanceId,
    cardId: card.cardId,
    effectId: card.effectId,
    effectivePower: calculation.value,
  });
  const operationResult = applyOperations(
    state,
    program.operations,
    { source: "CARD", selectedTarget: command.target, effectivePower: calculation.value },
    events,
  );
  if (!operationResult.ok) return reject(original, command, operationResult.reason);

  state.zones.hand = state.zones.hand.filter((id) => id !== instance.instanceId);
  state.zones[program.playedCardDestination === "DISCARD" ? "discard" : "exile"].push(instance.instanceId);
  events.push({
    type: "CARD_MOVED",
    instanceId: instance.instanceId,
    from: "HAND",
    to: program.playedCardDestination,
  });
  finishIfTerminal(state, events);
  return { state, events };
}

function retainedBlock(state: CombatState): number | null {
  const product = state.player.block * state.rules.blockRetention.numerator;
  if (!Number.isFinite(product) || Math.abs(product) > Number.MAX_SAFE_INTEGER) return null;
  const retained = Math.floor(product / state.rules.blockRetention.denominator);
  return Number.isFinite(retained) && retained <= Number.MAX_SAFE_INTEGER ? retained : null;
}

function endTurn(original: CombatState, state: CombatState, command: CombatCommand): CombatResult {
  const events: CombatEvent[] = [];
  state.phase = "END_TURN";
  events.push({ type: "PHASE_CHANGED", phase: "END_TURN" });

  const discarded = [...state.zones.hand];
  state.zones.hand = [];
  state.zones.discard.push(...discarded);
  events.push({ type: "HAND_DISCARDED", instanceIds: discarded });

  const expiredBlock = state.enemy.block;
  state.enemy.block = 0;
  events.push({ type: "ENEMY_BLOCK_EXPIRED", amount: expiredBlock });

  const intent = state.enemy.intents[state.enemy.currentIntentIndex];
  events.push({ type: "ENEMY_INTENT_EXECUTED", intentId: intent.intentId });
  const operationResult = applyOperations(
    state,
    intent.program.operations,
    { source: "ENEMY_INTENT", selectedTarget: null, effectivePower: null },
    events,
  );
  if (!operationResult.ok) return reject(original, command, operationResult.reason);
  if (finishIfTerminal(state, events)) return { state, events };

  const before = state.player.block;
  const after = retainedBlock(state);
  if (after === null) return reject(original, command, "CALCULATION_OVERFLOW");
  state.player.block = after;
  events.push({ type: "PLAYER_BLOCK_RETAINED", before, after });

  state.enemy.currentIntentIndex =
    (state.enemy.currentIntentIndex + 1) % state.enemy.intents.length;
  events.push({
    type: "ENEMY_INTENT_ROTATED",
    intentId: state.enemy.intents[state.enemy.currentIntentIndex].intentId,
  });
  events.push({ type: "TURN_ENDED", turn: state.turn });
  state.phase = "TURN_READY";
  events.push({ type: "PHASE_CHANGED", phase: "TURN_READY" });
  return { state, events };
}

export function reduceCombat(input: CombatState, command: CombatCommand): CombatResult {
  const validation = validateCombatState(input);
  if (!validation.valid) return reject(input, command, "INVALID_STATE");
  if (input.status !== "ONGOING") return reject(input, command, "TERMINAL_COMBAT");

  const expectedPhase =
    command.type === "START_TURN" ? "TURN_READY" : "PLAYER_ACTION";
  if (input.phase !== expectedPhase) return reject(input, command, "INVALID_PHASE");

  const state = cloneCombatState(input);
  if (command.type === "START_TURN") return startTurn(input, state, command);
  if (command.type === "PLAY_CARD") return playCard(input, state, command);
  return endTurn(input, state, command);
}
