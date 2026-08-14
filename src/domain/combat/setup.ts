import { createResonanceState } from "../resonance";
import { cloneCombatSetup } from "./clone";
import { COMBAT_ENGINE_VERSION, COMBAT_PRNG_VERSION, COMBAT_SCHEMA_VERSION } from "./constants";
import type { CombatSetup, CombatState } from "./types";
import { validateCombatSetup } from "./validation";

export class CombatValidationError extends Error {
  readonly errors: string[];

  constructor(errors: readonly string[]) {
    super(`Invalid combat setup: ${errors.join("; ")}`);
    this.name = "CombatValidationError";
    this.errors = [...errors];
  }
}

export function createCombatState(input: CombatSetup): CombatState {
  const setup = cloneCombatSetup(input);
  const validation = validateCombatSetup(setup);
  if (!validation.valid) throw new CombatValidationError(validation.errors);

  return {
    schemaVersion: COMBAT_SCHEMA_VERSION,
    engineVersion: COMBAT_ENGINE_VERSION,
    prngVersion: COMBAT_PRNG_VERSION,
    phase: "TURN_READY",
    status: "ONGOING",
    turn: 0,
    randomState: setup.seed,
    rules: setup.rules,
    player: { ...setup.player, energy: 0 },
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
