import {
  COMBAT_EFFECT_IDS,
  COMBAT_ENGINE_VERSION,
  COMBAT_PRNG_VERSION,
  COMBAT_SCHEMA_VERSION,
  type CombatEffectId,
} from "./constants";
import { isResonanceAttribute, RESONANCE_ATTRIBUTES } from "../resonance";
import type {
  AtomicOperation,
  CombatRules,
  CombatSetup,
  CombatState,
  EffectProgram,
  EnemyIntent,
  OperationTarget,
  ValidationResult,
} from "./types";

const UINT32_MAX = 0xffff_ffff;
const SAFE_MAGNITUDE = Number.MAX_SAFE_INTEGER;

export function isCombatEffectId(value: unknown): value is CombatEffectId {
  return typeof value === "string" && COMBAT_EFFECT_IDS.some((effectId) => effectId === value);
}

export function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isFiniteNonnegative(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= SAFE_MAGNITUDE
  );
}

function isNonemptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function addUniqueErrors(values: readonly string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!isNonemptyId(value)) errors.push(`${label} must contain nonempty ids`);
    if (seen.has(value)) errors.push(`${label} must contain unique ids: ${value}`);
    seen.add(value);
  }
}

function validateRules(rules: CombatRules, errors: string[]): void {
  if (!isSafeCount(rules.maxEnergy)) errors.push("rules.maxEnergy must be a nonnegative safe integer");
  if (!isSafeCount(rules.drawCount)) errors.push("rules.drawCount must be a nonnegative safe integer");
  if (rules.resonanceRate !== null && !isFiniteNonnegative(rules.resonanceRate)) {
    errors.push("rules.resonanceRate must be null or finite and nonnegative");
  }
  if (!isSafeCount(rules.blockRetention.numerator)) {
    errors.push("blockRetention.numerator must be a nonnegative safe integer");
  }
  if (!Number.isSafeInteger(rules.blockRetention.denominator) || rules.blockRetention.denominator <= 0) {
    errors.push("blockRetention.denominator must be a positive safe integer");
  }
  if (
    isSafeCount(rules.blockRetention.numerator) &&
    Number.isSafeInteger(rules.blockRetention.denominator) &&
    rules.blockRetention.numerator > rules.blockRetention.denominator
  ) {
    errors.push("blockRetention factor must be between zero and one");
  }
  if (rules.blockRetention.rounding !== "FLOOR") errors.push("blockRetention.rounding must be FLOOR");
  if (rules.terminalPolicy !== "DEFEAT_FIRST" && rules.terminalPolicy !== "VICTORY_FIRST") {
    errors.push("rules.terminalPolicy is invalid");
  }
}

function validateCombatant(
  combatant: { hp: number; maxHp: number; block: number },
  label: string,
  errors: string[],
): void {
  if (!isFiniteNonnegative(combatant.maxHp) || combatant.maxHp <= 0) {
    errors.push(`${label}.maxHp must be finite and positive`);
  }
  if (!isFiniteNonnegative(combatant.hp) || combatant.hp > combatant.maxHp) {
    errors.push(`${label}.hp must be finite and between zero and maxHp`);
  }
  if (!isFiniteNonnegative(combatant.block)) errors.push(`${label}.block must be finite and nonnegative`);
}

function validateTarget(target: OperationTarget, enemyId: string, allowSelected: boolean, errors: string[]): void {
  if (target.kind === "PLAYER") return;
  if (target.kind === "ENEMY") {
    if (target.enemyId !== enemyId) errors.push(`operation enemy target does not match ${enemyId}`);
    return;
  }
  if (target.kind === "SELECTED" && allowSelected) return;
  errors.push("operation target is invalid in this program");
}

function validateOperation(
  operation: AtomicOperation,
  enemyId: string,
  allowSelected: boolean,
  allowEffectPower: boolean,
  errors: string[],
): void {
  if (!["DAMAGE", "GAIN_BLOCK", "HEAL"].includes(operation.kind)) {
    errors.push("unknown atomic operation");
    return;
  }
  validateTarget(operation.target, enemyId, allowSelected, errors);
  if (operation.amount.kind === "FIXED") {
    if (!isFiniteNonnegative(operation.amount.amount)) errors.push("fixed amount must be finite and nonnegative");
  } else if (operation.amount.kind === "EFFECT_POWER") {
    if (!allowEffectPower) errors.push("intent operations cannot reference effect power");
    if (!isFiniteNonnegative(operation.amount.multiplier)) {
      errors.push("effect power multiplier must be finite and nonnegative");
    }
  } else {
    errors.push("unknown amount expression");
  }
}

