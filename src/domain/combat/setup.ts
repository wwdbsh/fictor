import { createResonanceState } from "../resonance";
import { COMBAT_ENGINE_VERSION, COMBAT_PRNG_VERSION, COMBAT_SCHEMA_VERSION } from "./constants";
import type { CombatSetup, CombatState } from "./types";
import { decodeCombatSetup } from "./validation";

export class CombatValidationError extends Error {
  readonly errors: string[];

  constructor(errors: readonly string[]) {
    super(`Invalid combat setup: ${errors.join("; ")}`);
    this.name = "CombatValidationError";
    this.errors = [...errors];
  }
}

export function createCombatState(input: CombatSetup): CombatState;
export function createCombatState(input: unknown): CombatState;
export function createCombatState(input: unknown): CombatState {
  const decoded = decodeCombatSetup(input);
  if (!decoded.valid) throw new CombatValidationError(decoded.errors);
  return createStateFromDecoded(decoded.value);
}

export function createStateFromDecoded(setup: CombatSetup): CombatState {
  return {
    schemaVersion: COMBAT_SCHEMA_VERSION,
    engineVersion: COMBAT_ENGINE_VERSION,
    prngVersion: COMBAT_PRNG_VERSION,
    phase: "TURN_READY",
    status: "ONGOING",
    turn: 0,
    randomState: setup.seed,
    rules: setup.rules,
    player: { hp: setup.player.hp, maxHp: setup.player.maxHp, block: setup.player.block, energy: 0 },
    enemy: {
      hp: setup.enemy.hp,
      maxHp: setup.enemy.maxHp,
      block: setup.enemy.block,
      enemyId: setup.enemy.enemyId,
      intents: setup.enemy.intents,
      currentIntentIndex: setup.enemy.initialIntentIndex,
    },
    cards: setup.cards,
    instances: setup.instances,
    programs: setup.programs,
    zones: { deck: setup.deck, hand: [], discard: [], exile: [] },
    resonance: createResonanceState(),
  };
}
