import { describe, expect, it } from "vitest";

import {
  COMBAT_EFFECT_IDS,
  CombatValidationError,
  createCombatState,
  validateCombatSetup,
  validateCombatState,
  type CombatEffectId,
} from "../../src/domain";
import laws from "../../src/data/source/laws.json";
import { fixtureSetup, jsonClone } from "./fixtures";

describe("combat runtime boundary", () => {
  it("owns exactly the canonical 21 combat effect ids", () => {
    const lawIds = laws.map((law) => law.combat_effect);
    expect(COMBAT_EFFECT_IDS).toHaveLength(21);
    expect(new Set(COMBAT_EFFECT_IDS).size).toBe(21);
    expect([...COMBAT_EFFECT_IDS].sort()).toEqual([...lawIds].sort());
  });

  it("rejects duplicate instances, unknown cards, and unknown effects at setup", () => {
    const duplicate = fixtureSetup();
    duplicate.instances[1].instanceId = duplicate.instances[0].instanceId;
    expect(validateCombatSetup(duplicate).errors).toContain(
      `instance ids must contain unique ids: ${duplicate.instances[0].instanceId}`,
    );

    const unknownCard = fixtureSetup();
    unknownCard.instances[0].cardId = "absent";
    expect(validateCombatSetup(unknownCard).errors.join("\n")).toContain("unknown card");

    const unknownEffect = fixtureSetup();
    unknownEffect.cards[0].effectId = "NOT_A_LAW" as CombatEffectId;
    expect(() => createCombatState(unknownEffect)).toThrow(CombatValidationError);
  });

  it("accepts duplicate card ids across instances while requiring unique instance ids", () => {
    const setup = fixtureSetup();
    setup.instances[1].cardId = setup.instances[0].cardId;
    expect(validateCombatSetup(setup)).toEqual({ valid: true, errors: [] });
  });

  it("detects orphan, missing, and multi-zone instances", () => {
    const state = createCombatState(fixtureSetup());
    state.zones.hand.push("orphan");
    state.zones.hand.push(state.zones.deck[0]);
    state.zones.deck.pop();
    const removed = state.zones.deck.pop()!;
    const validation = validateCombatState(state);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join("\n")).toContain("zone references unknown instance: orphan");
    expect(validation.errors.join("\n")).toContain("exactly one zone");
    expect(validation.errors.join("\n")).toContain(removed);
  });

  it("rejects duplicate intent ids, non-Korean labels, and invalid numerics", () => {
    const setup = fixtureSetup();
    setup.enemy.intents[1].intentId = setup.enemy.intents[0].intentId;
    setup.enemy.intents[0].labelKo = "attack";
    setup.enemy.intents[0].displayAmount = Number.NaN;
    setup.rules.maxEnergy = 1.5;
    setup.rules.blockRetention = { numerator: 2, denominator: 1, rounding: "FLOOR" };
    const errors = validateCombatSetup(setup).errors.join("\n");
    expect(errors).toContain("enemy intent ids must contain unique ids");
    expect(errors).toContain("Korean text");
    expect(errors).toContain("displayAmount");
    expect(errors).toContain("maxEnergy");
    expect(errors).toContain("between zero and one");
  });

  it("allows a partial program registry but rejects duplicate program ids", () => {
    const partial = fixtureSetup();
    partial.programs = [partial.programs[0]];
    expect(validateCombatSetup(partial).valid).toBe(true);

    const duplicate = fixtureSetup();
    duplicate.programs.push(jsonClone(duplicate.programs[0]));
    expect(validateCombatSetup(duplicate).errors.join("\n")).toContain(
      "program effect ids must contain unique ids",
    );
  });

  it("exports a T024-safe validation seam for atomic deserialized replacement", () => {
    const state = createCombatState(fixtureSetup());
    const replacement = jsonClone(state);
    expect(validateCombatState(replacement)).toEqual({ valid: true, errors: [] });
    replacement.player.energy = replacement.rules.maxEnergy + 1;
    expect(validateCombatState(replacement).valid).toBe(false);
    expect(validateCombatState({ schemaVersion: "combat-state-v2" }).valid).toBe(false);
  });

  it("keeps effect ids typed as the exact literal union", () => {
    const everyId: CombatEffectId[] = [...COMBAT_EFFECT_IDS];
    expect(everyId).toEqual(COMBAT_EFFECT_IDS);
  });
});