function validatePrograms(programs: readonly EffectProgram[], enemyId: string, errors: string[]): void {
  addUniqueErrors(programs.map((program) => program.effectId), "program effect ids", errors);
  for (const program of programs) {
    if (!isCombatEffectId(program.effectId)) errors.push(`unknown program effect id: ${program.effectId}`);
    if (!["DISCARD", "EXILE"].includes(program.playedCardDestination)) {
      errors.push(`invalid played card destination: ${program.effectId}`);
    }
    if (
      program.targetRule.kind !== "NONE" &&
      !(
        program.targetRule.kind === "REQUIRED" &&
        ["PLAYER", "ENEMY", "EITHER"].includes(program.targetRule.allowed)
      )
    ) {
      errors.push(`invalid target rule: ${program.effectId}`);
    }
    for (const operation of program.operations) {
      validateOperation(operation, enemyId, program.targetRule.kind === "REQUIRED", true, errors);
    }
  }
}

function validateIntents(intents: readonly EnemyIntent[], enemyId: string, errors: string[]): void {
  if (intents.length === 0) errors.push("enemy must have at least one intent");
  addUniqueErrors(intents.map((intent) => intent.intentId), "enemy intent ids", errors);
  for (const intent of intents) {
    if (typeof intent.labelKo !== "string" || !/[\uac00-\ud7a3]/.test(intent.labelKo.trim())) {
      errors.push(`intent label must be nonempty Korean text: ${intent.intentId}`);
    }
    if (!["ATTACK", "DEFEND", "SPECIAL"].includes(intent.telegraph)) {
      errors.push(`invalid intent telegraph: ${intent.intentId}`);
    }
    if (intent.displayAmount !== null && !isFiniteNonnegative(intent.displayAmount)) {
      errors.push(`intent displayAmount must be null or finite and nonnegative: ${intent.intentId}`);
    }
    for (const operation of intent.program.operations) {
      validateOperation(operation, enemyId, false, false, errors);
    }
  }
}

function validateCatalog(
  cards: CombatSetup["cards"],
  instances: CombatSetup["instances"],
  errors: string[],
): void {
  addUniqueErrors(cards.map((card) => card.cardId), "card ids", errors);
  addUniqueErrors(instances.map((instance) => instance.instanceId), "instance ids", errors);
  const cardIds = new Set(cards.map((card) => card.cardId));
  for (const card of cards) {
    if (!isCombatEffectId(card.effectId)) errors.push(`unknown card effect id: ${card.cardId}`);
    if (!isSafeCount(card.cost)) errors.push(`card cost must be a nonnegative safe integer: ${card.cardId}`);
    if (!isFiniteNonnegative(card.power)) errors.push(`card power must be finite and nonnegative: ${card.cardId}`);
    if (card.resonanceAttribute !== null && !isResonanceAttribute(card.resonanceAttribute)) {
      errors.push(`card resonanceAttribute is invalid: ${card.cardId}`);
    }
  }
  for (const instance of instances) {
    if (!cardIds.has(instance.cardId)) errors.push(`instance references unknown card: ${instance.instanceId}`);
  }
}

export function validateCombatSetup(setup: CombatSetup): ValidationResult {
  const errors: string[] = [];
  if (!Number.isSafeInteger(setup.seed) || setup.seed < 0 || setup.seed > UINT32_MAX) {
    errors.push("seed must be a uint32");
  }
  validateRules(setup.rules, errors);
  validateCombatant(setup.player, "player", errors);
  validateCombatant(setup.enemy, "enemy", errors);
  if (setup.player.hp <= 0) errors.push("player.hp must be positive at combat setup");
  if (setup.enemy.hp <= 0) errors.push("enemy.hp must be positive at combat setup");
  validateCatalog(setup.cards, setup.instances, errors);
  validatePrograms(setup.programs, setup.enemy.enemyId, errors);
  validateIntents(setup.enemy.intents, setup.enemy.enemyId, errors);
  if (!isNonemptyId(setup.enemy.enemyId)) errors.push("enemy.enemyId must be nonempty");
  if (
    !Number.isSafeInteger(setup.enemy.initialIntentIndex) ||
    setup.enemy.initialIntentIndex < 0 ||
    setup.enemy.initialIntentIndex >= setup.enemy.intents.length
  ) {
    errors.push("enemy.initialIntentIndex is out of range");
  }
  addUniqueErrors(setup.deck, "initial deck", errors);
  const instanceIds = new Set(setup.instances.map((instance) => instance.instanceId));
  for (const instanceId of setup.deck) {
    if (!instanceIds.has(instanceId)) errors.push(`initial deck references unknown instance: ${instanceId}`);
  }
  for (const instanceId of instanceIds) {
    if (!setup.deck.includes(instanceId)) errors.push(`instance is absent from initial deck: ${instanceId}`);
  }
  return { valid: errors.length === 0, errors };
}

function validateTypedCombatState(state: CombatState): ValidationResult {
  const errors: string[] = [];
  if (state.schemaVersion !== COMBAT_SCHEMA_VERSION) errors.push("combat schema version mismatch");
  if (state.engineVersion !== COMBAT_ENGINE_VERSION) errors.push("combat engine version mismatch");
  if (state.prngVersion !== COMBAT_PRNG_VERSION) errors.push("combat prng version mismatch");
  if (!["TURN_READY", "START_TURN", "PLAYER_ACTION", "END_TURN"].includes(state.phase)) {
    errors.push("combat phase is invalid");
  }
  if (!["ONGOING", "VICTORY", "DEFEAT"].includes(state.status)) errors.push("combat status is invalid");
  if (!isSafeCount(state.turn)) errors.push("turn must be a nonnegative safe integer");
  if (!Number.isSafeInteger(state.randomState) || state.randomState < 0 || state.randomState > UINT32_MAX) {
    errors.push("randomState must be a uint32");
  }
  validateRules(state.rules, errors);
  validateCombatant(state.player, "player", errors);
  if (!isSafeCount(state.player.energy) || state.player.energy > state.rules.maxEnergy) {
    errors.push("player.energy must be a safe integer within maxEnergy");
  }
  validateCombatant(state.enemy, "enemy", errors);
  validateCatalog(state.cards, state.instances, errors);
  validatePrograms(state.programs, state.enemy.enemyId, errors);
  validateIntents(state.enemy.intents, state.enemy.enemyId, errors);
  if (!isNonemptyId(state.enemy.enemyId)) errors.push("enemy.enemyId must be nonempty");
  if (
    !Number.isSafeInteger(state.enemy.currentIntentIndex) ||
    state.enemy.currentIntentIndex < 0 ||
    state.enemy.currentIntentIndex >= state.enemy.intents.length
  ) {
    errors.push("enemy.currentIntentIndex is out of range");
  }

  const allZoneIds = [
    ...state.zones.deck,
    ...state.zones.hand,
    ...state.zones.discard,
    ...state.zones.exile,
  ];
  const knownInstances = new Set(state.instances.map((instance) => instance.instanceId));
  for (const instanceId of allZoneIds) {
    if (!knownInstances.has(instanceId)) errors.push(`zone references unknown instance: ${instanceId}`);
  }
  for (const instanceId of knownInstances) {
    const occurrences = allZoneIds.filter((candidate) => candidate === instanceId).length;
    if (occurrences !== 1) errors.push(`instance must occur in exactly one zone: ${instanceId}`);
  }

  const active = state.resonance.activeAttribute;
  if (active !== null && !isResonanceAttribute(active)) errors.push("active resonance attribute is invalid");
  for (const attribute of RESONANCE_ATTRIBUTES) {
    const streak = state.resonance.streakByAttribute[attribute];
    if (!isSafeCount(streak)) errors.push(`resonance streak is invalid: ${attribute}`);
    if (active === attribute && streak < 1) errors.push(`active resonance streak must be positive: ${attribute}`);
    if (active !== attribute && streak !== 0) errors.push(`inactive resonance streak must be zero: ${attribute}`);
  }
  if (active === null && RESONANCE_ATTRIBUTES.some((attribute) => state.resonance.streakByAttribute[attribute] !== 0)) {
    errors.push("inactive resonance must have zero streaks");
  }
  const playerDead = state.player.hp <= 0;
  const enemyDead = state.enemy.hp <= 0;
  const expectedStatus =
    playerDead && enemyDead
      ? state.rules.terminalPolicy === "DEFEAT_FIRST"
        ? "DEFEAT"
        : "VICTORY"
      : playerDead
        ? "DEFEAT"
        : enemyDead
          ? "VICTORY"
          : "ONGOING";
  if (state.status !== expectedStatus) errors.push(`combat status must be ${expectedStatus} for current HP`);
  return { valid: errors.length === 0, errors };
}

export function validateCombatState(candidate: unknown): ValidationResult {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { valid: false, errors: ["combat state must be an object"] };
  }
  try {
    return validateTypedCombatState(candidate as CombatState);
  } catch {
    return { valid: false, errors: ["combat state structure is invalid"] };
  }
}
